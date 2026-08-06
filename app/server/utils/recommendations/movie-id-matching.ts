import type { H3Event } from 'h3'
import { INITIAL_RECOMMENDATION_COUNT } from './constants'
import type { Recommendation, RecommendationWithId } from './types'
import { fetchTmdb } from '../tmdb/client'
import { searchMoviesBatch } from '../tmdb/search-movies'
import type { MovieSearchResult } from '../tmdb/search-movies'
import { logPrivateError } from '../shared/api-error'

interface TmdbSearchMovieResult {
  id: number
  original_title: string
  title: string
  release_date?: string
}

interface TmdbSearchResponse {
  results?: TmdbSearchMovieResult[]
}

function getSearchCandidates(recommendation: Recommendation): string[] {
  const candidates = [recommendation.originalName, recommendation.name]
    .map((title) => title.trim())
    .filter((title) => title.length > 0)

  return [...new Set(candidates)]
}

function normalizeTitleForComparison(title: string): string {
  return title.trim().toLowerCase()
}

function getSearchYear(recommendation: Recommendation): number | undefined {
  if (
    typeof recommendation.year === 'number' &&
    Number.isInteger(recommendation.year) &&
    recommendation.year > 0
  ) {
    return recommendation.year
  }

  return undefined
}

function pickBestMatchId(
  candidates: string[],
  results: MovieSearchResult[],
  recommendationYear?: number
): number | null {
  if (results.length === 0) return null

  const normalizedCandidates = candidates.map(normalizeTitleForComparison)

  if (recommendationYear) {
    const titleAndYearMatch = results.find(
      (result) =>
        result.year === recommendationYear &&
        normalizedCandidates.some(
          (candidate) => candidate === normalizeTitleForComparison(result.original_title)
        )
    )
    if (titleAndYearMatch) return titleAndYearMatch.tmdb_id
  }

  const titleOnlyMatch = results.find((result) =>
    normalizedCandidates.some(
      (candidate) => candidate === normalizeTitleForComparison(result.original_title)
    )
  )
  if (titleOnlyMatch) return titleOnlyMatch.tmdb_id

  return null
}

function parseYear(releaseDate: string): number {
  return Number.parseInt(releaseDate.split('-')[0] || '0', 10)
}

function pickBestTmdbSearchResult(
  candidates: string[],
  results: TmdbSearchMovieResult[],
  recommendationYear?: number
): TmdbSearchMovieResult | null {
  if (results.length === 0) {
    return null
  }

  const normalizedCandidates = candidates.map(normalizeTitleForComparison)
  if (recommendationYear) {
    // exact is stricter. Might not be needed but I have no will to test removing it
    const exactYearMatch = results.find((result) => {
      const resultYear = parseYear(result.release_date ?? '')
      const normalizedOriginalTitle = normalizeTitleForComparison(result.original_title)
      const normalizedTitle = normalizeTitleForComparison(result.title)

      return (
        resultYear === recommendationYear &&
        normalizedCandidates.some(
          (candidate) => candidate === normalizedOriginalTitle || candidate === normalizedTitle
        )
      )
    })

    if (exactYearMatch) {
      return exactYearMatch
    }

    const yearMatchedResult = results.find(
      (result) => parseYear(result.release_date ?? '') === recommendationYear
    )
    if (yearMatchedResult) {
      return yearMatchedResult
    }
  }

  return results[0] ?? null
}

function isErrorWithStatusCode(error: unknown, statusCode: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    typeof (error as { statusCode?: unknown }).statusCode === 'number' &&
    (error as { statusCode: number }).statusCode === statusCode
  )
}

async function searchTmdbMovieId(
  event: H3Event,
  recommendation: Recommendation
): Promise<number | null> {
  const candidates = getSearchCandidates(recommendation)
  const searchYear = getSearchYear(recommendation)

  for (const candidate of candidates) {
    try {
      const payload = (await fetchTmdb(event, '/search/movie', {
        query: candidate,
        ...(searchYear && { year: searchYear }),
      })) as TmdbSearchResponse
      const bestMatch = pickBestTmdbSearchResult(candidates, payload.results ?? [], searchYear)

      if (bestMatch) {
        return bestMatch.id
      }
    } catch (error) {
      if (isErrorWithStatusCode(error, 429)) {
        return null
      }
    }
  }

  return null
}

export async function appendTmdbIds(
  recommendations: Recommendation[],
  event?: H3Event
): Promise<{ recommendations: RecommendationWithId[]; tmdbFallbackCount: number }> {
  const limited = recommendations.slice(0, INITIAL_RECOMMENDATION_COUNT)

  const allCandidates = limited.flatMap((recommendation) =>
    getSearchCandidates(recommendation).map((query) => ({
      query,
      year: getSearchYear(recommendation),
    }))
  )

  let searchMap: Map<string, MovieSearchResult[]>
  try {
    searchMap = await searchMoviesBatch(allCandidates)
  } catch (error) {
    logPrivateError({
      cause: error,
      event: 'recommendation.search_batch_failed',
      source: 'supabase',
      statusCode: 500,
      extra: {
        candidates: allCandidates,
        candidateCount: allCandidates.length,
      },
    })

    return {
      recommendations: limited.map((recommendation) => ({ ...recommendation, tmdbId: null })),
      tmdbFallbackCount: 0,
    }
  }

  let tmdbFallbackCount = 0

  const results = await Promise.all(
    limited.map(async (recommendation) => {
      const candidates = getSearchCandidates(recommendation)
      const searchYear = getSearchYear(recommendation)

      for (const candidate of candidates) {
        const searchResults = searchMap.get(`${candidate}::${searchYear ?? ''}`) ?? []
        const tmdbId = pickBestMatchId(candidates, searchResults, searchYear)
        if (tmdbId !== null) return { ...recommendation, tmdbId }
      }

      if (!event) {
        return { ...recommendation, tmdbId: null }
      }

      tmdbFallbackCount++
      return {
        ...recommendation,
        tmdbId: await searchTmdbMovieId(event, recommendation),
      }
    })
  )

  return { recommendations: results, tmdbFallbackCount }
}
