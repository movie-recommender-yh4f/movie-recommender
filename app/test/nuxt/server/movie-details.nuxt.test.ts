import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import {
  createApp,
  createError,
  defineEventHandler,
  getHeader,
  getRequestIP,
  getRouterParam,
  toNodeListener,
} from 'h3'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const RATE_LIMIT_RESET = 1_234_567_890
const MOVIE_NOT_FOUND_STATUS_MESSAGE = 'Movie not found'
const TOO_MANY_MOVIE_DETAIL_REQUESTS_STATUS_MESSAGE = 'Too many movie detail requests'
const MISSING_GUEST_IDENTITY_STATUS_MESSAGE =
  'Anonymous movie detail cache misses require x-vercel-forwarded-for'
const GUEST_IP_HEADER = 'x-vercel-forwarded-for'
const GUEST_IP = '203.0.113.10'

const {
  fetchTmdbMock,
  getOptionalAuthorizedUserMock,
  getServiceSupabaseMock,
  limitMovieDetailsBurstMock,
  limitMovieDetailsMissesMock,
  getMovieDetailsNegativeCacheMock,
  setMovieDetailsNegativeCacheMock,
} = vi.hoisted(() => ({
  fetchTmdbMock: vi.fn(),
  getOptionalAuthorizedUserMock: vi.fn(),
  getServiceSupabaseMock: vi.fn(),
  limitMovieDetailsBurstMock: vi.fn(),
  limitMovieDetailsMissesMock: vi.fn(),
  getMovieDetailsNegativeCacheMock: vi.fn(),
  setMovieDetailsNegativeCacheMock: vi.fn(),
}))

vi.mock('../../../server/utils/tmdb/client', () => ({
  fetchTmdb: fetchTmdbMock,
}))

vi.mock('../../../server/utils/auth/authorize-user', () => ({
  getOptionalAuthorizedUser: getOptionalAuthorizedUserMock,
}))

vi.mock('../../../server/utils/movies/details-rate-limit', () => ({
  limitMovieDetailsBurst: limitMovieDetailsBurstMock,
  limitMovieDetailsMisses: limitMovieDetailsMissesMock,
}))

vi.mock('../../../server/utils/movies/negative-cache', () => ({
  getMovieDetailsNegativeCache: getMovieDetailsNegativeCacheMock,
  setMovieDetailsNegativeCache: setMovieDetailsNegativeCacheMock,
}))

vi.mock('../../../server/utils/shared/supabase-client', () => ({
  createServiceSupabaseClient: getServiceSupabaseMock,
}))

Object.assign(globalThis, {
  createError,
  defineEventHandler,
  getHeader,
  getRequestIP,
  getRouterParam,
})

const { default: movieDetailsHandler } = await import('../../../server/api/movies/[id].get')

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

interface MovieState {
  row: MovieRow | null
  upsertPayload: Record<string, unknown> | null
}

const FRESH_DATE = '2026-04-01T00:00:00.000Z'

const completeRow: MovieRow = {
  tmdb_id: 550,
  original_title: 'Fight Club',
  title: 'Fight Club',
  overview: 'An insomniac office worker forms an underground club.',
  poster_path: '/fight-club.jpg',
  backdrop_path: '/fight-club-backdrop.jpg',
  release_date: '1999-10-15',
  trailer_key: 'trailer-key',
  runtime: 139,
  vote_average: 8.4,
  vote_count: 30000,
  popularity: 90,
  genres: ['Drama'],
  cast: ['Edward Norton', 'Brad Pitt'],
  directors: ['David Fincher'],
  cached_at: FRESH_DATE,
}

function createMockSupabase(state: MovieState) {
  return {
    from(table: string) {
      expect(table).toBe('movies')

      const builder = {
        select() {
          return builder
        },
        eq() {
          return builder
        },
        async maybeSingle() {
          return { data: state.row, error: null }
        },
        async upsert(payload: Record<string, unknown>) {
          state.upsertPayload = payload
          return { error: null }
        },
      }

      return builder
    },
  }
}

function createTmdbDetails() {
  return {
    id: 550,
    title: 'Fight Club',
    original_title: 'Fight Club',
    poster_path: '/fight-club.jpg',
    backdrop_path: '/fight-club-backdrop.jpg',
    vote_average: 8.4,
    vote_count: 30000,
    popularity: 90,
    release_date: '1999-10-15',
    overview: 'An insomniac office worker forms an underground club.',
    runtime: 139,
    genres: [{ id: 18, name: 'Drama' }],
    credits: {
      cast: [{ name: 'Edward Norton' }, { name: 'Brad Pitt' }],
      crew: [{ name: 'David Fincher', job: 'Director' }],
    },
    videos: {
      results: [
        {
          key: 'trailer-key',
          site: 'YouTube',
          type: 'Trailer',
          official: true,
          published_at: '1999-01-01T00:00:00.000Z',
        },
      ],
    },
  }
}

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>
}

function createRateLimitResult(
  overrides: Partial<{ success: boolean; limit: number; remaining: number; reset: number }> = {}
) {
  return {
    success: true,
    limit: 5,
    remaining: 4,
    reset: RATE_LIMIT_RESET,
    ...overrides,
  }
}

function createNotFoundError() {
  return createError({
    statusCode: 404,
    statusMessage: 'Movie data is temporarily unavailable.',
  })
}

describe('/api/movies/:id', () => {
  const app = createApp()
  app.use(
    '/api/movies/550',
    defineEventHandler((event) => {
      event.context.params = { id: '550' }
      return movieDetailsHandler(event)
    })
  )

  let baseUrl = ''
  let server: Server
  let state: MovieState

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
    vi.setSystemTime(new Date('2026-04-26T00:00:00.000Z'))
    state = {
      row: { ...completeRow },
      upsertPayload: null,
    }
    getServiceSupabaseMock.mockReturnValue(createMockSupabase(state))
    getOptionalAuthorizedUserMock.mockResolvedValue(null)
    fetchTmdbMock.mockResolvedValue(createTmdbDetails())
    limitMovieDetailsBurstMock.mockResolvedValue(createRateLimitResult())
    limitMovieDetailsMissesMock.mockResolvedValue(createRateLimitResult())
    getMovieDetailsNegativeCacheMock.mockResolvedValue(false)
    setMovieDetailsNegativeCacheMock.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('returns a complete fresh Supabase cache row without fetching TMDB', async () => {
    const response = await fetch(`${baseUrl}/api/movies/550`)
    const body = await readJson(response)

    expect(response.status).toBe(200)
    expect(body.title).toBe('Fight Club')
    expect(body.poster).toBe('https://image.tmdb.org/t/p/w500/fight-club.jpg')
    expect(body.runtime).toBe(139)
    expect(fetchTmdbMock).not.toHaveBeenCalled()
    expect(limitMovieDetailsMissesMock).not.toHaveBeenCalled()
    expect(getMovieDetailsNegativeCacheMock).not.toHaveBeenCalled()
    expect(state.upsertPayload).toBeNull()
  })

  it('refreshes the cache when cached_at is null', async () => {
    state.row = { ...completeRow, cached_at: null }

    const response = await fetch(`${baseUrl}/api/movies/550`, {
      headers: {
        [GUEST_IP_HEADER]: GUEST_IP,
      },
    })

    expect(response.status).toBe(200)
    expect(getMovieDetailsNegativeCacheMock).toHaveBeenCalledWith(550)
    expect(limitMovieDetailsMissesMock).toHaveBeenCalledWith(expect.anything(), {
      guestIp: GUEST_IP,
    })
    expect(fetchTmdbMock).toHaveBeenCalledWith(expect.anything(), '/movie/550', {
      append_to_response: 'credits,videos',
    })
    expect(state.upsertPayload).toMatchObject({
      tmdb_id: 550,
      title: 'Fight Club',
      runtime: 139,
      genres: ['Drama'],
      cached_at: '2026-04-26T00:00:00.000Z',
    })
  })

  it('refreshes the cache when required sentinel fields are missing', async () => {
    state.row = { ...completeRow, title: '', poster_path: '', genres: [], runtime: 0 }

    const response = await fetch(`${baseUrl}/api/movies/550`, {
      headers: {
        [GUEST_IP_HEADER]: GUEST_IP,
      },
    })

    expect(response.status).toBe(200)
    expect(getMovieDetailsNegativeCacheMock).toHaveBeenCalledWith(550)
    expect(limitMovieDetailsMissesMock).toHaveBeenCalledWith(expect.anything(), {
      guestIp: GUEST_IP,
    })
    expect(fetchTmdbMock).toHaveBeenCalledTimes(1)
    expect(state.upsertPayload).toMatchObject({
      title: 'Fight Club',
      poster_path: '/fight-club.jpg',
      runtime: 139,
      genres: ['Drama'],
    })
  })

  it('rate-limits authenticated users by user id', async () => {
    getOptionalAuthorizedUserMock.mockResolvedValue({
      user: { id: 'user-123' },
    })
    limitMovieDetailsBurstMock.mockResolvedValue(
      createRateLimitResult({ success: false, limit: 20, remaining: 0 })
    )

    const response = await fetch(`${baseUrl}/api/movies/550`, {
      headers: {
        Authorization: 'Bearer valid-token',
      },
    })
    const body = await readJson(response)

    expect(response.status).toBe(429)
    expect(body.statusMessage).toBe(TOO_MANY_MOVIE_DETAIL_REQUESTS_STATUS_MESSAGE)
    expect(limitMovieDetailsBurstMock).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-123',
    })
    expect(limitMovieDetailsMissesMock).not.toHaveBeenCalled()
    expect(fetchTmdbMock).not.toHaveBeenCalled()
  })

  it('rate-limits guests by the Vercel forwarded IP header', async () => {
    limitMovieDetailsBurstMock.mockResolvedValue(
      createRateLimitResult({ success: false, limit: 10, remaining: 0 })
    )

    const response = await fetch(`${baseUrl}/api/movies/550`, {
      headers: {
        [GUEST_IP_HEADER]: `${GUEST_IP}, 198.51.100.2`,
      },
    })
    const body = await readJson(response)

    expect(response.status).toBe(429)
    expect(body.statusMessage).toBe(TOO_MANY_MOVIE_DETAIL_REQUESTS_STATUS_MESSAGE)
    expect(limitMovieDetailsBurstMock).toHaveBeenCalledWith(expect.anything(), {
      guestIp: GUEST_IP,
    })
    expect(limitMovieDetailsMissesMock).not.toHaveBeenCalled()
    expect(fetchTmdbMock).not.toHaveBeenCalled()
  })

  it('falls back to the request IP for the short-window guest limiter when the Vercel header is missing', async () => {
    limitMovieDetailsBurstMock.mockResolvedValue(
      createRateLimitResult({ success: false, limit: 10, remaining: 0 })
    )

    const response = await fetch(`${baseUrl}/api/movies/550`)
    const body = await readJson(response)

    expect(response.status).toBe(429)
    expect(body.statusMessage).toBe(TOO_MANY_MOVIE_DETAIL_REQUESTS_STATUS_MESSAGE)
    expect(limitMovieDetailsBurstMock).toHaveBeenCalledWith(expect.anything(), {
      guestIp: '127.0.0.1',
    })
    expect(limitMovieDetailsMissesMock).not.toHaveBeenCalled()
    expect(fetchTmdbMock).not.toHaveBeenCalled()
  })

  it('returns a cached negative lookup without charging the miss budget or calling TMDB', async () => {
    state.row = null
    getMovieDetailsNegativeCacheMock.mockResolvedValue(true)

    const response = await fetch(`${baseUrl}/api/movies/550`)
    const body = await readJson(response)

    expect(response.status).toBe(404)
    expect(body.statusMessage).toBe(MOVIE_NOT_FOUND_STATUS_MESSAGE)
    expect(limitMovieDetailsMissesMock).not.toHaveBeenCalled()
    expect(fetchTmdbMock).not.toHaveBeenCalled()
    expect(setMovieDetailsNegativeCacheMock).not.toHaveBeenCalled()
  })

  it('writes a negative cache entry when TMDB returns not found', async () => {
    state.row = null
    fetchTmdbMock.mockRejectedValue(createNotFoundError())

    const response = await fetch(`${baseUrl}/api/movies/550`, {
      headers: {
        [GUEST_IP_HEADER]: GUEST_IP,
      },
    })
    const body = await readJson(response)

    expect(response.status).toBe(404)
    expect(body.statusMessage).toBe(MOVIE_NOT_FOUND_STATUS_MESSAGE)
    expect(limitMovieDetailsMissesMock).toHaveBeenCalledWith(expect.anything(), {
      guestIp: GUEST_IP,
    })
    expect(setMovieDetailsNegativeCacheMock).toHaveBeenCalledWith(550)
  })

  it('does not write a negative cache entry for non-404 TMDB failures', async () => {
    state.row = null
    fetchTmdbMock.mockRejectedValue(
      createError({
        statusCode: 503,
        statusMessage: 'Movie data is temporarily unavailable.',
      })
    )

    const response = await fetch(`${baseUrl}/api/movies/550`, {
      headers: {
        [GUEST_IP_HEADER]: GUEST_IP,
      },
    })
    const body = await readJson(response)

    expect(response.status).toBe(503)
    expect(body.statusMessage).toBe('Movie data is temporarily unavailable.')
    expect(setMovieDetailsNegativeCacheMock).not.toHaveBeenCalled()
  })

  it('rate-limits uncached authenticated misses by user id', async () => {
    state.row = null
    getOptionalAuthorizedUserMock.mockResolvedValue({
      user: { id: 'user-123' },
    })
    limitMovieDetailsMissesMock.mockResolvedValue(
      createRateLimitResult({ success: false, limit: 100, remaining: 0 })
    )

    const response = await fetch(`${baseUrl}/api/movies/550`, {
      headers: {
        Authorization: 'Bearer valid-token',
      },
    })
    const body = await readJson(response)

    expect(response.status).toBe(429)
    expect(body.statusMessage).toBe(TOO_MANY_MOVIE_DETAIL_REQUESTS_STATUS_MESSAGE)
    expect(limitMovieDetailsMissesMock).toHaveBeenCalledWith(expect.anything(), {
      userId: 'user-123',
    })
    expect(fetchTmdbMock).not.toHaveBeenCalled()
  })

  it('rate-limits uncached guest misses by forwarded IP', async () => {
    state.row = null
    limitMovieDetailsMissesMock.mockResolvedValue(
      createRateLimitResult({ success: false, limit: 20, remaining: 0 })
    )

    const response = await fetch(`${baseUrl}/api/movies/550`, {
      headers: {
        [GUEST_IP_HEADER]: GUEST_IP,
      },
    })
    const body = await readJson(response)

    expect(response.status).toBe(429)
    expect(body.statusMessage).toBe(TOO_MANY_MOVIE_DETAIL_REQUESTS_STATUS_MESSAGE)
    expect(limitMovieDetailsMissesMock).toHaveBeenCalledWith(expect.anything(), {
      guestIp: GUEST_IP,
    })
    expect(fetchTmdbMock).not.toHaveBeenCalled()
  })

  it('rejects anonymous uncached misses when the Vercel header is missing', async () => {
    state.row = null

    const response = await fetch(`${baseUrl}/api/movies/550`)
    const body = await readJson(response)

    expect(response.status).toBe(400)
    expect(body.statusMessage).toBe(MISSING_GUEST_IDENTITY_STATUS_MESSAGE)
    expect(limitMovieDetailsMissesMock).not.toHaveBeenCalled()
    expect(fetchTmdbMock).not.toHaveBeenCalled()
  })
})
