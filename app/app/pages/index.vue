<template>
  <div class="relative flex h-full flex-col overflow-hidden bg-background text-on-background">
    <div
      class="flex h-full flex-col px-4 pb-[var(--footer-clearance,0.85rem)] pt-4 sm:px-6 sm:pt-5 lg:px-8"
    >
      <div v-if="recommendationsPending" class="flex min-h-0 flex-1 items-center justify-center">
        <FilmReelLoader />
      </div>

      <div
        v-else-if="!isAuthenticated"
        class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pt-16 text-center text-on-surface-variant"
      >
        <p class="mb-2 text-2xl font-semibold text-on-background">Sign in to get recommendations</p>
        <p class="mb-8 text-[12px] uppercase tracking-[0.24em] text-on-surface-variant">
          We'll suggest movies based on what you've watched.
        </p>
        <button
          class="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-on-primary transition-colors hover:bg-primary/90"
          @click="showLoginModal = true"
        >
          Sign in
        </button>
      </div>

      <div
        v-else-if="showBlockingRecommendationFailure"
        class="mx-auto max-w-md pt-16 text-center text-on-surface-variant"
      >
        <p v-if="isLimitReachedFailure" class="mb-2 text-2xl font-semibold text-on-background">
          Daily limit reached
        </p>
        <AlertMessage type="error" :message="recommendationFailureMessage" />
        <div
          v-if="showRecommendationFailureActions"
          class="mt-6 flex items-center justify-center gap-3"
        >
          <button
            v-if="canLoadPreviousRecommendations"
            class="inline-flex items-center gap-2 rounded-full border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:border-primary/40 hover:text-on-background disabled:opacity-50"
            :disabled="pending"
            @click="loadPreviousRecommendations"
          >
            Load Previous Recommendations
          </button>
          <button
            v-if="canRetryRecommendations"
            class="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
            :disabled="pending || retrySecondsLeft > 0"
            @click="retryRecommendations"
          >
            {{ retryButtonLabel }}
          </button>
        </div>
      </div>

      <div
        v-else-if="showRecommendationEmptyState"
        class="mx-auto flex min-h-0 flex-1 flex-col items-center justify-center text-center text-on-surface-variant"
      >
        <p class="mb-2 text-2xl font-semibold text-on-background">You're all caught up</p>
        <p class="mb-6 text-sm uppercase tracking-[0.24em] text-on-surface-variant">
          Ready for another round?
        </p>
        <div
          class="flex w-full max-w-md items-center justify-center gap-3 max-[720px]:flex-col max-[720px]:[&>button]:w-full max-[390px]:flex-col max-[390px]:[&>button]:w-full"
        >
          <button
            class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-outline-variant px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:border-primary/40 hover:text-on-background disabled:opacity-50"
            :disabled="pending"
            @click="resetMovies"
          >
            Start Over
          </button>
          <button
            class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-outline-variant px-3 py-2 text-sm font-semibold text-on-surface transition-colors hover:border-primary/40 hover:text-on-background disabled:opacity-50"
            :disabled="pending"
            @click="refreshMovies"
          >
            Refresh
          </button>
          <button
            class="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
            :disabled="pending"
            @click="getNewMovies"
          >
            <svg
              class="h-4 w-4"
              :class="{ 'animate-spin': pending }"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Load New Movies
          </button>
        </div>
      </div>

      <div
        v-else
        :style="recommendationViewportStyle"
        class="flex min-h-0 flex-1 items-center justify-center [--card-non-poster-height:clamp(9.25rem,calc(var(--app-dvh)*19),12rem)] [--fit-safety:clamp(0.85rem,calc(var(--app-dvh)*2),1.5rem)] [--footer-clearance:clamp(0.65rem,calc(var(--app-dvh)*1.75),1.25rem)] [--footer-height:4rem] [--header-height:4rem] [--height-fit-width:calc((var(--recommendation-viewport-height)-var(--header-height)-var(--footer-height)-var(--page-vertical-padding)-var(--footer-clearance)-var(--card-non-poster-height)-var(--fit-safety))/1.5)] [--page-vertical-padding:1.5rem] sm:[--footer-height:4.25rem] sm:[--page-vertical-padding:2rem] max-[760px]:[--card-non-poster-height:clamp(7.85rem,calc(var(--app-dvh)*17),9.75rem)] max-[760px]:[--fit-safety:clamp(0.65rem,calc(var(--app-dvh)*1.5),1rem)] max-[760px]:[--footer-clearance:clamp(0.5rem,calc(var(--app-dvh)*1.4),0.85rem)] max-[680px]:[--card-non-poster-height:clamp(7rem,calc(var(--app-dvh)*16),8.65rem)] max-[680px]:[--fit-safety:0.65rem] max-[680px]:[--footer-clearance:0.5rem]"
      >
        <div
          v-if="detailsPending"
          class="mx-auto flex h-full min-h-0 w-full max-w-[82rem] items-center justify-center"
        >
          <SkeletonMovieCard :variant="isDesktopDetailsLayout ? 'desktop' : 'card'" />
        </div>

        <div
          v-else
          class="mx-auto flex h-full min-h-0 w-full max-w-[82rem] items-center justify-center lg:pl-10 xl:pl-14"
        >
          <div
            class="flex h-full min-h-0 w-full flex-1 flex-col justify-center gap-6 lg:grid lg:grid-cols-[min(24.5rem,max(16rem,var(--height-fit-width)))_minmax(0,1fr)] lg:items-stretch lg:gap-16 xl:grid-cols-[min(25.5rem,max(16rem,var(--height-fit-width)))_minmax(0,1fr)] xl:gap-20"
          >
            <div
              class="mx-auto flex h-full min-h-0 w-[min(100%,29rem,max(16rem,var(--height-fit-width)))] max-h-full flex-col justify-center lg:mx-0 lg:w-full lg:max-w-none xl:max-w-none"
            >
              <div
                class="[container-type:inline-size] flex min-h-0 max-h-full w-full flex-1 flex-col justify-center px-[clamp(0.35rem,1vw,0.85rem)] py-[clamp(0.15rem,0.5vw,0.4rem)] sm:px-[0.35rem] lg:px-0 lg:py-0 max-[760px]:py-[0.1rem] max-[680px]:px-[0.75rem] max-[680px]:py-0"
              >
                <div
                  v-if="showInlineRecommendationFailure"
                  class="w-full text-center text-on-surface-variant"
                >
                  <AlertMessage type="error" :message="recommendationFailureMessage" />
                  <div
                    v-if="showRecommendationFailureActions"
                    class="mt-3 flex items-center justify-center gap-3"
                  >
                    <button
                      v-if="canLoadPreviousRecommendations"
                      class="inline-flex items-center gap-2 rounded-full border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:border-primary/40 hover:text-on-background disabled:opacity-50"
                      :disabled="pending"
                      @click="loadPreviousRecommendations"
                    >
                      Load Previous Recommendations
                    </button>
                    <button
                      v-if="canRetryRecommendations"
                      class="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-sm font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:opacity-50"
                      :disabled="pending || retrySecondsLeft > 0"
                      @click="retryRecommendations"
                    >
                      {{ retryButtonLabel }}
                    </button>
                  </div>
                </div>

                <div class="min-h-0 w-full flex-1">
                  <Transition name="card" mode="out-in">
                    <MovieCard
                      v-if="currentMovieFormatted"
                      :key="currentMovieFormatted?.id"
                      :movie="currentMovieFormatted"
                      :is-in-my-list="isInMyList"
                      :is-watched="isWatched"
                      :poster-stack-count="remainingPosterStackCount"
                      :details-enabled="!isDesktopDetailsLayout"
                      @dislike="handleDislike"
                      @watched="handleLike"
                      @to-watch="handleAddToList"
                      @refresh="refreshMovies"
                    />
                  </Transition>
                </div>
              </div>
            </div>

            <div
              v-if="showDesktopDetailsPanel"
              class="hidden min-h-0 lg:flex lg:max-w-[48rem] lg:flex-col lg:py-[clamp(0.15rem,0.5vw,0.4rem)]"
            >
              <MovieDetails
                v-if="currentMovieDetails"
                :is-open="true"
                :movie="currentMovieDetails"
                variant="inline"
              />
              <div
                v-else
                class="flex h-full min-h-0 items-center justify-center rounded-[1.75rem] border border-outline-variant bg-surface-container-low px-8 text-center text-on-surface-variant shadow-glow"
              >
                Movie details are unavailable for this title.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <LoginPromptModal :is-open="showLoginModal" @close="handleModalClose" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Movie } from '~/types/movie'
import { APP_HEIGHT_CSS_VALUE } from '~/composables/useStableViewportHeight'

interface RecommendationItem {
  tmdbId: number
}

interface RecommendationRegenerationError {
  statusCode: number
  statusMessage: string
  retryable: boolean
}

interface RecommendationApiResponse {
  recommendations: unknown
  regenerationError: RecommendationRegenerationError | null
  staleRecommendations: unknown
}

interface RecommendationFailure {
  statusCode: number
  statusMessage: string
  retryable: boolean
  staleRecommendations: RecommendationItem[] | null
  staleApplied: boolean
}

interface MovieToSave {
  id: number
  title: string
  year: number
  poster: string
  genres?: string[]
  runtime?: number | null
}

const RECOMMENDATION_REFRESH_EVENT = 'recommendation:refresh-request'
const DESKTOP_DETAILS_BREAKPOINT_QUERY = '(min-width: 1024px)'
const FETCH_MODE = {
  DEFAULT: 'default',
  GET_NEW: 'getNew',
  REFRESH: 'refresh',
} as const
const RECOMMENDATION_QUERY = {
  GET_NEW: 'getNew',
  REFRESH: 'refresh',
  SESSION_RECOMMENDED_TMDB_IDS: 'sessionRecommendedTmdbIds',
} as const

type FetchMode = (typeof FETCH_MODE)[keyof typeof FETCH_MODE]

const RETRY_COOLDOWN_S = 30
const RETRY_COOLDOWN_KEY = 'retry-cooldown-expires'
const FALLBACK_RECOMMENDATION_ERROR_MESSAGE = 'Recommendations are unavailable right now.'
const MAX_POSTER_STACK_CARDS = 2
// to avoid showing the empty state for a brief moment while the auth state is still initializing
const UNAUTHENTICATED_FALLBACK_DELAY_MS = 150

const { watchedMovies, markAsWatched, queuePendingWatchedMovie, removePendingWatchedMovie } =
  useWatchedMovies()
const { myList, addToMyList } = useMyList()
const { isAuthenticated, loading: authLoading, session } = useAuth()
const { buildSessionRecommendationQueryValue, rememberSessionRecommendations } =
  useRecommendationSession()
const { completed: onboardingCompleted, hasResolved: onboardingResolved } = useOnboarding()
const { getMovieDetails } = useMovieDetails()
const supabase = useSupabase()

const movies = useState<RecommendationItem[]>('recommendation-movies', () => [])
const originalMovies = useState<RecommendationItem[]>('recommendation-original-movies', () => [])
const hasLoaded = useState<boolean>('recommendation-has-loaded', () => false)
const hasSuccessfulRecommendationLoad = useState<boolean>(
  'has-successful-recommendation-load',
  () => false
)
const recommendationsPending = ref(true)
const detailsPending = ref(false)
const pending = computed(() => recommendationsPending.value || detailsPending.value)
const showLoginModal = ref(false)
const recommendationFailure = ref<RecommendationFailure | null>(null)
const lastFetchMode = ref<FetchMode>(FETCH_MODE.DEFAULT)
const pendingModalMovieId = ref<number | null>(null)
const currentMovieDetails = useState<Movie | null>(
  'recommendation-current-movie-details',
  () => null
)
const detailsRequestId = ref(0)
const retrySecondsLeft = ref(0)
const isDesktopDetailsLayout = ref(false)
let retryTimerHandle: ReturnType<typeof setInterval> | null = null
let recommendationRefreshHandler: (() => void) | null = null
let desktopDetailsMediaQuery: MediaQueryList | null = null
let isFetching = false
let unauthenticatedFallbackTimeout: ReturnType<typeof setTimeout> | null = null

const recommendationViewportStyle = computed(() => ({
  '--app-dvh': `calc(${APP_HEIGHT_CSS_VALUE} / 100)`,
  '--recommendation-viewport-height': APP_HEIGHT_CSS_VALUE,
}))

function toRecommendationItems(recommendations: unknown): RecommendationItem[] {
  if (!Array.isArray(recommendations)) {
    return []
  }

  return recommendations.flatMap((recommendation) => {
    if (
      typeof recommendation === 'number' &&
      Number.isInteger(recommendation) &&
      recommendation > 0
    ) {
      return [{ tmdbId: recommendation }]
    }

    if (
      recommendation &&
      typeof recommendation === 'object' &&
      typeof (recommendation as { tmdbId?: unknown }).tmdbId === 'number' &&
      Number.isInteger((recommendation as { tmdbId: number }).tmdbId) &&
      (recommendation as { tmdbId: number }).tmdbId > 0
    ) {
      return [{ tmdbId: (recommendation as { tmdbId: number }).tmdbId }]
    }

    return []
  })
}

function clearRetryCooldown() {
  retrySecondsLeft.value = 0
  if (retryTimerHandle !== null) {
    clearInterval(retryTimerHandle)
    retryTimerHandle = null
  }
  localStorage.removeItem(RETRY_COOLDOWN_KEY)
}

function resumeRetryCooldown(expiresAt: number) {
  if (retryTimerHandle !== null) clearInterval(retryTimerHandle)
  const tick = () => {
    const secondsLeft = Math.ceil((expiresAt - Date.now()) / 1000)
    if (secondsLeft <= 0) {
      clearRetryCooldown()
      return
    }
    retrySecondsLeft.value = secondsLeft
  }
  tick()
  retryTimerHandle = setInterval(tick, 1000)
}

function startRetryCooldown() {
  const expiresAt = Date.now() + RETRY_COOLDOWN_S * 1000
  localStorage.setItem(RETRY_COOLDOWN_KEY, String(expiresAt))
  resumeRetryCooldown(expiresAt)
}

function getErrorRecord(error: unknown): Record<string, unknown> | null {
  return typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : null
}

function getErrorStatusCode(error: unknown): number {
  const errorRecord = getErrorRecord(error)
  const responseRecord = getErrorRecord(errorRecord?.response)

  const candidates = [errorRecord?.statusCode, errorRecord?.status, responseRecord?.status]
  const statusCode = candidates.find(
    (candidate): candidate is number => typeof candidate === 'number'
  )
  return statusCode ?? 500
}

function getErrorStatusMessage(error: unknown): string {
  const errorRecord = getErrorRecord(error)
  const dataRecord = getErrorRecord(errorRecord?.data)
  const candidates = [dataRecord?.statusMessage, errorRecord?.statusMessage, errorRecord?.message]
  const message = candidates.find((candidate): candidate is string => typeof candidate === 'string')
  return message || FALLBACK_RECOMMENDATION_ERROR_MESSAGE
}

function createRecommendationFailure({
  statusCode,
  statusMessage,
  retryable = false,
  staleRecommendations = null,
  staleApplied = false,
}: {
  statusCode: number
  statusMessage: string
  retryable?: boolean
  staleRecommendations?: unknown
  staleApplied?: boolean
}): RecommendationFailure {
  return {
    statusCode,
    statusMessage,
    retryable,
    staleRecommendations:
      Array.isArray(staleRecommendations) && staleRecommendations.length > 0
        ? toRecommendationItems(staleRecommendations)
        : null,
    staleApplied,
  }
}

function createRecommendationFailureFromError(error: unknown): RecommendationFailure {
  const errorRecord = getErrorRecord(error)
  const dataRecord = getErrorRecord(errorRecord?.data)
  const statusCode = getErrorStatusCode(error)
  return createRecommendationFailure({
    statusCode,
    statusMessage: getErrorStatusMessage(error),
    retryable: statusCode === 503,
    staleRecommendations: dataRecord?.staleRecommendations ?? null,
  })
}

function setRecommendationFailure(failure: RecommendationFailure): void {
  recommendationFailure.value = failure

  if (failure.retryable) {
    startRetryCooldown()
    return
  }

  clearRetryCooldown()
}

function applyRecommendations(recommendations: unknown): void {
  const recommendationItems = toRecommendationItems(recommendations)
  movies.value = recommendationItems
  originalMovies.value = recommendationItems.map((recommendation) => ({ ...recommendation }))
  currentMovieDetails.value = null
  rememberSessionRecommendations(recommendationItems)
  hasSuccessfulRecommendationLoad.value = true
}

function clearUnauthenticatedFallbackTimeout() {
  if (unauthenticatedFallbackTimeout === null) {
    return
  }

  clearTimeout(unauthenticatedFallbackTimeout)
  unauthenticatedFallbackTimeout = null
}

function scheduleUnauthenticatedFallback() {
  clearUnauthenticatedFallbackTimeout()
  unauthenticatedFallbackTimeout = setTimeout(() => {
    recommendationsPending.value = false
    unauthenticatedFallbackTimeout = null
  }, UNAUTHENTICATED_FALLBACK_DELAY_MS)
}

const currentMovie = computed(() => movies.value[0] || null)
const showDesktopDetailsPanel = computed(
  () => isDesktopDetailsLayout.value && currentMovieFormatted.value !== null
)
const recommendationFailureMessage = computed(
  () => recommendationFailure.value?.statusMessage ?? FALLBACK_RECOMMENDATION_ERROR_MESSAGE
)
const canRetryRecommendations = computed(() => recommendationFailure.value?.retryable === true)
const canLoadPreviousRecommendations = computed(() => {
  const staleRecommendations = recommendationFailure.value?.staleRecommendations
  return Array.isArray(staleRecommendations) && staleRecommendations.length > 0
})
const isLimitReachedFailure = computed(() => recommendationFailure.value?.statusCode === 429)
const showBlockingRecommendationFailure = computed(
  () =>
    recommendationFailure.value !== null &&
    movies.value.length === 0 &&
    !recommendationFailure.value.staleApplied
)
const showInlineRecommendationFailure = computed(
  () => recommendationFailure.value !== null && movies.value.length > 0
)
const showRecommendationFailureActions = computed(
  () => canRetryRecommendations.value || canLoadPreviousRecommendations.value
)
const showRecommendationEmptyState = computed(
  () =>
    hasSuccessfulRecommendationLoad.value &&
    recommendationFailure.value === null &&
    movies.value.length === 0
)
const retryButtonLabel = computed(() =>
  retrySecondsLeft.value > 0 ? `Try again (${retrySecondsLeft.value}s)` : 'Try again'
)

const currentMovieFormatted = computed(() => {
  const movie = movies.value[0]
  if (!movie) return null
  const details = currentMovieDetails.value

  return {
    id: details?.id ?? movie.tmdbId ?? null,
    title: details?.title ?? '',
    year: details?.year ?? 0,
    image: details?.poster ?? '',
    rating: details?.rating ?? null,
    genre: details?.genres?.join(', ') ?? 'Unknown Genre',
    director: details?.directors?.[0] ?? null,
  }
})

const remainingPosterStackCount = computed(() =>
  Math.max(0, Math.min(MAX_POSTER_STACK_CARDS, movies.value.length - 1))
)

const isInMyList = computed(() => {
  const id = currentMovie.value?.tmdbId
  if (!id) return false
  return myList.value.some((m) => m.tmdbId === id)
})

const isWatched = computed(() => {
  const id = currentMovie.value?.tmdbId
  if (!id) return false
  return watchedMovies.value.some((movie) => movie.tmdbId === id)
})

function syncDesktopDetailsLayout(e: MediaQueryListEvent | MediaQueryList): void {
  const matches = 'matches' in e ? e.matches : (e as MediaQueryList).matches
  isDesktopDetailsLayout.value = matches
}

function buildRecommendationQueryParams(mode: FetchMode): Record<string, string> {
  if (mode === FETCH_MODE.GET_NEW) {
    const params: Record<string, string> = {
      [RECOMMENDATION_QUERY.GET_NEW]: 'true',
    }
    const sessionRecommendedTmdbIds = buildSessionRecommendationQueryValue()

    if (sessionRecommendedTmdbIds.length > 0) {
      params[RECOMMENDATION_QUERY.SESSION_RECOMMENDED_TMDB_IDS] = sessionRecommendedTmdbIds
    }

    return params
  }

  if (mode === FETCH_MODE.REFRESH) {
    return {
      [RECOMMENDATION_QUERY.REFRESH]: 'true',
    }
  }

  return {}
}

onMounted(() => {
  const stored = localStorage.getItem(RETRY_COOLDOWN_KEY)
  if (stored) {
    const expiresAt = Number(stored)
    if (Date.now() < expiresAt) {
      resumeRetryCooldown(expiresAt)
    } else {
      localStorage.removeItem(RETRY_COOLDOWN_KEY)
    }
  }

  recommendationRefreshHandler = () => {
    if (pending.value) return
    refreshMovies()
  }

  desktopDetailsMediaQuery = window.matchMedia(DESKTOP_DETAILS_BREAKPOINT_QUERY)
  syncDesktopDetailsLayout(desktopDetailsMediaQuery)
  desktopDetailsMediaQuery.addEventListener('change', syncDesktopDetailsLayout)
  window.addEventListener(RECOMMENDATION_REFRESH_EVENT, recommendationRefreshHandler)
})

onUnmounted(() => {
  if (retryTimerHandle !== null) clearInterval(retryTimerHandle)
  clearUnauthenticatedFallbackTimeout()
  if (desktopDetailsMediaQuery !== null) {
    desktopDetailsMediaQuery.removeEventListener('change', syncDesktopDetailsLayout)
    desktopDetailsMediaQuery = null
  }
  if (recommendationRefreshHandler !== null) {
    window.removeEventListener(RECOMMENDATION_REFRESH_EVENT, recommendationRefreshHandler)
  }
})

// avoid wasting TMDB quota on movies the user may never reach in the stack
watch(
  currentMovie,
  async (movie) => {
    if (!movie?.tmdbId) {
      detailsRequestId.value += 1
      detailsPending.value = false
      currentMovieDetails.value = null
      return
    }
    if (currentMovieDetails.value?.id === movie.tmdbId) return

    detailsRequestId.value += 1
    const requestId = detailsRequestId.value
    detailsPending.value = true
    currentMovieDetails.value = null

    try {
      const details = await getMovieDetails(movie.tmdbId)
      if (requestId === detailsRequestId.value) {
        currentMovieDetails.value = details
      }
    } catch {
      if (requestId === detailsRequestId.value) {
        currentMovieDetails.value = null
      }
    } finally {
      if (requestId === detailsRequestId.value) {
        detailsPending.value = false
      }
    }
  },
  { immediate: true }
)

const fetchRecommendations = async (mode: FetchMode = FETCH_MODE.DEFAULT): Promise<void> => {
  if (isFetching) return
  isFetching = true
  recommendationsPending.value = true
  recommendationFailure.value = null
  lastFetchMode.value = mode

  // Only flip hasLoaded once a fetch actually ran. A missing session token (the
  // client is still restoring/refreshing it) must stay "unloaded" so the session
  // watcher retries when the token arrives, instead of stranding an empty feed
  // that only a manual refresh can recover.
  let didAttempt = false

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) return
    didAttempt = true

    const params = buildRecommendationQueryParams(mode)

    const response = await $fetch<RecommendationApiResponse>('/api/recommend', {
      params,
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    if (response.regenerationError) {
      setRecommendationFailure(
        createRecommendationFailure({
          ...response.regenerationError,
          staleRecommendations: response.staleRecommendations,
        })
      )
      return
    }

    if (!Array.isArray(response.recommendations)) {
      throw new Error('Recommendations response was missing a recommendation list.')
    }

    clearRetryCooldown()
    applyRecommendations(response.recommendations)
  } catch (error) {
    didAttempt = true
    setRecommendationFailure(createRecommendationFailureFromError(error))
  } finally {
    isFetching = false
    if (didAttempt) hasLoaded.value = true
    recommendationsPending.value = false
  }
}

const retryRecommendations = () => fetchRecommendations(lastFetchMode.value)
const getNewMovies = () => fetchRecommendations(FETCH_MODE.GET_NEW)
const refreshMovies = () => fetchRecommendations(FETCH_MODE.REFRESH)

const loadPreviousRecommendations = (): void => {
  const staleRecommendations = recommendationFailure.value?.staleRecommendations
  if (!Array.isArray(staleRecommendations) || staleRecommendations.length === 0) return

  applyRecommendations(staleRecommendations)
  recommendationFailure.value = null
}

const resetMovies = (): Promise<void> | void => {
  if (originalMovies.value.length === 0) {
    return fetchRecommendations(FETCH_MODE.DEFAULT)
  }
  const myListIds = new Set(myList.value.map((movie) => movie.tmdbId))
  movies.value = originalMovies.value.filter((movie) => !myListIds.has(movie.tmdbId))
  currentMovieDetails.value = null
}

// wait for auth to finish initializing before deciding whether to fetch.
// onMounted fires before initialize() resolves, so isAuthenticated is not yet reliable there.
// Also watch the access token: if it wasn't ready on the first attempt (e.g. the
// client was still restoring the session), this re-fires once it lands so the feed
// loads on its own rather than waiting for a manual refresh.
watch(
  [authLoading, () => session.value?.access_token, onboardingResolved, onboardingCompleted],
  ([isLoading, _token, hasResolvedOnboarding, hasCompletedOnboarding]) => {
    if (isLoading) return
    if (!isAuthenticated.value) {
      scheduleUnauthenticatedFallback()
      return
    }
    clearUnauthenticatedFallbackTimeout()
    if (!hasResolvedOnboarding) {
      return
    }
    if (hasCompletedOnboarding !== true) {
      recommendationsPending.value = false
      return
    }
    if (hasLoaded.value) {
      recommendationsPending.value = false
      return
    }
    fetchRecommendations(FETCH_MODE.DEFAULT)
  },
  { immediate: true }
)

const handleDislike = (): void => {
  if (movies.value.length > 0) {
    movies.value.shift()
  }
}

function buildMovieToSave(rawMovie: RecommendationItem, details: Movie | null): MovieToSave {
  return {
    id: details?.id ?? rawMovie.tmdbId ?? 0,
    title: details?.title ?? '',
    year: details?.year ?? 0,
    poster: details?.poster ?? '',
  }
}

const handleLike = async (): Promise<void> => {
  if (!currentMovie.value) return

  const rawMovie = currentMovie.value
  const details = currentMovieDetails.value

  movies.value.shift()

  const movieToSave = buildMovieToSave(rawMovie, details)

  if (isAuthenticated.value) {
    const status = await markAsWatched(movieToSave)
    if (status === 'unauthorized' || status === 'error') {
      queuePendingWatchedMovie(movieToSave)
    }
  } else {
    queuePendingWatchedMovie(movieToSave)
    pendingModalMovieId.value = movieToSave.id
    showLoginModal.value = true
  }
}

const handleAddToList = async (): Promise<void> => {
  if (!currentMovie.value) return

  const rawMovie = currentMovie.value
  const details = currentMovieDetails.value

  movies.value.shift()

  const movieToSave = buildMovieToSave(rawMovie, details)

  if (isAuthenticated.value) {
    await addToMyList(movieToSave)
  } else {
    showLoginModal.value = true
  }
}

const handleModalClose = (): void => {
  showLoginModal.value = false
  if (!isAuthenticated.value && pendingModalMovieId.value !== null) {
    removePendingWatchedMovie(pendingModalMovieId.value)
  }
  pendingModalMovieId.value = null
  if (isAuthenticated.value && movies.value.length === 0) {
    fetchRecommendations(FETCH_MODE.DEFAULT)
  }
}
</script>
