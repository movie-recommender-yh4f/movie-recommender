import type { SupabaseClient } from '@supabase/supabase-js'
import { logPrivateError } from '../shared/api-error'
import { createSupabaseServerClient } from '../shared/supabase-client'

const MAX_RESULTS = 20
const MIN_QUERY_LENGTH = 2
const MOVIES_TABLE = 'movies'
const SEARCH_COLUMNS = 'tmdb_id, original_title, popularity, release_date'
const TSQUERY_SUFFIX = ':*'
const TSQUERY_SEPARATOR = ' & '
const MOVIE_SEARCH_UNAVAILABLE_MESSAGE = 'Movie search is temporarily unavailable.'
const SERVICE_UNAVAILABLE_MESSAGE = 'Service is temporarily unavailable.'

interface MovieSearchRow {
  tmdb_id: number
  original_title: string
  popularity: number
  release_date: string
}

export interface MovieSearchResult {
  tmdb_id: number
  original_title: string
  popularity: number
  year: number
}

interface RpcMovieSearchRow {
  query: string
  year: number | null
  tmdb_id: number
  original_title: string
  popularity: number
  release_date: string
}

interface SearchCandidate {
  query: string
  year?: number
}

function createSearchSupabaseClient(): SupabaseClient {
  const config = useRuntimeConfig()
  const { supabaseUrl } = config.public
  const serviceRoleKey = config.supabaseServiceRoleKey

  if (!supabaseUrl || !serviceRoleKey) {
    logPrivateError({
      cause: new Error('Missing Supabase search configuration'),
      event: 'movie_search.misconfigured',
      source: 'config',
      statusCode: 503,
    })

    throw createError({
      statusCode: 503,
      statusMessage: SERVICE_UNAVAILABLE_MESSAGE,
    })
  }

  return createSupabaseServerClient(supabaseUrl, serviceRoleKey)
}

function parseYear(releaseDate: string): number {
  return Number.parseInt(releaseDate.split('-')[0] || '0', 10)
}

function buildTsQuery(query: string): string | null {
  const tokens = query.trim().toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  if (tokens.length === 0) {
    return null
  }

  return tokens.map((token) => `${token}${TSQUERY_SUFFIX}`).join(TSQUERY_SEPARATOR)
}

async function executeSearch(
  supabase: SupabaseClient,
  query: string,
  year?: number
): Promise<MovieSearchResult[]> {
  if (query.trim().length < MIN_QUERY_LENGTH) {
    return []
  }

  const tsQuery = buildTsQuery(query)
  if (!tsQuery) {
    return []
  }

  let builder = supabase
    .from(MOVIES_TABLE)
    .select(SEARCH_COLUMNS)
    .filter('fts_vector', 'fts', tsQuery)
    .order('popularity', { ascending: false })

  if (year) {
    builder = builder
      .gte('release_date', `${year}-01-01`)
      .lte('release_date', `${year}-12-31`)
  }

  const { data, error } = await builder.limit(MAX_RESULTS)
  if (error) {
    logPrivateError({
      cause: error,
      event: 'movie_search.query_failed',
      source: 'supabase',
      statusCode: 500,
      extra: {
        table: MOVIES_TABLE,
        query,
        year,
      },
    })

    throw createError({ statusCode: 500, statusMessage: MOVIE_SEARCH_UNAVAILABLE_MESSAGE })
  }

  const rows = (data ?? []) as MovieSearchRow[]
  if (rows.length === 0 && year) {
    return executeSearch(supabase, query)
  }

  return rows.map((row) => ({
    tmdb_id: row.tmdb_id,
    original_title: row.original_title,
    popularity: row.popularity,
    year: parseYear(row.release_date),
  }))
}

export async function searchMovies(query: string, year?: number): Promise<MovieSearchResult[]> {
  return executeSearch(createSearchSupabaseClient(), query, year)
}

export async function searchMoviesBatch(
  candidates: SearchCandidate[]
): Promise<Map<string, MovieSearchResult[]>> {
  const uniqueCandidates = [
    ...new Map(
      candidates
        .filter(({ query }) => query.trim().length >= MIN_QUERY_LENGTH)
        .map((candidate) => [`${candidate.query}::${candidate.year ?? ''}`, candidate] as const)
    ).values(),
  ]

  if (uniqueCandidates.length === 0) {
    return new Map()
  }

  const supabase = createSearchSupabaseClient()
  const { data, error } = await supabase.rpc('search_movies_batch', {
    search_candidates: uniqueCandidates,
  })

  if (error) {
    logPrivateError({
      cause: error,
      event: 'movie_search.batch_query_failed',
      source: 'supabase',
      statusCode: 500,
      extra: { candidateCount: uniqueCandidates.length },
    })

    throw createError({ statusCode: 500, statusMessage: MOVIE_SEARCH_UNAVAILABLE_MESSAGE })
  }

  const results = new Map<string, MovieSearchResult[]>()
  for (const row of (data ?? []) as RpcMovieSearchRow[]) {
    const key = `${row.query}::${row.year ?? ''}`
    const currentResults = results.get(key) ?? []
    if (currentResults.length >= MAX_RESULTS) continue

    currentResults.push({
      tmdb_id: row.tmdb_id,
      original_title: row.original_title,
      popularity: row.popularity,
      year: parseYear(row.release_date),
    })
    results.set(key, currentResults)
  }

  return results
}
