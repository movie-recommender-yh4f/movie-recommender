import {
  EXCLUDED_RECOMMENDATION_INDEX,
  HIGH_BLOCKED_GUIDANCE_THRESHOLD,
  MAX_MY_LIST_RECOMMENDATIONS,
  UNKNOWN_YEAR_LABEL,
} from './constants'
import type {
  BlockedRecommendation,
  BlockedRecommendationReason,
  IndexedRecommendationWithId,
  Recommendation,
  RecommendationValidationState,
  RecommendationWithId,
  ValidationBatchResult,
  WatchedMovieRecord,
} from './types'

function normalizeTitleForComparison(title: string): string {
  return title.trim().toLowerCase()
}

function formatRecommendationYear(year: number | null): string {
  return year === null ? UNKNOWN_YEAR_LABEL : year.toString()
}

function toRecommendationTitleKey(recommendation: Pick<Recommendation, 'name' | 'year'>): string {
  return `${normalizeTitleForComparison(recommendation.name)}::${formatRecommendationYear(recommendation.year)}`
}

function toBlockedTitleKey(recommendation: BlockedRecommendation): string {
  return `${normalizeTitleForComparison(recommendation.title)}::${formatRecommendationYear(recommendation.release_year)}`
}

export function toBlockedExcludedRecommendations(
  recommendations: RecommendationWithId[]
): BlockedRecommendation[] {
  return recommendations.map((recommendation) => ({
    index: EXCLUDED_RECOMMENDATION_INDEX,
    title: recommendation.name,
    release_year: recommendation.year,
    tmdb_id: recommendation.tmdbId,
    reason: 'already_blocked',
  }))
}

export function createRecommendationValidationState(
  watchedMovies: WatchedMovieRecord[],
  myListMovies: WatchedMovieRecord[],
  blockedRecommendations: BlockedRecommendation[] = [],
  blockedTmdbIds: number[] = []
): RecommendationValidationState {
  const blockedIds = new Set<number>()
  const blockedTitleKeys = new Set<string>()

  for (const recommendation of blockedRecommendations) {
    if (recommendation.tmdb_id !== null) {
      blockedIds.add(recommendation.tmdb_id)
    }

    blockedTitleKeys.add(toBlockedTitleKey(recommendation))
  }

  for (const tmdbId of blockedTmdbIds) {
    blockedIds.add(tmdbId)
  }

  return {
    watchedIds: new Set(watchedMovies.map((movie) => movie.tmdbId)),
    myListIds: new Set(myListMovies.map((movie) => movie.tmdbId)),
    acceptedIds: new Set(),
    blockedIds,
    blockedTitleKeys,
    myListAcceptedCount: 0,
  }
}

function createBlockedRecommendation(
  recommendation: IndexedRecommendationWithId,
  reason: BlockedRecommendationReason
): BlockedRecommendation {
  return {
    index: recommendation.index,
    title: recommendation.name,
    release_year: recommendation.year,
    tmdb_id: recommendation.tmdbId,
    reason,
  }
}

function blockRecommendation(
  recommendation: IndexedRecommendationWithId,
  reason: BlockedRecommendationReason,
  state: RecommendationValidationState,
  blocked: BlockedRecommendation[]
): void {
  const blockedRecommendation = createBlockedRecommendation(recommendation, reason)

  if (recommendation.tmdbId !== null) {
    state.blockedIds.add(recommendation.tmdbId)
  }

  state.blockedTitleKeys.add(toBlockedTitleKey(blockedRecommendation))
  blocked.push(blockedRecommendation)
}

function acceptRecommendation(
  recommendation: IndexedRecommendationWithId,
  state: RecommendationValidationState,
  accepted: IndexedRecommendationWithId[]
): void {
  if (recommendation.tmdbId === null) {
    return
  }

  state.acceptedIds.add(recommendation.tmdbId)

  if (state.myListIds.has(recommendation.tmdbId)) {
    state.myListAcceptedCount++
  }

  accepted.push(recommendation)
}

function getBlockReason(
  recommendation: IndexedRecommendationWithId,
  state: RecommendationValidationState,
  currentIds: Set<number>,
  currentTitleKeys: Set<string>
): BlockedRecommendationReason | null {
  const titleKey = toRecommendationTitleKey(recommendation)

  if (currentTitleKeys.has(titleKey)) {
    return 'duplicate'
  }
  currentTitleKeys.add(titleKey)

  if (recommendation.tmdbId === null) {
    return state.blockedTitleKeys.has(titleKey) ? 'already_blocked' : 'unresolved'
  }

  if (currentIds.has(recommendation.tmdbId)) {
    return 'duplicate'
  }
  currentIds.add(recommendation.tmdbId)

  if (state.acceptedIds.has(recommendation.tmdbId)) {
    return 'already_accepted'
  }

  if (state.blockedIds.has(recommendation.tmdbId) || state.blockedTitleKeys.has(titleKey)) {
    return 'already_blocked'
  }

  if (state.watchedIds.has(recommendation.tmdbId)) {
    return 'watched'
  }

  if (
    state.myListIds.has(recommendation.tmdbId) &&
    state.myListAcceptedCount >= MAX_MY_LIST_RECOMMENDATIONS
  ) {
    return 'watchlist'
  }

  return null
}

export function validateRecommendationBatch(
  recommendations: IndexedRecommendationWithId[],
  state: RecommendationValidationState
): ValidationBatchResult {
  const accepted: IndexedRecommendationWithId[] = []
  const blocked: BlockedRecommendation[] = []
  const currentIds = new Set<number>()
  const currentTitleKeys = new Set<string>()

  for (const recommendation of recommendations) {
    const blockReason = getBlockReason(recommendation, state, currentIds, currentTitleKeys)

    if (blockReason) {
      blockRecommendation(recommendation, blockReason, state, blocked)
      continue
    }

    acceptRecommendation(recommendation, state, accepted)
  }

  return {
    accepted,
    blocked,
  }
}

export function shouldAskForDeeperCuts(result: ValidationBatchResult): boolean {
  const total = result.accepted.length + result.blocked.length

  return total > 0 && result.blocked.length / total >= HIGH_BLOCKED_GUIDANCE_THRESHOLD
}
