import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createApp, createError, defineEventHandler, getQuery, toNodeListener } from 'h3'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cloneRecommendations,
  cloneWatchedMovies,
  createFallbackResponse,
  FRESH_CACHE_RECOMMENDATIONS,
  GENERATED_RECOMMENDATIONS,
  INSUFFICIENT_VALID_RECOMMENDATIONS,
  MY_LIST_MOVIES,
  recommendationIds,
  STALE_RECOMMENDATIONS,
  TEST_USER_ID,
  WATCHED_MOVIES,
} from '../../fixtures/recommendation-fixtures'

const TARGET_RECOMMENDATIONS = 20
const MAX_MY_LIST_RECOMMENDATIONS = 2

const {
  fetchMyListMoviesMock,
  fetchWatchedMoviesMock,
  getAuthorizedUserMock,
  getRecommendationsFromPlatformAiMock,
  acquireRecommendationLockMock,
  releaseRecommendationLockMock,
  logPrivateErrorMock,
  logPrivateInfoMock,
} = vi.hoisted(() => ({
  fetchMyListMoviesMock: vi.fn(),
  fetchWatchedMoviesMock: vi.fn(),
  getAuthorizedUserMock: vi.fn(),
  getRecommendationsFromPlatformAiMock: vi.fn(),
  acquireRecommendationLockMock: vi.fn(),
  releaseRecommendationLockMock: vi.fn(),
  logPrivateErrorMock: vi.fn(),
  logPrivateInfoMock: vi.fn(),
}))

vi.mock('../../../server/utils/auth/authorize-user', () => ({
  getAuthorizedUser: getAuthorizedUserMock,
}))

vi.mock('../../../server/utils/recommendations/movie-history', () => ({
  fetchMyListMovies: fetchMyListMoviesMock,
  fetchWatchedMovies: fetchWatchedMoviesMock,
  hydrateRecommendationsByTmdbIds: (_supabase: unknown, tmdbIds: number[]) =>
    tmdbIds.map((tmdbId) => ({
      name: `Movie ${tmdbId}`,
      originalName: `Movie ${tmdbId}`,
      year: 2000,
      tmdbId,
    })),
}))

vi.mock('../../../server/utils/recommendations/recommendations', () => ({
  getRecommendationsFromPlatformAi: getRecommendationsFromPlatformAiMock,
}))

vi.mock('../../../server/utils/recommendations/cache-policy', () => ({
  hasEnoughRecommendationsToCache: (recommendations: Array<{ tmdbId: number | null }>) =>
    recommendations.filter((recommendation) => recommendation.tmdbId !== null).length >= 5,
}))

vi.mock('../../../server/utils/recommendations/lock', () => ({
  acquireRecommendationLock: acquireRecommendationLockMock,
  releaseRecommendationLock: releaseRecommendationLockMock,
}))

vi.mock('../../../server/utils/shared/redis', () => ({
  createRedisClient: () => ({}),
}))

vi.mock('../../../server/utils/shared/api-error', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../server/utils/shared/api-error')>()

  return {
    ...actual,
    logPrivateError: logPrivateErrorMock,
    logPrivateInfo: logPrivateInfoMock,
  }
})

Object.assign(globalThis, {
  createError,
  defineEventHandler,
  getQuery,
})

const { default: recommendHandler } = await import('../../../server/api/recommend.get')

interface MockCacheRow {
  tmdb_ids: number[]
  watched_hash: string
  expires_at: string
}

interface MockMovieRow {
  tmdb_id: number
  popularity: number
  title?: string
  original_title?: string
  release_date?: string
}

interface MockSupabaseState {
  profileCompletedAt: string | null
  cachedRow: MockCacheRow | null
  movieRows: MockMovieRow[]
  selectError: { message: string } | null
  upsertError: { message: string } | null
  upsertPayload: {
    user_id: string
    tmdb_ids: number[]
    watched_hash: string
    expires_at: string
  } | null
}

function computeWatchedHash(movies: typeof WATCHED_MOVIES): string {
  const sorted = [...movies].sort((a, b) => a.tmdbId - b.tmdbId).map(({ tmdbId }) => ({ tmdbId }))

  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex')
}

function createMockSupabase(state: MockSupabaseState): SupabaseClient {
  return {
    from(table: string) {
      if (table === 'profiles') {
        const profilesBuilder = {
          select() {
            return profilesBuilder
          },
          eq() {
            return profilesBuilder
          },
          limit() {
            return profilesBuilder
          },
          async maybeSingle() {
            return {
              data: {
                onboarding_completed_at: state.profileCompletedAt,
              },
              error: null,
            }
          },
        }

        return profilesBuilder
      }

      if (table === 'movies') {
        const movieBuilder = {
          select() {
            return movieBuilder
          },
          async in(_column: string, tmdbIds: number[]) {
            return {
              data: state.movieRows
                .filter((row) => tmdbIds.includes(row.tmdb_id))
                .map((row) => ({
                  title: `Movie ${row.tmdb_id}`,
                  original_title: `Movie ${row.tmdb_id}`,
                  release_date: '2000-01-01',
                  ...row,
                })),
              error: null,
            }
          },
        }

        return movieBuilder
      }

      const recommendationBuilder = {
        select() {
          return recommendationBuilder
        },
        eq() {
          return recommendationBuilder
        },
        async maybeSingle() {
          if (state.selectError) {
            return { data: null, error: state.selectError }
          }

          return { data: state.cachedRow, error: null }
        },
        async upsert(payload: MockSupabaseState['upsertPayload']) {
          state.upsertPayload = payload

          if (state.upsertError) {
            return { error: state.upsertError }
          }

          if (!payload) {
            return { error: null }
          }

          state.cachedRow = {
            tmdb_ids: [...payload.tmdb_ids],
            watched_hash: payload.watched_hash,
            expires_at: payload.expires_at,
          }

          return { error: null }
        },
      }

      return recommendationBuilder
    },
  } as unknown as SupabaseClient
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>
}

function createRecommendation(tmdbId: number | null, index: number) {
  return {
    name: `Candidate ${index}`,
    originalName: `Candidate ${index}`,
    year: 2000 + index,
    tmdbId,
  }
}

describe('/api/recommend', () => {
  const app = createApp()
  app.use('/api/recommend', recommendHandler)

  let baseUrl = ''
  let server: Server
  let supabaseState: MockSupabaseState

  beforeAll(async () => {
    server = createServer(toNodeListener(app))

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })

    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-23T00:00:00.000Z'))

    supabaseState = {
      profileCompletedAt: '2026-06-14T10:00:00.000Z',
      cachedRow: null,
      movieRows: [
        ...recommendationIds(FRESH_CACHE_RECOMMENDATIONS),
        ...recommendationIds(GENERATED_RECOMMENDATIONS),
        ...recommendationIds(STALE_RECOMMENDATIONS),
        ...recommendationIds(INSUFFICIENT_VALID_RECOMMENDATIONS),
      ].map((tmdb_id) => ({ tmdb_id, popularity: 50 })),
      selectError: null,
      upsertError: null,
      upsertPayload: null,
    }

    getAuthorizedUserMock.mockResolvedValue({
      supabase: createMockSupabase(supabaseState),
      user: { id: TEST_USER_ID },
    })
    acquireRecommendationLockMock.mockResolvedValue({
      key: `recommendation-lock:${TEST_USER_ID}`,
      value: 'lock-token',
    })
    releaseRecommendationLockMock.mockResolvedValue(true)
    fetchWatchedMoviesMock.mockResolvedValue(cloneWatchedMovies(WATCHED_MOVIES))
    fetchMyListMoviesMock.mockResolvedValue(cloneWatchedMovies(MY_LIST_MOVIES))
    getRecommendationsFromPlatformAiMock.mockResolvedValue({
      recommendations: cloneRecommendations(GENERATED_RECOMMENDATIONS),
      tmdbFallbackCount: 0,
      systemPrompt: '',
      userMessage: '',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('returns fresh cached recommendations without calling platform AI', async () => {
    supabaseState.cachedRow = {
      tmdb_ids: recommendationIds(FRESH_CACHE_RECOMMENDATIONS),
      watched_hash: computeWatchedHash(WATCHED_MOVIES),
      expires_at: '2026-04-30T00:00:00.000Z',
    }

    const response = await fetch(`${baseUrl}/api/recommend`)
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.cached).toBe(true)
    expect(body.recommendations).toEqual(recommendationIds(FRESH_CACHE_RECOMMENDATIONS))
    expect(getRecommendationsFromPlatformAiMock).not.toHaveBeenCalled()
  })

  it('regenerates and stores recommendations when cache is not reusable', async () => {
    supabaseState.cachedRow = {
      tmdb_ids: recommendationIds(FRESH_CACHE_RECOMMENDATIONS),
      watched_hash: 'outdated-hash',
      expires_at: '2026-04-20T00:00:00.000Z',
    }

    const response = await fetch(`${baseUrl}/api/recommend?refresh=true`)
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.cached).toBe(false)
    expect(body.recommendations).toEqual(recommendationIds(GENERATED_RECOMMENDATIONS))
    expect(getRecommendationsFromPlatformAiMock).toHaveBeenCalledTimes(1)
    expect(supabaseState.upsertPayload?.tmdb_ids).toEqual(
      recommendationIds(GENERATED_RECOMMENDATIONS)
    )
  })

  it('deduplicates generated recommendations before returning and caching them', async () => {
    getRecommendationsFromPlatformAiMock.mockResolvedValue({
      recommendations: [
        GENERATED_RECOMMENDATIONS[0]!,
        GENERATED_RECOMMENDATIONS[0]!,
        GENERATED_RECOMMENDATIONS[1]!,
        GENERATED_RECOMMENDATIONS[2]!,
        GENERATED_RECOMMENDATIONS[3]!,
        GENERATED_RECOMMENDATIONS[4]!,
      ],
      tmdbFallbackCount: 0,
      systemPrompt: '',
      userMessage: '',
    })

    const response = await fetch(`${baseUrl}/api/recommend?refresh=true`)
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.recommendations).toEqual(recommendationIds(GENERATED_RECOMMENDATIONS))
    expect(supabaseState.upsertPayload?.tmdb_ids).toEqual(
      recommendationIds(GENERATED_RECOMMENDATIONS)
    )
  })

  it('drops unmatched recommendations from the response when TMDB resolution fails', async () => {
    getRecommendationsFromPlatformAiMock.mockResolvedValue({
      recommendations: [
        ...cloneRecommendations(GENERATED_RECOMMENDATIONS),
        {
          name: 'Unknown Festival Cut',
          originalName: 'Unknown Festival Cut',
          year: 2024,
          tmdbId: null,
        },
      ],
      tmdbFallbackCount: 0,
      systemPrompt: '',
      userMessage: '',
    })

    const response = await fetch(`${baseUrl}/api/recommend?refresh=true`)
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.recommendations).toEqual(recommendationIds(GENERATED_RECOMMENDATIONS))
    expect(body).not.toHaveProperty('unmatchedRecommendations')
  })

  it('returns resolved recommendations and stores the sanitized cache payload', async () => {
    const extendedRecommendations = [
      ...cloneRecommendations(GENERATED_RECOMMENDATIONS),
      { ...STALE_RECOMMENDATIONS[0]! },
    ]
    const lowPopularityId = GENERATED_RECOMMENDATIONS[4]!.tmdbId
    supabaseState.movieRows = supabaseState.movieRows.map((row) =>
      row.tmdb_id === lowPopularityId ? { ...row, popularity: 1 } : row
    )
    getRecommendationsFromPlatformAiMock.mockResolvedValue({
      recommendations: extendedRecommendations,
      tmdbFallbackCount: 0,
      systemPrompt: '',
      userMessage: '',
    })

    const response = await fetch(`${baseUrl}/api/recommend?refresh=true`)
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(Array.isArray(body.recommendations)).toBe(true)
    expect((body.recommendations as Array<unknown>).length).toBeGreaterThanOrEqual(5)
    expect(supabaseState.upsertPayload?.tmdb_ids).toEqual(recommendationIds(extendedRecommendations))
  })

  it('filters AI candidates server-side before returning and caching final recommendations', async () => {
    const watchedMovie = WATCHED_MOVIES[0]

    if (!watchedMovie) {
      throw new Error('Expected watched movie fixture')
    }

    supabaseState.cachedRow = {
      tmdb_ids: [200],
      watched_hash: 'stale-hash',
      expires_at: '2026-04-01T00:00:00.000Z',
    }
    const sessionExcludedTmdbId = 400
    const nonMyListIds = [300, sessionExcludedTmdbId, ...Array.from({ length: 17 }, (_, index) => 301 + index)]
    const myListMovies = Array.from({ length: MAX_MY_LIST_RECOMMENDATIONS + 2 }, (_, index) => ({
      tmdbId: 21 + index,
      title: `My List ${index + 1}`,
      year: 2010 + index,
    }))
    const candidates = [
      createRecommendation(null, 1),
      createRecommendation(watchedMovie.tmdbId, 2),
      createRecommendation(200, 3),
      createRecommendation(300, 4),
      createRecommendation(300, 5),
      createRecommendation(sessionExcludedTmdbId, 6),
      ...nonMyListIds.slice(2).map((tmdbId, index) => createRecommendation(tmdbId, index + 7)),
      ...myListMovies.map((movie, index) => createRecommendation(movie.tmdbId, index + 30)),
    ]
    const expectedRecommendationIds = [
      ...nonMyListIds.filter((tmdbId) => tmdbId !== sessionExcludedTmdbId),
      ...myListMovies.slice(0, MAX_MY_LIST_RECOMMENDATIONS).map((movie) => movie.tmdbId),
    ]

    fetchMyListMoviesMock.mockResolvedValue(myListMovies)
    getRecommendationsFromPlatformAiMock.mockResolvedValue({
      recommendations: candidates,
      tmdbFallbackCount: 0,
      systemPrompt: '',
      userMessage: '',
    })

    const response = await fetch(
      `${baseUrl}/api/recommend?getNew=true&sessionRecommendedTmdbIds=${sessionExcludedTmdbId}`
    )
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.recommendations).toHaveLength(TARGET_RECOMMENDATIONS)
    expect(body.recommendations).toEqual(expectedRecommendationIds)
    expect(body.recommendations).not.toContain(watchedMovie.tmdbId)
    expect(body.recommendations).not.toContain(200)
    expect(body.recommendations).not.toContain(sessionExcludedTmdbId)
    expect(body.recommendations).not.toContain(null)
    expect(supabaseState.upsertPayload?.tmdb_ids).toEqual(expectedRecommendationIds)
    expect(getRecommendationsFromPlatformAiMock.mock.calls[0]?.[4]).toEqual([
      {
        name: 'Movie 200',
        originalName: 'Movie 200',
        year: 2000,
        tmdbId: 200,
      },
    ])
    expect(getRecommendationsFromPlatformAiMock.mock.calls[0]?.[5]).toEqual([
      200,
      sessionExcludedTmdbId,
    ])
    expect(logPrivateInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'recommendation.filtering_completed',
        extra: expect.objectContaining({
          aiCandidateCount: candidates.length,
          finalFilteredCount: TARGET_RECOMMENDATIONS,
          removedWatchedCount: 1,
          removedExcludedCount: 2,
          removedDuplicateCount: 1,
          removedNullTmdbIdCount: 1,
          myListRecommendationsKeptCount: MAX_MY_LIST_RECOMMENDATIONS,
        }),
      })
    )
  })

  it('falls back to cached recommendations when regeneration fails with a 503', async () => {
    supabaseState.cachedRow = {
      tmdb_ids: recommendationIds(STALE_RECOMMENDATIONS),
      watched_hash: 'expired-hash',
      expires_at: '2026-04-01T00:00:00.000Z',
    }
    getRecommendationsFromPlatformAiMock.mockRejectedValue(
      createError({
        statusCode: 503,
        statusMessage: 'Platform AI is temporarily unavailable due to high demand.',
      })
    )

    const response = await fetch(`${baseUrl}/api/recommend?refresh=true`)
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body).toEqual(
      createFallbackResponse(
        503,
        'Platform AI is temporarily unavailable due to high demand.',
        true,
        recommendationIds(STALE_RECOMMENDATIONS)
      )
    )
    expect(logPrivateErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'recommendation.regeneration_failed',
        source: 'ai_provider',
        statusCode: 503,
        userId: TEST_USER_ID,
      })
    )
  })

  it('falls back to cached recommendations when regeneration fails with a 429', async () => {
    supabaseState.cachedRow = {
      tmdb_ids: recommendationIds(STALE_RECOMMENDATIONS),
      watched_hash: 'expired-hash',
      expires_at: '2026-04-01T00:00:00.000Z',
    }
    getRecommendationsFromPlatformAiMock.mockRejectedValue(
      createError({
        statusCode: 429,
        statusMessage: 'Daily recommendation limit reached. Please try again tomorrow.',
      })
    )

    const response = await fetch(`${baseUrl}/api/recommend?refresh=true`)
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body).toEqual(
      createFallbackResponse(
        429,
        'Daily recommendation limit reached. Please try again tomorrow.',
        false,
        recommendationIds(STALE_RECOMMENDATIONS)
      )
    )
  })

  it('falls back to cached recommendations when regeneration returns too few valid ids', async () => {
    supabaseState.cachedRow = {
      tmdb_ids: recommendationIds(STALE_RECOMMENDATIONS),
      watched_hash: 'expired-hash',
      expires_at: '2026-04-01T00:00:00.000Z',
    }
    getRecommendationsFromPlatformAiMock.mockResolvedValue({
      recommendations: cloneRecommendations(INSUFFICIENT_VALID_RECOMMENDATIONS),
      tmdbFallbackCount: 0,
      systemPrompt: '',
      userMessage: '',
    })

    const response = await fetch(`${baseUrl}/api/recommend?refresh=true`)
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body).toEqual(
      createFallbackResponse(
        502,
        'Recommendation generation returned too few valid TMDB matches.',
        false,
        recommendationIds(STALE_RECOMMENDATIONS)
      )
    )
  })

  it('preserves the original error when regeneration fails without stored fallback', async () => {
    getRecommendationsFromPlatformAiMock.mockRejectedValue(
      createError({
        statusCode: 503,
        statusMessage: 'Platform AI is temporarily unavailable due to high demand.',
      })
    )

    const response = await fetch(`${baseUrl}/api/recommend?refresh=true`)
    const body = await readJson(response)

    expect(response.status).toBe(503)
    expect(body.statusCode).toBe(503)
    expect(body.statusMessage).toBe('Platform AI is temporarily unavailable due to high demand.')
  })
})
