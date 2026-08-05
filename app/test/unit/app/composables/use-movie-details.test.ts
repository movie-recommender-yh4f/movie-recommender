import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const MOVIE_ID = 41154
const ACCESS_TOKEN = 'test-access-token'
const MOVIE_DETAILS_URL = `/api/movies/${MOVIE_ID}`

const {
  fetchMock,
  getSessionMock,
  useSupabaseMock,
  useStateMock,
} = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  getSessionMock: vi.fn(),
  useSupabaseMock: vi.fn(),
  useStateMock: vi.fn(),
}))

vi.mock('../../../../app/composables/useSupabase', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../app/composables/useSupabase')>()

  return {
    ...actual,
    useSupabase: useSupabaseMock,
  }
})

vi.mock('~/constants', () => ({
  IMAGE_BASE: 'https://image.tmdb.org/t/p/w500',
}))

Object.assign(globalThis, {
  $fetch: fetchMock,
  useState: useStateMock,
})

const { useMovieDetails } = await import('../../../../app/composables/useMovieDetails')

describe('useMovieDetails', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    getSessionMock.mockReset()
    useSupabaseMock.mockReset()
    useStateMock.mockReset()

    useSupabaseMock.mockReturnValue({
      auth: {
        getSession: getSessionMock,
      },
    })
    useStateMock.mockImplementation((_key: string, init?: () => unknown) => ref(init?.()))
    getSessionMock.mockResolvedValue({
      data: {
        session: {
          access_token: ACCESS_TOKEN,
        },
      },
    })
    fetchMock.mockResolvedValue({
      id: MOVIE_ID,
      title: 'Fight Club',
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('sends the Supabase access token when loading movie details', async () => {
    const { getMovieDetails } = useMovieDetails()

    await getMovieDetails(MOVIE_ID)

    expect(getSessionMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(MOVIE_DETAILS_URL, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
    })
  })
})
