import { ref, computed } from 'vue'
import type { User, AuthError, Session } from '@supabase/supabase-js'

export const EMAIL_ALREADY_REGISTERED_CODE = 'EMAIL_ALREADY_REGISTERED'

const user = ref<User | null>(null)
const session = ref<Session | null>(null)
const loading = ref(true)
const AUTH_SYNC_DEFER_MS = 0

let hasInitializedAuth = false
let authStateSubscription: { unsubscribe: () => void } | null = null
let pendingAuthSyncTimeout: ReturnType<typeof setTimeout> | null = null

interface SignupApiResponse {
  user: User | null
  session: Session | null
}

interface SignupError extends Error {
  code?: typeof EMAIL_ALREADY_REGISTERED_CODE
}

interface LogoutOptions {
  scope?: 'global' | 'local'
}

function toSignupError(error: unknown): SignupError {
  const errorData =
    typeof error === 'object' && error !== null
      ? (error as { data?: { data?: { code?: unknown }; statusMessage?: unknown } }).data
      : undefined
  const message =
    typeof errorData?.statusMessage === 'string' ? errorData.statusMessage : 'Something went wrong.'
  const signupError = new Error(message) as SignupError
  const code =
    typeof errorData?.data?.code === 'string' ? errorData.data.code : undefined

  if (code === EMAIL_ALREADY_REGISTERED_CODE) {
    signupError.code = EMAIL_ALREADY_REGISTERED_CODE
  }

  return signupError
}

export const useAuth = () => {
  const supabase = useSupabase()
  const { clearSessionRecommendations } = useRecommendationSession()
  const { syncWatchedMoviesFromSupabase, processPendingWatchedMovies, clearWatchedMovies } =
    useWatchedMovies()
  const { syncMyListFromSupabase, processPendingMyListMovies, clearMyList } = useMyList()
  const { fetchStatus, clearStatus } = useOnboarding()

  const isAuthenticated = computed(() => !!user.value)
  const userEmail = computed(() => user.value?.email || '')

  const resetClientState = () => {
    user.value = null
    session.value = null
    clearStatus()
    clearWatchedMovies()
    clearMyList()
    clearSessionRecommendations()
  }

  const scheduleSavedMovieStateSyncAfterAuth = (accessToken?: string) => {
    if (pendingAuthSyncTimeout) {
      clearTimeout(pendingAuthSyncTimeout)
    }

    pendingAuthSyncTimeout = setTimeout(() => {
      pendingAuthSyncTimeout = null
      void syncSavedMovieStateAfterAuth(accessToken)
    }, AUTH_SYNC_DEFER_MS)
  }

  const syncSavedMovieStateAfterAuth = async (accessToken?: string) => {
    if (!accessToken) {
      clearStatus()
      clearWatchedMovies()
      clearMyList()
      return
    }

    const onboardingStatus = await fetchStatus(accessToken)
    if (!onboardingStatus?.completed) {
      clearWatchedMovies()
      clearMyList()
      return
    }

    const processedWatchedMovies = await processPendingWatchedMovies(accessToken)
    const processedMyListMovies = await processPendingMyListMovies(accessToken)

    if (processedWatchedMovies > 0) {
      await syncWatchedMoviesFromSupabase({ accessToken, force: true })
    }

    if (processedMyListMovies > 0) {
      await syncMyListFromSupabase({ accessToken, force: true })
    }
  }

  const login = async (email: string, password: string, captchaToken?: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaToken ? { captchaToken } : undefined,
      })

      if (error) throw error

      user.value = data.user
      session.value = data.session

      await syncSavedMovieStateAfterAuth(data.session?.access_token)

      return { user: data.user }
    } catch (error) {
      return { user: null, error: error as AuthError }
    }
  }

  const signup = async (
    email: string,
    password: string,
    username?: string,
    captchaToken?: string
  ) => {
    try {
      const data = await $fetch<SignupApiResponse>('/api/auth/signup', {
        method: 'POST',
        body: {
          email,
          password,
          username,
          captchaToken,
        },
      })

      if (data.session) {
        const { data: sessionData, error } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        })

        if (error) throw error

        user.value = sessionData.user
        session.value = sessionData.session
      }

      await syncSavedMovieStateAfterAuth(data.session?.access_token ?? undefined)

      return { user: data.user }
    } catch (error) {
      return { user: null, error: toSignupError(error) }
    }
  }

  const logout = async (options?: LogoutOptions) => {
    try {
      const { error } = await supabase.auth.signOut(options)

      if (error) throw error

      resetClientState()
    } catch {}
  }

  const resetPassword = async (email: string) => {
    try {
      const { data: _data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      })

      if (error) throw error

      return { error: null }
    } catch (error) {
      return { error: error as AuthError }
    }
  }

  const verifyPasswordResetOtp = async (email: string, token: string) => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'recovery',
      })

      if (error) throw error

      user.value = data.user
      session.value = data.session

      return { user: data.user, session: data.session }
    } catch (error) {
      return { user: null, session: null, error: error as AuthError }
    }
  }

  const updatePassword = async (newPassword: string, currentPassword?: string) => {
    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
        ...(currentPassword ? { current_password: currentPassword } : {}),
      })
      if (error) throw error
      return { user: data.user }
    } catch (error) {
      return { user: null, error: error as AuthError }
    }
  }

  const initialize = async () => {
    if (hasInitializedAuth) {
      loading.value = false
      return
    }

    try {
      loading.value = true
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession()

      session.value = currentSession
      user.value = currentSession?.user || null
      scheduleSavedMovieStateSyncAfterAuth(currentSession?.access_token)

      if (!authStateSubscription) {
        const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
          session.value = newSession
          user.value = newSession?.user || null
          scheduleSavedMovieStateSyncAfterAuth(newSession?.access_token)
        })

        authStateSubscription = data.subscription
      }

      hasInitializedAuth = true
    } catch {
      hasInitializedAuth = false
    } finally {
      loading.value = false
    }
  }

  const signInWithGoogle = async () => {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      })

      if (error) throw error

      return { user: data }
    } catch {
      // OAuth sign-in errors are surfaced by the caller through an undefined result.
    }
  }

  const setCurrentUser = (updatedUser: User | null) => {
    user.value = updatedUser
  }

  return {
    user: computed(() => user.value),
    session: computed(() => session.value),
    loading: computed(() => loading.value),
    isAuthenticated,
    userEmail,
    login,
    signup,
    initialize,
    logout,
    signInWithGoogle,
    resetPassword,
    verifyPasswordResetOtp,
    updatePassword,
    setCurrentUser,
    resetClientState,
  }
}
