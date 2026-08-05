import type { H3Event } from 'h3'
import { getOptionalAuthorizedUser } from '../../utils/auth/authorize-user'
import {
  limitMovieDetailsBurst,
  limitMovieDetailsMisses,
  type MovieDetailsIdentity,
} from '../../utils/movies/details-rate-limit'
import {
  getMovieDetailsNegativeCache,
  setMovieDetailsNegativeCache,
} from '../../utils/movies/negative-cache'
import { createServiceSupabaseClient } from '../../utils/shared/supabase-client'
import { throwSupabaseError } from '../../utils/shared/api-error'
import { IMAGE_BASE } from '../../utils/tmdb/constants'
import { fetchTmdb } from '../../utils/tmdb/client'

interface TMDBMovieDetails {
  id: number
  original_title?: string
  title: string
  poster_path: string | null
  backdrop_path: string | null
  vote_average: number
  vote_count: number
  popularity?: number
  release_date: string
  overview: string
  runtime: number | null
  genres: Array<{ id: number; name: string }>
  credits: {
    cast: Array<{ name: string }>
    crew: Array<{ name: string; job: string }>
  }
  videos: {
    results: Array<{
      key: string
      site: string
      type: string
      official: boolean
      published_at: string
    }>
  }
}

interface MovieRow {
  tmdb_id: number
  original_title: string
  title: string
  overview: string
  poster_path: string
  backdrop_path: string
  release_date: string
  trailer_key: string
  runtime: number
  vote_average: number
  vote_count: number
  popularity: number
  genres: string[]
  cast: string[]
  directors: string[]
  cached_at: string | null
}

interface MovieResponse {
  id: number
  title: string
  poster: string
  backdrop: string
  rating: number
  year: number
  duration: string
  runtime: number | null
  genres: string[]
  actors: string[]
  directors?: string[]
  description: string
  trailer: string | null
}

interface MovieRequestContext {
  missIdentity: MovieDetailsIdentity | null
  shortWindowIdentity: MovieDetailsIdentity
}

const CACHE_TTL_MONTHS = 3
const DAYS_PER_MONTH = 30
const HOURS_PER_DAY = 24
const MINUTES_PER_HOUR = 60
const SECONDS_PER_MINUTE = 60
const MILLISECONDS_PER_SECOND = 1000
const CACHE_TTL_MS =
  CACHE_TTL_MONTHS *
  DAYS_PER_MONTH *
  HOURS_PER_DAY *
  MINUTES_PER_HOUR *
  SECONDS_PER_MINUTE *
  MILLISECONDS_PER_SECOND
const YOUTUBE_BASE = 'https://www.youtube.com/watch?v='
const TOP_CAST_COUNT = 5
const DEFAULT_VOTE_AVERAGE = 5
const DIRECTOR_JOB = 'Director'
const YOUTUBE_SITE = 'YouTube'
const TRAILER_TYPE = 'Trailer'
const MOVIE_ID_PATTERN = /^\d+$/
const MOVIES_TABLE = 'movies'
const MOVIE_DATA_UNAVAILABLE_MESSAGE = 'Movie data is temporarily unavailable.'
const MOVIE_NOT_FOUND_MESSAGE = 'Movie not found'
const TOO_MANY_MOVIE_DETAIL_REQUESTS_MESSAGE = 'Too many movie detail requests'
const VERCEL_FORWARDED_FOR_HEADER = 'x-vercel-forwarded-for'
const UNKNOWN_GUEST_IP = 'unknown'
const MISSING_GUEST_IDENTITY_MESSAGE =
  'Anonymous movie detail cache misses require x-vercel-forwarded-for'

function isPositiveInteger(value: number): boolean {
  return Number.isInteger(value) && value > 0
}

function parseYear(releaseDate: string): number {
  return parseInt(releaseDate.split('-')[0] || '0', 10)
}

function formatDuration(runtime: number): string {
  if (runtime <= 0) {
    return 'N/A'
  }

  return `${Math.floor(runtime / MINUTES_PER_HOUR)}h ${runtime % MINUTES_PER_HOUR}m`
}

function isCacheStale(cachedAt: string | null): boolean {
  if (!cachedAt) {
    return true
  }

  const cachedTime = new Date(cachedAt).getTime()
  if (!Number.isFinite(cachedTime)) {
    return true
  }

  return cachedTime <= Date.now() - CACHE_TTL_MS
}

function isMovieRowComplete(row: MovieRow): boolean {
  return (
    row.title.trim().length > 0 &&
    row.overview.trim().length > 0 &&
    row.poster_path.trim().length > 0 &&
    row.release_date.trim().length > 0 &&
    row.runtime > 0 &&
    row.genres.length > 0 &&
    row.cast.length > 0 &&
    row.directors.length > 0
  )
}

function shouldRefreshMovie(row: MovieRow | null): boolean {
  if (!row) {
    return true
  }

  return isCacheStale(row.cached_at) || !isMovieRowComplete(row)
}

function pickTrailer(data: TMDBMovieDetails) {
  return data.videos.results
    .filter((video) => video.site === YOUTUBE_SITE && video.type === TRAILER_TYPE && video.official)
    .sort((a, b) => b.published_at.localeCompare(a.published_at))[0]
}

function toMovieResponse(row: MovieRow): MovieResponse {
  const trailerKey = row.trailer_key || null
  const runtime = row.runtime > 0 ? row.runtime : null

  return {
    id: row.tmdb_id,
    title: row.title,
    poster: row.poster_path ? `${IMAGE_BASE}${row.poster_path}` : '',
    backdrop: row.backdrop_path ? `${IMAGE_BASE}${row.backdrop_path}` : '',
    rating: Math.round(row.vote_average * 10) / 10,
    year: parseYear(row.release_date),
    duration: runtime ? formatDuration(runtime) : 'N/A',
    runtime,
    genres: row.genres,
    actors: row.cast,
    directors: row.directors,
    description: row.overview,
    trailer: trailerKey ? `${YOUTUBE_BASE}${trailerKey}` : null,
  }
}

function tmdbDetailsToRow(data: TMDBMovieDetails, cachedAt: string): MovieRow {
  const trailer = pickTrailer(data)
  const genres = data.genres.map((genre) => genre.name)
  const cast = data.credits.cast.slice(0, TOP_CAST_COUNT).map((actor) => actor.name)
  const directors = data.credits.crew
    .filter((crewMember) => crewMember.job === DIRECTOR_JOB)
    .map((crewMember) => crewMember.name)
  const voteAverage = data.vote_average > 0 ? data.vote_average : DEFAULT_VOTE_AVERAGE

  return {
    tmdb_id: data.id,
    original_title: data.original_title ?? data.title,
    title: data.title,
    overview: data.overview,
    poster_path: data.poster_path ?? '',
    backdrop_path: data.backdrop_path ?? '',
    release_date: data.release_date,
    trailer_key: trailer?.key ?? '',
    runtime: data.runtime ?? 0,
    vote_average: voteAverage,
    vote_count: data.vote_count,
    popularity: data.popularity ?? 0,
    genres,
    cast,
    directors,
    cached_at: cachedAt,
  }
}

async function fetchCachedMovie(
  event: Parameters<typeof createServiceSupabaseClient>[0],
  id: number
) {
  const supabase = createServiceSupabaseClient(event)
  const { data, error } = await supabase
    .from(MOVIES_TABLE)
    .select(
      'tmdb_id, original_title, title, overview, poster_path, backdrop_path, release_date, trailer_key, runtime, vote_average, vote_count, popularity, genres, cast, directors, cached_at'
    )
    .eq('tmdb_id', id)
    .maybeSingle()

  if (error) {
    throwSupabaseError(event, error, {
      event: 'movie_details.cache_read_failed',
      tmdbId: id,
      publicMessage: MOVIE_DATA_UNAVAILABLE_MESSAGE,
      extra: {
        table: MOVIES_TABLE,
        operation: 'select',
      },
    })
  }

  return { supabase, row: data as MovieRow | null }
}

function getTrustedGuestIp(event: H3Event): string | null {
  const vercelForwardedFor = getHeader(event, VERCEL_FORWARDED_FOR_HEADER)

  if (!vercelForwardedFor) {
    return null
  }

  return vercelForwardedFor.split(',')[0]?.trim() || null
}

function getBurstGuestIp(event: H3Event): string {
  return getTrustedGuestIp(event) ?? getRequestIP(event) ?? UNKNOWN_GUEST_IP
}

function getErrorStatusCode(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null
  }

  const record = error as Record<string, unknown>

  return typeof record.statusCode === 'number' ? record.statusCode : null
}

async function buildMovieRequestContext(event: H3Event): Promise<MovieRequestContext> {
  const authorizedUser = await getOptionalAuthorizedUser(event)

  if (authorizedUser) {
    return {
      shortWindowIdentity: { userId: authorizedUser.user.id },
      missIdentity: { userId: authorizedUser.user.id },
    }
  }

  return {
    shortWindowIdentity: { guestIp: getBurstGuestIp(event) },
    missIdentity: (() => {
      const trustedGuestIp = getTrustedGuestIp(event)

      if (!trustedGuestIp) {
        return null
      }

      return { guestIp: trustedGuestIp }
    })(),
  }
}

async function enforceMovieDetailsBurstLimit(
  event: H3Event,
  identity: MovieDetailsIdentity
): Promise<void> {
  const rateLimit = await limitMovieDetailsBurst(event, identity)

  if (rateLimit.success) {
    return
  }

  throw createError({
    statusCode: 429,
    statusMessage: TOO_MANY_MOVIE_DETAIL_REQUESTS_MESSAGE,
  })
}

async function enforceMovieDetailsMissLimit(
  event: H3Event,
  identity: MovieDetailsIdentity | null
): Promise<void> {
  if (!identity) {
    throw createError({
      statusCode: 400,
      statusMessage: MISSING_GUEST_IDENTITY_MESSAGE,
    })
  }

  const rateLimit = await limitMovieDetailsMisses(event, identity)

  if (rateLimit.success) {
    return
  }

  throw createError({
    statusCode: 429,
    statusMessage: TOO_MANY_MOVIE_DETAIL_REQUESTS_MESSAGE,
  })
}

export default defineEventHandler(async (event): Promise<MovieResponse> => {
  const rawId = getRouterParam(event, 'id') ?? ''
  if (!MOVIE_ID_PATTERN.test(rawId)) {
    throw createError({ statusCode: 400, message: 'Invalid movie id' })
  }

  const id = Number(rawId)

  if (!isPositiveInteger(id)) {
    throw createError({ statusCode: 400, message: 'Invalid movie id' })
  }

  const requestContext = await buildMovieRequestContext(event)

  await enforceMovieDetailsBurstLimit(event, requestContext.shortWindowIdentity)

  const { supabase, row } = await fetchCachedMovie(event, id)

  if (!shouldRefreshMovie(row) && row) {
    return toMovieResponse(row)
  }

  if (await getMovieDetailsNegativeCache(id)) {
    throw createError({
      statusCode: 404,
      statusMessage: MOVIE_NOT_FOUND_MESSAGE,
    })
  }

  await enforceMovieDetailsMissLimit(event, requestContext.missIdentity)

  try {
    const data = (await fetchTmdb(event, `/movie/${id}`, {
      append_to_response: 'credits,videos',
    })) as TMDBMovieDetails
    const movieRow = tmdbDetailsToRow(data, new Date().toISOString())
    const { error } = await supabase.from(MOVIES_TABLE).upsert(movieRow, { onConflict: 'tmdb_id' })

    if (error) {
      throwSupabaseError(event, error, {
        event: 'movie_details.cache_write_failed',
        tmdbId: id,
        publicMessage: MOVIE_DATA_UNAVAILABLE_MESSAGE,
        extra: {
          table: MOVIES_TABLE,
          operation: 'upsert',
        },
      })
    }

    return toMovieResponse(movieRow)
  } catch (error: unknown) {
    if (getErrorStatusCode(error) === 404) {
      await setMovieDetailsNegativeCache(id)
      throw createError({
        statusCode: 404,
        statusMessage: MOVIE_NOT_FOUND_MESSAGE,
      })
    }

    throw error
  }
})
