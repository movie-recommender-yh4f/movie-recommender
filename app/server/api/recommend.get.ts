import { createHash } from 'node:crypto'
import type { H3Event } from 'h3'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthorizedUser } from '../utils/auth/authorize-user'
import { requireCompletedOnboarding } from '../utils/auth/onboarding'
import { hasEnoughRecommendationsToCache } from '../utils/recommendations/cache-policy'
import {
  MAX_MY_LIST_RECOMMENDATIONS,
  MIN_RECOMMENDATIONS_TO_CACHE,
  TARGET_RECOMMENDATIONS,
} from '../utils/recommendations/constants'
import {
  fetchMyListMovies,
  fetchWatchedMovies,
  hydrateRecommendationsByTmdbIds,
} from '../utils/recommendations/movie-history'
import { getRecommendationsFromPlatformAi } from '../utils/recommendations/recommendations'
import type {
  RecommendationWithId,
  WatchedMovieRecord,
} from '../utils/recommendations/types'
import { acquireRecommendationLock, releaseRecommendationLock } from '../utils/recommendations/lock'
import { createRedisClient } from '../utils/shared/redis'
import { logPrivateError, logPrivateInfo, throwSupabaseError } from '../utils/shared/api-error'

const RECOMMENDATIONS_TABLE = 'recommendations'
const TTL_MS = 7 * 24 * 60 * 60 * 1000
const QUERY_TRUE = ['true', '1']
const LOAD_RECOMMENDATIONS_MESSAGE = 'Unable to load recommendations right now.'
const SAVE_RECOMMENDATIONS_MESSAGE = 'Unable to save recommendations right now.'

interface CachedRow {
  tmdb_ids: number[]
  watched_hash: string
  expires_at: string
}

interface RecommendationCacheState {
  freshRecommendationIds: number[] | null
  storedRecommendationIds: number[]
}

interface RecommendationResponse {
  recommendations: number[] | null
  cached: boolean
  stale: boolean
  regenerationError: {
    statusCode: number
    statusMessage: string
    retryable: boolean
  } | null
  staleRecommendations: number[] | null
}

interface RecommendationFilterStats {
  aiCandidateCount: number
  finalFilteredCount: number
  removedWatchedCount: number
  removedExcludedCount: number
  removedDuplicateCount: number
  removedNullTmdbIdCount: number
  myListRecommendationsKeptCount: number
}

interface FilteredRecommendationsResult {
  recommendations: RecommendationWithId[]
  stats: RecommendationFilterStats
}

function isQueryFlagEnabled(value: unknown): boolean {
  return typeof value === 'string' && QUERY_TRUE.includes(value)
}

function computeWatchedHash(movies: WatchedMovieRecord[]): string {
  const sorted = [...movies].sort((a, b) => a.tmdbId - b.tmdbId).map(({ tmdbId }) => ({ tmdbId }))
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex')
}

function toRecommendationIds(recommendations: RecommendationWithId[]): number[] {
  return recommendations.flatMap((recommendation) =>
    recommendation.tmdbId === null ? [] : [recommendation.tmdbId]
  )
}

function dedupeRecommendationIds(recommendationIds: number[]): number[] {
  const seenIds = new Set<number>()
  const dedupedIds: number[] = []

  for (const recommendationId of recommendationIds) {
    if (seenIds.has(recommendationId)) {
      continue
    }

    seenIds.add(recommendationId)
    dedupedIds.push(recommendationId)
  }

  return dedupedIds
}

function filterFinalRecommendations(
  recommendations: RecommendationWithId[],
  watchedMovies: WatchedMovieRecord[],
  myListMovies: WatchedMovieRecord[],
  excludedMovies: RecommendationWithId[]
): FilteredRecommendationsResult {
  const watchedIds = new Set(watchedMovies.map((movie) => movie.tmdbId))
  const myListIds = new Set(myListMovies.map((movie) => movie.tmdbId))
  const excludedIds = new Set(toRecommendationIds(excludedMovies))
  const seenIds = new Set<number>()
  const nonMyListRecommendations: RecommendationWithId[] = []
  const myListRecommendations: RecommendationWithId[] = []
  let removedWatchedCount = 0
  let removedExcludedCount = 0
  let removedDuplicateCount = 0
  let removedNullTmdbIdCount = 0

  for (const recommendation of recommendations) {
    if (recommendation.tmdbId === null) {
      removedNullTmdbIdCount++
      continue
    }

    if (watchedIds.has(recommendation.tmdbId)) {
      removedWatchedCount++
      continue
    }

    if (excludedIds.has(recommendation.tmdbId)) {
      removedExcludedCount++
      continue
    }

    if (seenIds.has(recommendation.tmdbId)) {
      removedDuplicateCount++
      continue
    }

    seenIds.add(recommendation.tmdbId)

    if (myListIds.has(recommendation.tmdbId)) {
      myListRecommendations.push(recommendation)
      continue
    }

    nonMyListRecommendations.push(recommendation)
  }

  const filteredRecommendations = [
    ...nonMyListRecommendations,
    ...myListRecommendations.slice(0, MAX_MY_LIST_RECOMMENDATIONS),
  ].slice(0, TARGET_RECOMMENDATIONS)
  const myListRecommendationsKeptCount = filteredRecommendations.filter(
    (recommendation) => recommendation.tmdbId !== null && myListIds.has(recommendation.tmdbId)
  ).length

  return {
    recommendations: filteredRecommendations,
    stats: {
      aiCandidateCount: recommendations.length,
      finalFilteredCount: filteredRecommendations.length,
      removedWatchedCount,
      removedExcludedCount,
      removedDuplicateCount,
      removedNullTmdbIdCount,
      myListRecommendationsKeptCount,
    },
  }
}

function buildSuccessResponse(
  recommendationIds: number[],
  cached: boolean
): RecommendationResponse {
  return {
    recommendations: [...recommendationIds],
    cached,
    stale: false,
    regenerationError: null,
    staleRecommendations: null,
  }
}

function getErrorStatusCode(error: unknown): number {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number'
  ) {
    return (error as { statusCode: number }).statusCode
  }

  return 500
}

function getErrorStatusMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'statusMessage' in error &&
    typeof (error as { statusMessage?: unknown }).statusMessage === 'string'
  ) {
    return (error as { statusMessage: string }).statusMessage
  }

  return 'Unable to generate recommendations right now.'
}

const RECOMMENDATION_TIMING_SOURCE = 'ai_provider' as const

function logRecommendationTiming(
  event: H3Event,
  userId: string,
  action: string,
  startedAt: number
): void {
  logPrivateInfo({
    event: 'recommendation.timing',
    source: RECOMMENDATION_TIMING_SOURCE,
    statusCode: 200,
    userId,
    route: event.path,
    method: event.method,
    extra: {
      action,
      durationMs: performance.now() - startedAt,
    },
  })
}

function buildRegenerationFallbackResponse(
  error: unknown,
  staleRecommendationIds: number[]
): RecommendationResponse {
  const statusCode = getErrorStatusCode(error)

  return {
    recommendations: null,
    cached: false,
    stale: false,
    regenerationError: {
      statusCode,
      statusMessage: getErrorStatusMessage(error),
      retryable: statusCode === 503 ? true : false,
    },
    staleRecommendations: [...staleRecommendationIds],
  }
}

function createInsufficientRecommendationsError() {
  return createError({
    statusCode: 502,
    statusMessage: 'Recommendation generation returned too few valid TMDB matches.',
  })
}

async function getRecommendationCacheState(
  event: H3Event,
  supabase: SupabaseClient,
  userId: string,
  watchedHash: string
): Promise<RecommendationCacheState> {
  const { data, error } = await supabase
    .from(RECOMMENDATIONS_TABLE)
    .select('tmdb_ids, watched_hash, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throwSupabaseError(event, error, {
      event: 'recommendation.cache_read_failed',
      userId,
      publicMessage: LOAD_RECOMMENDATIONS_MESSAGE,
      extra: {
        table: RECOMMENDATIONS_TABLE,
        operation: 'select',
      },
    })
  }

  if (!data) {
    return {
      freshRecommendationIds: null,
      storedRecommendationIds: [],
    }
  }

  const row = data as CachedRow
  const tmdbIds = dedupeRecommendationIds(Array.isArray(row.tmdb_ids) ? row.tmdb_ids : [])
  const isFresh = new Date(row.expires_at) > new Date() && row.watched_hash === watchedHash

  return {
    freshRecommendationIds: isFresh ? tmdbIds : null,
    storedRecommendationIds: tmdbIds,
  }
}

async function storeCachedRecommendations(
  event: H3Event,
  supabase: SupabaseClient,
  userId: string,
  recommendations: RecommendationWithId[],
  watchedHash: string
): Promise<void> {
  const recommendationIds = dedupeRecommendationIds(toRecommendationIds(recommendations))

  const { error } = await supabase.from(RECOMMENDATIONS_TABLE).upsert({
    user_id: userId,
    tmdb_ids: recommendationIds,
    watched_hash: watchedHash,
    expires_at: new Date(Date.now() + TTL_MS).toISOString(),
  })

  if (error) {
    throwSupabaseError(event, error, {
      event: 'recommendation.cache_write_failed',
      userId,
      publicMessage: SAVE_RECOMMENDATIONS_MESSAGE,
      extra: {
        table: RECOMMENDATIONS_TABLE,
        operation: 'upsert',
      },
    })
  }
}

export default defineEventHandler(async (event) => {
  const requestStartedAt = performance.now()
  const authorizationStartedAt = performance.now()
  const { supabase, user } = await getAuthorizedUser(event)
  logRecommendationTiming(event, user.id, 'authorize_user', authorizationStartedAt)

  const onboardingStartedAt = performance.now()
  await requireCompletedOnboarding(event, supabase, user.id)
  logRecommendationTiming(event, user.id, 'check_onboarding', onboardingStartedAt)

  const { getNew, refresh } = getQuery(event)
  const isGetNew = isQueryFlagEnabled(getNew)
  const isRefresh = !isGetNew && isQueryFlagEnabled(refresh)

  const redis = createRedisClient()
  const lockStartedAt = performance.now()
  const lock = await acquireRecommendationLock(redis, user.id)
  logRecommendationTiming(event, user.id, 'acquire_lock', lockStartedAt)

  if (!lock) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Recommendation request already in progress.',
    })
  }

  try {
    const watchedMoviesStartedAt = performance.now()
    const watchedMovies = await fetchWatchedMovies(supabase, user.id, { event })
    logRecommendationTiming(event, user.id, 'fetch_watched_movies', watchedMoviesStartedAt)
    let excludedMovies: RecommendationWithId[] = []

    if (watchedMovies.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'No watched movies found. Watch some movies first.',
      })
    }

    const watchedHashStartedAt = performance.now()
    const watchedHash = computeWatchedHash(watchedMovies)
    logRecommendationTiming(event, user.id, 'compute_watched_hash', watchedHashStartedAt)

    const cacheStateStartedAt = performance.now()
    const cacheState = await getRecommendationCacheState(event, supabase, user.id, watchedHash)
    logRecommendationTiming(event, user.id, 'load_recommendation_cache', cacheStateStartedAt)

    if (!isGetNew && !isRefresh && cacheState.freshRecommendationIds) {
      logRecommendationTiming(event, user.id, 'return_fresh_cache', requestStartedAt)
      return buildSuccessResponse(cacheState.freshRecommendationIds, true)
    }

    const myListMoviesStartedAt = performance.now()
    const myListMovies = await fetchMyListMovies(supabase, user.id, { event })
    logRecommendationTiming(event, user.id, 'fetch_my_list_movies', myListMoviesStartedAt)

    if (isGetNew && cacheState.storedRecommendationIds.length > 0) {
      const excludedMoviesStartedAt = performance.now()
      excludedMovies = await hydrateRecommendationsByTmdbIds(
        supabase,
        cacheState.storedRecommendationIds,
        { event, userId: user.id }
      )
      logRecommendationTiming(event, user.id, 'hydrate_excluded_recommendations', excludedMoviesStartedAt)
    }

    let recommendations: RecommendationWithId[]
    try {
      const platformAiStartedAt = performance.now()
      const platformAiResult = await getRecommendationsFromPlatformAi(
        watchedMovies,
        myListMovies,
        user.id,
        event,
        excludedMovies
      )
      logRecommendationTiming(event, user.id, 'load_from_platform_ai', platformAiStartedAt)
      const generatedRecommendations = platformAiResult.recommendations

      const filteringStartedAt = performance.now()
      const filteredResult = filterFinalRecommendations(
        generatedRecommendations,
        watchedMovies,
        myListMovies,
        excludedMovies
      )
      logRecommendationTiming(event, user.id, 'filter_final_recommendations', filteringStartedAt)
      recommendations = filteredResult.recommendations

      logPrivateInfo({
        event: 'recommendation.filtering_completed',
        source: 'ai_provider',
        statusCode: 200,
        userId: user.id,
        route: event.path,
        method: event.method,
        extra: {
          ...filteredResult.stats,
          aiCandidateCount: platformAiResult.aiCandidateCount ?? generatedRecommendations.length,
        },
      })

      if (
        recommendations.length < MIN_RECOMMENDATIONS_TO_CACHE ||
        !hasEnoughRecommendationsToCache(recommendations)
      ) {
        throw createInsufficientRecommendationsError()
      }
    } catch (error) {
      if (cacheState.storedRecommendationIds.length === 0) {
        throw error
      }

      logPrivateError({
        cause: error,
        event: 'recommendation.regeneration_failed',
        source: 'ai_provider',
        statusCode: getErrorStatusCode(error),
        userId: user.id,
        route: event.path,
        method: event.method,
        extra: {
          staleRecommendationCount: cacheState.storedRecommendationIds.length,
          refresh: isRefresh,
          getNew: isGetNew,
        },
      })

      return buildRegenerationFallbackResponse(error, cacheState.storedRecommendationIds)
    }

    const storeRecommendationsStartedAt = performance.now()
    await storeCachedRecommendations(event, supabase, user.id, recommendations, watchedHash)
    logRecommendationTiming(event, user.id, 'store_recommendations', storeRecommendationsStartedAt)

    return buildSuccessResponse(toRecommendationIds(recommendations), false)
  } finally {
    logRecommendationTiming(event, user.id, 'total_request', requestStartedAt)
    await releaseRecommendationLock(redis, lock)
  }
})
