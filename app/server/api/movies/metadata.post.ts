import type { MovieListMetadata } from '~/types/movie'
import { getAuthorizedUser } from '../../utils/auth/authorize-user'
import { requireCompletedOnboarding } from '../../utils/auth/onboarding'
import { filterMetadataLimiter } from '../../utils/movies/filter-metadata-rate-limit'
import { throwSupabaseError } from '../../utils/shared/api-error'

interface MetadataRequestBody {
  tmdbIds?: unknown
}

interface MovieRow {
  tmdb_id: number
  title: string
  poster_path: string
  release_date: string
  runtime: number
  genres: string[]
  vote_average: number
}

const MOVIES_TABLE = 'movies'
const LOAD_METADATA_MESSAGE = 'Unable to load movie metadata.'
const RATE_LIMIT_STATUS_MESSAGE = 'Too many metadata requests.'

function parseYear(releaseDate: string): number {
  return Number.parseInt(releaseDate.split('-')[0] || '0', 10)
}

function normalizeTmdbIds(body: MetadataRequestBody): number[] {
  if (!Array.isArray(body.tmdbIds)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid tmdbIds' })
  }

  const uniqueIds = new Set<number>()

  for (const value of body.tmdbIds) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid tmdbIds' })
    }

    uniqueIds.add(value)
  }

  return [...uniqueIds]
}

function createFallbackMovie(tmdbId: number): MovieListMetadata {
  return {
    tmdbId,
    title: '',
    year: 0,
    posterPath: '',
    genres: [],
    runtime: null,
    rating: null,
  }
}

function toMovieListMetadata(row: MovieRow): MovieListMetadata {
  return {
    tmdbId: row.tmdb_id,
    title: row.title,
    year: parseYear(row.release_date),
    posterPath: row.poster_path,
    genres: row.genres ?? [],
    runtime: row.runtime > 0 ? row.runtime : null,
    rating: row.vote_average > 0 ? row.vote_average : null,
  }
}

export default defineEventHandler(async (event) => {
  const { supabase, user } = await getAuthorizedUser(event)
  await requireCompletedOnboarding(event, supabase, user.id)
  const { success } = await filterMetadataLimiter.limit(user.id)

  if (!success) {
    throw createError({
      statusCode: 429,
      statusMessage: RATE_LIMIT_STATUS_MESSAGE,
    })
  }

  const tmdbIds = normalizeTmdbIds(await readBody<MetadataRequestBody>(event))

  if (tmdbIds.length === 0) {
    return {
      success: true,
      movies: [],
    }
  }

  const { data, error } = await supabase
    .from(MOVIES_TABLE)
    .select('tmdb_id, title, poster_path, release_date, runtime, genres, vote_average')
    .in('tmdb_id', tmdbIds)

  if (error) {
    throwSupabaseError(event, error, {
      event: 'movies.metadata_fetch_failed',
      userId: user.id,
      publicMessage: LOAD_METADATA_MESSAGE,
      extra: {
        table: MOVIES_TABLE,
        operation: 'select',
      },
    })
  }

  const rows = (data ?? []) as MovieRow[]
  const rowById = new Map(rows.map((row) => [row.tmdb_id, row]))

  return {
    success: true,
    movies: tmdbIds.map((tmdbId) => {
      const row = rowById.get(tmdbId)
      return row ? toMovieListMetadata(row) : createFallbackMovie(tmdbId)
    }),
  }
})
