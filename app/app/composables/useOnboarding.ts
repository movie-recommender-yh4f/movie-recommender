interface OnboardingStatusResponse {
  completed: boolean
  completedAt: string | null
}

interface CompleteOnboardingResponse extends OnboardingStatusResponse {
  success: boolean
}

interface OnboardingStatusFetchOptions {
  accessToken?: string
  force?: boolean
}

const ONBOARDING_STATUS_LOADED_STATE_KEY = 'onboarding-status-loaded'

let onboardingStatusRequest: Promise<OnboardingStatusResponse | null> | null = null

function isOnboardingStatusResponse(value: unknown): value is OnboardingStatusResponse {
  if (!value || typeof value !== 'object') {
    return false
  }

  const status = value as Record<string, unknown>

  return (
    typeof status.completed === 'boolean' &&
    (typeof status.completedAt === 'string' || status.completedAt === null)
  )
}

function isCompleteOnboardingResponse(value: unknown): value is CompleteOnboardingResponse {
  if (!isOnboardingStatusResponse(value)) {
    return false
  }

  return typeof (value as unknown as Record<string, unknown>).success === 'boolean'
}

export function useOnboarding() {
  const supabase = useSupabase()
  const completed = useState<boolean | null>('onboarding-completed', () => null)
  const completedAt = useState<string | null>('onboarding-completed-at', () => null)
  const pending = useState('onboarding-pending', () => false)
  const error = useState<string | null>('onboarding-error', () => null)
  const hasLoadedStatus = useState<boolean>(ONBOARDING_STATUS_LOADED_STATE_KEY, () => false)
  const hasResolved = computed(() => completed.value !== null)
  const isOnboardingComplete = computed(() => completed.value === true)

  function buildCachedStatus(): OnboardingStatusResponse | null {
    if (!hasLoadedStatus.value || completed.value === null) {
      return null
    }

    return {
      completed: completed.value,
      completedAt: completedAt.value,
    }
  }

  function normalizeFetchStatusOptions(
    options?: string | OnboardingStatusFetchOptions
  ): OnboardingStatusFetchOptions {
    if (typeof options === 'string') {
      return { accessToken: options }
    }

    return options ?? {}
  }

  function clearStatus() {
    completed.value = null
    completedAt.value = null
    error.value = null
    pending.value = false
    hasLoadedStatus.value = false
    onboardingStatusRequest = null
  }

  async function fetchStatus(
    options?: string | OnboardingStatusFetchOptions
  ): Promise<OnboardingStatusResponse | null> {
    const { accessToken, force = false } = normalizeFetchStatusOptions(options)
    const cachedStatus = buildCachedStatus()

    if (!force && cachedStatus) {
      return cachedStatus
    }

    if (onboardingStatusRequest) {
      return onboardingStatusRequest
    }

    pending.value = true
    error.value = null

    onboardingStatusRequest = (async () => {
      try {
        const token = await resolveAccessToken(supabase, accessToken)

        if (!token) {
          clearStatus()
          return null
        }

        const response = await $fetch<unknown>('/api/onboarding/status', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!isOnboardingStatusResponse(response)) {
          throw new Error('Onboarding status response was invalid.')
        }

        completed.value = response.completed
        completedAt.value = response.completedAt
        hasLoadedStatus.value = true

        return response
      } catch (caughtError) {
        completed.value = null
        completedAt.value = null
        hasLoadedStatus.value = false
        error.value =
          caughtError instanceof Error ? caughtError.message : 'Unable to load onboarding status.'
        return null
      } finally {
        pending.value = false
        onboardingStatusRequest = null
      }
    })()

    return onboardingStatusRequest
  }

  async function completeOnboarding(
    tmdbIds: number[],
    accessToken?: string
  ): Promise<CompleteOnboardingResponse | null> {
    pending.value = true
    error.value = null

    try {
      const token = await resolveAccessToken(supabase, accessToken)

      if (!token) {
        clearStatus()
        return null
      }

      const response = await $fetch<unknown>('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: {
          tmdbIds,
        },
      })

      if (!isCompleteOnboardingResponse(response)) {
        throw new Error('Onboarding completion response was invalid.')
      }

      completed.value = response.completed
      completedAt.value = response.completedAt
      hasLoadedStatus.value = true

      return response
    } catch (caughtError) {
      error.value =
        caughtError instanceof Error ? caughtError.message : 'Unable to complete onboarding.'
      return null
    } finally {
      pending.value = false
    }
  }

  return {
    completed,
    completedAt,
    pending,
    error,
    hasResolved,
    isOnboardingComplete,
    fetchStatus,
    completeOnboarding,
    clearStatus,
  }
}
