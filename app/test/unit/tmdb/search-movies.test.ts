import { createError } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

const { searchMovies, searchMoviesBatch } = await import('../../../server/utils/tmdb/search-movies')

interface SearchRow {
  tmdb_id: number
  original_title: string
  popularity: number
  release_date: string
}

function createBuilder(rowsByQuery: Map<string, SearchRow[]>) {
  let queryValue = ''
  let startDate = ''
  let endDate = ''

  const builder = {
    select() {
      return builder
    },
    filter(_column: string, _operator: string, value: string) {
      queryValue = value
      return builder
    },
    order() {
      return builder
    },
    limit() {
      const key = `${queryValue}::${startDate}::${endDate}`

      return Promise.resolve({
        data: rowsByQuery.get(key) ?? [],
        error: null,
      })
    },
    gte(_column: string, value: string) {
      startDate = value
      return builder
    },
    lte(_column: string, value: string) {
      endDate = value
      return builder
    },
  }

  return builder
}

describe('searchMovies', () => {
  beforeEach(() => {
    Object.assign(globalThis, {
      createError,
      useRuntimeConfig: vi.fn(() => ({
        public: {
          supabaseUrl: 'https://example.supabase.co',
        },
        supabaseServiceRoleKey: 'test-service-role-key',
      })),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('uses simple tsquery prefix search and returns popularity-ordered rows', async () => {
    const rowsByQuery = new Map<string, SearchRow[]>([
      [
        'matrix:*::::',
        [
          {
            tmdb_id: 604,
            original_title: 'The Matrix',
            popularity: 99,
            release_date: '1999-03-31',
          },
          {
            tmdb_id: 605,
            original_title: 'Matrix',
            popularity: 10,
            release_date: '1993-01-01',
          },
        ],
      ],
    ])

    createClientMock.mockReturnValue({
      from: vi.fn().mockImplementation(() => createBuilder(rowsByQuery)),
    })

    const results = await searchMovies('Matrix')

    expect(results).toEqual([
      {
        tmdb_id: 604,
        original_title: 'The Matrix',
        popularity: 99,
        year: 1999,
      },
      {
        tmdb_id: 605,
        original_title: 'Matrix',
        popularity: 10,
        year: 1993,
      },
    ])
  })

  it('applies the year filter and falls back to a broader search when needed', async () => {
    const rowsByQuery = new Map<string, SearchRow[]>([
      ['suspiria:*::2024-01-01::2024-12-31', []],
      [
        'suspiria:*::::',
        [
          {
            tmdb_id: 11906,
            original_title: 'Suspiria',
            popularity: 90,
            release_date: '2018-10-26',
          },
        ],
      ],
    ])

    createClientMock.mockReturnValue({
      from: vi.fn().mockImplementation(() => createBuilder(rowsByQuery)),
    })

    const results = await searchMovies('Suspiria', 2024)

    expect(results).toEqual([
      {
        tmdb_id: 11906,
        original_title: 'Suspiria',
        popularity: 90,
        year: 2018,
      },
    ])
  })

  it('deduplicates repeated batch candidates by query and year', async () => {
    const rowsByQuery = new Map<string, SearchRow[]>([
      [
        'matrix:*::1999-01-01::1999-12-31',
        [
          {
            tmdb_id: 604,
            original_title: 'The Matrix',
            popularity: 99,
            release_date: '1999-03-31',
          },
        ],
      ],
      [
        'alien:*::::',
        [
          {
            tmdb_id: 348,
            original_title: 'Alien',
            popularity: 88,
            release_date: '1979-05-25',
          },
        ],
      ],
    ])

    createClientMock.mockReturnValue({
      from: vi.fn().mockImplementation(() => createBuilder(rowsByQuery)),
      rpc: vi.fn().mockResolvedValue({
        data: [
          { query: 'Matrix', year: 1999, tmdb_id: 604, original_title: 'The Matrix', popularity: 99, release_date: '1999-03-31' },
          { query: 'Alien', year: null, tmdb_id: 348, original_title: 'Alien', popularity: 88, release_date: '1979-05-25' },
        ],
        error: null,
      }),
    })

    const results = await searchMoviesBatch([
      { query: 'Matrix', year: 1999 },
      { query: 'Alien' },
      { query: 'Matrix', year: 1999 },
    ])

    expect(results.size).toBe(2)
    expect(results.get('Matrix::1999')).toEqual([
      {
        tmdb_id: 604,
        original_title: 'The Matrix',
        popularity: 99,
        year: 1999,
      },
    ])
    expect(results.get('Alien::')).toEqual([
      {
        tmdb_id: 348,
        original_title: 'Alien',
        popularity: 88,
        year: 1979,
      },
    ])
  })
})
