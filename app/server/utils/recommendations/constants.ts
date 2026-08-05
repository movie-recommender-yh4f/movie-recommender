const MAX_INITIAL_RECOMMENDATION_COUNT = 100

export function getInitialRecommendationCount(): number {
  const configuredCount = Number.parseInt(useRuntimeConfig().initialRecommendationCount, 10)

  if (Number.isNaN(configuredCount)) {
    return DEFAULT_INITIAL_RECOMMENDATION_COUNT
  }

  return Math.min(Math.max(configuredCount, TARGET_RECOMMENDATIONS), MAX_INITIAL_RECOMMENDATION_COUNT)
}
export const WATCHED_MOVIES_TABLE = 'user_watched_movies'
export const MY_LIST_TABLE = 'user_my_list'
export const MOVIES_TABLE = 'movies'
export const MIN_RECOMMENDATIONS_TO_CACHE = 5
export const TARGET_RECOMMENDATIONS = 20
export const DEFAULT_INITIAL_RECOMMENDATION_COUNT = 35
export const MAX_RECOMMENDATION_ROUNDS = 3
export const MAX_MY_LIST_RECOMMENDATIONS = 2
export const LOAD_RECOMMENDATIONS_MESSAGE = 'Unable to load recommendations right now.'
export const GENERATE_RECOMMENDATIONS_MESSAGE = 'Unable to generate recommendations right now.'
export const UNKNOWN_YEAR_LABEL = 'unknown year'
export const HIGH_BLOCKED_GUIDANCE_THRESHOLD = 0.5
export const EXCLUDED_RECOMMENDATION_INDEX = 0
