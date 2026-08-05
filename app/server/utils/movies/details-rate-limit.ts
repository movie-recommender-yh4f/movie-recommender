import { Ratelimit } from '@upstash/ratelimit'
import type { H3Event } from 'h3'
import { createRedisClient } from '../shared/redis'

export const AUTHENTICATED_MOVIE_DETAILS_LIMIT = 20
export const GUEST_MOVIE_DETAILS_LIMIT = 5
export const AUTHENTICATED_MOVIE_DETAILS_MISS_LIMIT = 100
export const GUEST_MOVIE_DETAILS_MISS_LIMIT = 20

const MOVIE_DETAILS_WINDOW = '1 s'
const MOVIE_DETAILS_MISS_WINDOW = '1 d'
const AUTHENTICATED_KEY_PREFIX = 'movie-details:user:'
const GUEST_KEY_PREFIX = 'movie-details:guest:'
const AUTHENTICATED_MISS_KEY_PREFIX = 'movie-details-miss:user:'
const GUEST_MISS_KEY_PREFIX = 'movie-details-miss:guest:'
const RATE_LIMIT_HEADER_LIMIT = 'X-RateLimit-Limit'
const RATE_LIMIT_HEADER_REMAINING = 'X-RateLimit-Remaining'
const RATE_LIMIT_HEADER_RESET = 'X-RateLimit-Reset'
const MOVIE_DETAILS_RATE_LIMIT_HEADER_LIMIT = 'X-Movie-Details-RateLimit-Limit'
const MOVIE_DETAILS_RATE_LIMIT_HEADER_REMAINING = 'X-Movie-Details-RateLimit-Remaining'
const MOVIE_DETAILS_RATE_LIMIT_HEADER_RESET = 'X-Movie-Details-RateLimit-Reset'
const MOVIE_DETAILS_MISS_LIMIT_HEADER = 'X-Movie-Details-Miss-Limit'
const MOVIE_DETAILS_MISS_REMAINING_HEADER = 'X-Movie-Details-Miss-Remaining'
const MOVIE_DETAILS_MISS_RESET_HEADER = 'X-Movie-Details-Miss-Reset'

interface AuthenticatedMovieDetailsIdentity {
  userId: string
}

interface GuestMovieDetailsIdentity {
  guestIp: string
}

export type MovieDetailsIdentity = AuthenticatedMovieDetailsIdentity | GuestMovieDetailsIdentity

interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

const authenticatedMovieDetailsLimiter = new Ratelimit({
  redis: createRedisClient(),
  limiter: Ratelimit.fixedWindow(AUTHENTICATED_MOVIE_DETAILS_LIMIT, MOVIE_DETAILS_WINDOW),
  analytics: false,
})

const guestMovieDetailsLimiter = new Ratelimit({
  redis: createRedisClient(),
  limiter: Ratelimit.fixedWindow(GUEST_MOVIE_DETAILS_LIMIT, MOVIE_DETAILS_WINDOW),
  analytics: false,
})

const authenticatedMovieDetailsMissLimiter = new Ratelimit({
  redis: createRedisClient(),
  limiter: Ratelimit.fixedWindow(AUTHENTICATED_MOVIE_DETAILS_MISS_LIMIT, MOVIE_DETAILS_MISS_WINDOW),
  analytics: false,
})

const guestMovieDetailsMissLimiter = new Ratelimit({
  redis: createRedisClient(),
  limiter: Ratelimit.fixedWindow(GUEST_MOVIE_DETAILS_MISS_LIMIT, MOVIE_DETAILS_MISS_WINDOW),
  analytics: false,
})

function getMovieDetailsRateLimitKey(identity: MovieDetailsIdentity): string {
  if ('userId' in identity) {
    return `${AUTHENTICATED_KEY_PREFIX}${identity.userId}`
  }

  return `${GUEST_KEY_PREFIX}${identity.guestIp}`
}

function getMovieDetailsMissRateLimitKey(identity: MovieDetailsIdentity): string {
  if ('userId' in identity) {
    return `${AUTHENTICATED_MISS_KEY_PREFIX}${identity.userId}`
  }

  return `${GUEST_MISS_KEY_PREFIX}${identity.guestIp}`
}

function setMovieDetailsRateLimitHeaders(event: H3Event, rateLimit: RateLimitResult): void {
  setResponseHeaders(event, {
    [RATE_LIMIT_HEADER_LIMIT]: String(rateLimit.limit),
    [RATE_LIMIT_HEADER_REMAINING]: String(rateLimit.remaining),
    [RATE_LIMIT_HEADER_RESET]: String(rateLimit.reset),
    [MOVIE_DETAILS_RATE_LIMIT_HEADER_LIMIT]: String(rateLimit.limit),
    [MOVIE_DETAILS_RATE_LIMIT_HEADER_REMAINING]: String(rateLimit.remaining),
    [MOVIE_DETAILS_RATE_LIMIT_HEADER_RESET]: String(rateLimit.reset),
  })
}

function setMovieDetailsMissRateLimitHeaders(event: H3Event, rateLimit: RateLimitResult): void {
  setResponseHeaders(event, {
    [MOVIE_DETAILS_MISS_LIMIT_HEADER]: String(rateLimit.limit),
    [MOVIE_DETAILS_MISS_REMAINING_HEADER]: String(rateLimit.remaining),
    [MOVIE_DETAILS_MISS_RESET_HEADER]: String(rateLimit.reset),
  })
}

export async function limitMovieDetailsBurst(event: H3Event, identity: MovieDetailsIdentity) {
  const limiter = 'userId' in identity ? authenticatedMovieDetailsLimiter : guestMovieDetailsLimiter
  const rateLimit = (await limiter.limit(getMovieDetailsRateLimitKey(identity))) as RateLimitResult

  setMovieDetailsRateLimitHeaders(event, rateLimit)

  return rateLimit
}

export async function limitMovieDetailsMisses(event: H3Event, identity: MovieDetailsIdentity) {
  const limiter = 'userId' in identity
    ? authenticatedMovieDetailsMissLimiter
    : guestMovieDetailsMissLimiter
  const rateLimit = (await limiter.limit(getMovieDetailsMissRateLimitKey(identity))) as RateLimitResult

  setMovieDetailsMissRateLimitHeaders(event, rateLimit)

  return rateLimit
}
