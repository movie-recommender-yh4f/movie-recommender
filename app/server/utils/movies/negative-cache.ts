import { createRedisClient } from '../shared/redis'

const MOVIE_DETAILS_NEGATIVE_CACHE_KEY_PREFIX = 'movie-details:negative:'
const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MOVIE_DETAILS_NEGATIVE_CACHE_TTL_SECONDS =
  HOURS_PER_DAY * MINUTES_PER_HOUR * SECONDS_PER_MINUTE
const MOVIE_DETAILS_NEGATIVE_CACHE_VALUE = '1'

const redis = createRedisClient()

function getMovieDetailsNegativeCacheKey(tmdbId: number): string {
  return `${MOVIE_DETAILS_NEGATIVE_CACHE_KEY_PREFIX}${tmdbId}`
}

export async function getMovieDetailsNegativeCache(tmdbId: number): Promise<boolean> {
  const cachedValue = await redis.get<string>(getMovieDetailsNegativeCacheKey(tmdbId))

  return cachedValue === MOVIE_DETAILS_NEGATIVE_CACHE_VALUE
}

export async function setMovieDetailsNegativeCache(tmdbId: number): Promise<void> {
  await redis.set(getMovieDetailsNegativeCacheKey(tmdbId), MOVIE_DETAILS_NEGATIVE_CACHE_VALUE, {
    ex: MOVIE_DETAILS_NEGATIVE_CACHE_TTL_SECONDS,
  })
}
