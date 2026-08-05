import type { H3Event } from 'h3'

export interface WatchedMovieRecord {
  tmdbId: number
  title: string
  year: number
  genres?: string[]
  popularity?: number
  voteCount?: number
}

export interface Recommendation {
  name: string
  originalName: string
  year: number | null
  shortReason?: string
}

export interface RecommendationWithId extends Recommendation {
  tmdbId: number | null
}

export interface IndexedRecommendationWithId extends RecommendationWithId {
  index: number
}

export type BlockedRecommendationReason =
  | 'watched'
  | 'watchlist'
  | 'duplicate'
  | 'unresolved'
  | 'already_blocked'
  | 'already_accepted'

export interface BlockedRecommendation {
  index: number
  title: string
  release_year: number | null
  tmdb_id: number | null
  reason: BlockedRecommendationReason
}

export interface RecommendationValidationState {
  watchedIds: Set<number>
  myListIds: Set<number>
  acceptedIds: Set<number>
  blockedIds: Set<number>
  blockedTitleKeys: Set<string>
  myListAcceptedCount: number
}

export interface RecommendationErrorContext {
  event?: H3Event
  userId?: string
}

export interface InitialModelRecommendation {
  index: number
  title: string
  release_year: number | null
}

export interface ReplacementModelRecommendation {
  replaced_index: number
  title: string
  release_year: number | null
}

export interface ValidationBatchResult {
  accepted: IndexedRecommendationWithId[]
  blocked: BlockedRecommendation[]
}
