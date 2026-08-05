import { createError } from 'h3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}))

const rpcMock = vi.fn((_name: string, args: { search_candidates: Array<{ query: string; year?: number }> }) => Promise.resolve({ data: args.search_candidates.flatMap(({ query, year }) => { const normalized = query.toLowerCase(); const tmdbId = normalized === 'suspiria' ? (year === 1977 ? 11907 : 11906) : normalized === 'stalker' ? 1398 : normalized === 'alien' ? 1 : normalized.startsWith('candidate ') ? 1000 + Number.parseInt(normalized.slice('candidate '.length), 10) - 1 : normalized === 'replacement one' ? 2000 : normalized === 'replacement two' ? 2001 : null; return tmdbId === null ? [] : [{ query, year: year ?? null, tmdb_id: tmdbId, original_title: query, popularity: 50, release_date: (year ?? 2000).toString() + '-01-01' }]; }), error: null }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock,
}))

const { fetchTmdbMock } = vi.hoisted(() => ({
  fetchTmdbMock: vi.fn(),
}))

vi.mock('../../../server/utils/tmdb/client', () => ({
  fetchTmdb: fetchTmdbMock,
}))

const { askPlatformAiMock } = vi.hoisted(() => ({
  askPlatformAiMock: vi.fn(),
}))

vi.mock('../../../server/utils/recommendations/ai-client', () => ({
  askPlatformAi: askPlatformAiMock,
}))

const {
  getInitialRecommendationCount,
  MAX_MY_LIST_RECOMMENDATIONS,
} = await import('../../../server/utils/recommendations/constants')
const { appendTmdbIds } = await import('../../../server/utils/recommendations/movie-id-matching')
const { buildUserMessage } = await import('../../../server/utils/recommendations/prompts')
const {
  createRecommendationValidationState,
  validateRecommendationBatch,
} = await import('../../../server/utils/recommendations/recommendation-validation')
const { parseInitialRecommendationResponse } = await import(
  '../../../server/utils/recommendations/response-parser'
)
const { getRecommendationsFromPlatformAi } = await import(
  '../../../server/utils/recommendations/recommendations'
)

interface SearchRow {
  tmdb_id: number
  original_title: string
  popularity: number
  release_date: string
}

interface SearchMovieFixture {
  title: string
  year: number
  tmdbId: number
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
      return Promise.resolve({
        data: rowsByQuery.get(`${queryValue}::${startDate}::${endDate}`) ?? [],
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

function buildSearchKey(title: string, year: number): string {
  const query =
    title
      .trim()
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.map((token) => `${token}:*`)
      .join(' & ') ?? ''

  return `${query}::${year}-01-01::${year}-12-31`
}

function createRowsByTitle(movies: SearchMovieFixture[]): Map<string, SearchRow[]> {
  return new Map(
    movies.map((movie) => [
      buildSearchKey(movie.title, movie.year),
      [
        {
          tmdb_id: movie.tmdbId,
          original_title: movie.title,
          popularity: 50,
          release_date: `${movie.year}-01-01`,
        },
      ],
    ])
  )
}

function setupSearchRows(movies: SearchMovieFixture[]): void {
  Object.assign(globalThis, {
    createError,
    useRuntimeConfig: vi.fn(() => ({
      public: {
        supabaseUrl: 'https://example.supabase.co',
      },
      supabaseServiceRoleKey: 'test-service-role-key',
    })),
  })
  createClientMock.mockReturnValue({
      rpc: rpcMock,
    from: vi.fn().mockImplementation(() => createBuilder(createRowsByTitle(movies))),
  })
}

function createIndexedRecommendation(index: number, title: string, tmdbId: number | null) {
  return {
    index,
    name: title,
    originalName: title,
    year: 2000,
    shortReason: `Reason ${index}`,
    tmdbId,
  }
}

describe('appendTmdbIds', () => {
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

  it('prefers a result whose cached year matches the Gemini recommendation year', async () => {
    createClientMock.mockReturnValue({
      rpc: rpcMock,
      from: vi.fn().mockImplementation(() =>
        createBuilder(
          new Map([
            [
              'suspiria:*::1977-01-01::1977-12-31',
              [
                {
                  tmdb_id: 11907,
                  original_title: 'Suspiria',
                  popularity: 80,
                  release_date: '1977-02-01',
                },
              ],
            ],
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
        )
      ),
    })

    const results = await appendTmdbIds([
      { name: 'Suspiria', originalName: 'Suspiria', year: 1977 },
    ])

    expect(results).toEqual({
      recommendations: [
        { name: 'Suspiria', originalName: 'Suspiria', year: 1977, tmdbId: 11907 },
      ],
      tmdbFallbackCount: 0,
    })
  })

  it('falls back to the top result when no cached year matches', async () => {
    createClientMock.mockReturnValue({
      rpc: rpcMock,
      from: vi.fn().mockImplementation(() =>
        createBuilder(
          new Map([
            [
              'suspiria:*::2024-01-01::2024-12-31',
              [],
            ],
            [
              'suspiria:*::::',
              [
                {
                  tmdb_id: 11906,
                  original_title: 'Suspiria',
                  popularity: 90,
                  release_date: '2018-10-26',
                },
                {
                  tmdb_id: 11907,
                  original_title: 'Suspiria',
                  popularity: 80,
                  release_date: '1977-02-01',
                },
              ],
            ],
          ])
        )
      ),
    })

    const results = await appendTmdbIds([
      { name: 'Suspiria', originalName: 'Suspiria', year: 2024 },
    ])

    expect(results).toEqual({
      recommendations: [
        { name: 'Suspiria', originalName: 'Suspiria', year: 2024, tmdbId: 11906 },
      ],
      tmdbFallbackCount: 0,
    })
  })

  it('returns null when Supabase search does not find a match and no event is provided', async () => {
    createClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      from: vi.fn().mockImplementation(() =>
        createBuilder(
          new Map([
            ['stalker:*::1979-01-01::1979-12-31', []],
            ['stalker:*::::', []],
          ])
        )
      ),
    })

    const results = await appendTmdbIds([
      { name: 'Stalker', originalName: 'Stalker', year: 1979 },
    ])

    expect(results).toEqual({
      recommendations: [{ name: 'Stalker', originalName: 'Stalker', year: 1979, tmdbId: null }],
      tmdbFallbackCount: 0,
    })
  })

  it('falls back to TMDB search with year when Supabase search misses a movie', async () => {
    createClientMock.mockReturnValue({
      rpc: rpcMock,
      from: vi.fn().mockImplementation(() =>
        createBuilder(
          new Map([
            ['edge:* & of:* & tomorrow:*::2014-01-01::2014-12-31', []],
            ['edge:* & of:* & tomorrow:*::::', []],
          ])
        )
      ),
    })
    fetchTmdbMock.mockResolvedValue({
      results: [
        {
          id: 137113,
          original_title: 'Edge of Tomorrow',
          title: 'Edge of Tomorrow',
          release_date: '2014-05-27',
        },
      ],
    })

    const results = await appendTmdbIds(
      [{ name: 'Edge of Tomorrow', originalName: 'Edge of Tomorrow', year: 2014 }],
      {} as import('h3').H3Event
    )

    expect(results).toEqual({
      recommendations: [
        {
          name: 'Edge of Tomorrow',
          originalName: 'Edge of Tomorrow',
          year: 2014,
          tmdbId: 137113,
        },
      ],
      tmdbFallbackCount: 1,
    })
    expect(fetchTmdbMock).toHaveBeenCalledTimes(1)
  })

  it('skips a TMDB fallback movie when the TMDB rate limit is reached', async () => {
    createClientMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
      from: vi.fn().mockImplementation(() =>
        createBuilder(new Map([['stalker:*::1979-01-01::1979-12-31', []], ['stalker:*::::', []]]))
      ),
    })
    fetchTmdbMock.mockRejectedValue(createError({ statusCode: 429, statusMessage: 'Rate limited' }))

    const results = await appendTmdbIds(
      [{ name: 'Stalker', originalName: 'Stalker', year: 1979 }],
      {} as import('h3').H3Event
    )

    expect(results).toEqual({
      recommendations: [{ name: 'Stalker', originalName: 'Stalker', year: 1979, tmdbId: null }],
      tmdbFallbackCount: 1,
    })
    expect(fetchTmdbMock).toHaveBeenCalledTimes(1)
  })

  it('hydrates the larger AI candidate pool before final route filtering', async () => {
    createClientMock.mockReturnValue({
      rpc: rpcMock,
      from: vi.fn().mockImplementation(() => createBuilder(new Map())),
    })

    const recommendations = Array.from(
      { length: getInitialRecommendationCount() + 5 },
      (_, index) => ({
        name: `Candidate ${index + 1}`,
        originalName: `Candidate ${index + 1}`,
        year: 2000 + index,
      })
    )

    const results = await appendTmdbIds(recommendations)

    expect(results.recommendations).toHaveLength(getInitialRecommendationCount())
  })
})

describe('validateRecommendationBatch', () => {
  it('blocks watched movies, My List movies beyond the cap, duplicates, and unresolved movies', () => {
    const state = createRecommendationValidationState(
      [{ tmdbId: 11, title: 'Alien', year: 1979 }],
      [
        { tmdbId: 21, title: 'Solaris', year: 1972 },
        { tmdbId: 22, title: 'Moon', year: 2009 },
        { tmdbId: 23, title: 'Primer', year: 2004 },
      ]
    )

    const result = validateRecommendationBatch(
      [
        createIndexedRecommendation(1, 'Alien', 11),
        createIndexedRecommendation(2, 'Solaris', 21),
        createIndexedRecommendation(3, 'Moon', 22),
        createIndexedRecommendation(4, 'Primer', 23),
        createIndexedRecommendation(5, 'Coherence', 220289),
        createIndexedRecommendation(6, 'Coherence', 220289),
        createIndexedRecommendation(7, 'Unknown Festival Cut', null),
      ],
      state
    )

    expect(result.accepted.map((recommendation) => recommendation.tmdbId)).toEqual([
      21,
      22,
      220289,
    ])
    expect(result.blocked).toEqual([
      {
        index: 1,
        title: 'Alien',
        release_year: 2000,
        tmdb_id: 11,
        reason: 'watched',
      },
      {
        index: 4,
        title: 'Primer',
        release_year: 2000,
        tmdb_id: 23,
        reason: 'watchlist',
      },
      {
        index: 6,
        title: 'Coherence',
        release_year: 2000,
        tmdb_id: 220289,
        reason: 'duplicate',
      },
      {
        index: 7,
        title: 'Unknown Festival Cut',
        release_year: 2000,
        tmdb_id: null,
        reason: 'unresolved',
      },
    ])
    expect(MAX_MY_LIST_RECOMMENDATIONS).toBe(2)
  })
})

describe('parseInitialRecommendationResponse', () => {
  beforeEach(() => {
    Object.assign(globalThis, {
      createError,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs the provided response and expected schema when provider JSON cannot be parsed', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const providedResponse = '{\n  "recommendations": [],\n}'

    expect(() => parseInitialRecommendationResponse(providedResponse)).toThrow(
      'Unable to generate recommendations right now.'
    )

    const loggedMessage = consoleErrorSpy.mock.calls[0]?.[0]

    if (typeof loggedMessage !== 'string') {
      throw new Error('Expected recommendation parse failure to log a JSON string')
    }

    expect(JSON.parse(loggedMessage) as unknown).toMatchObject({
      event: 'recommendation.ai_provider_parse_failed',
      extra: {
        providedResponse,
        providedResponseLength: providedResponse.length,
        providedResponseTruncated: false,
        expectedResponseSchemaName: 'movie_recommendations',
        expectedResponseSchema: {
          type: 'object',
          required: ['recommendations'],
        },
      },
    })
  })
})

describe('getRecommendationsFromPlatformAi', () => {
  beforeEach(() => {
    askPlatformAiMock.mockReset()
  })

  it('accepts a top-level recommendation array payload', async () => {
    setupSearchRows([{ title: 'Stalker', year: 1979, tmdbId: 1398 }])
    askPlatformAiMock.mockResolvedValue(
      JSON.stringify([
        { index: 1, title: 'Stalker', release_year: 1979, short_reason: 'Haunting sci-fi' },
      ])
    )

    const result = await getRecommendationsFromPlatformAi([{ tmdbId: 1, title: 'Alien', year: 1979 }], [])

    expect(result.recommendations).toEqual([
      {
        index: 1,
        name: 'Stalker',
        originalName: 'Stalker',
        year: 1979,
        shortReason: 'Haunting sci-fi',
        tmdbId: 1398,
      },
    ])
  })

  it('accepts an object payload that wraps recommendations', async () => {
    setupSearchRows([{ title: 'Stalker', year: 1979, tmdbId: 1398 }])
    askPlatformAiMock.mockResolvedValue(
      JSON.stringify({
        recommendations: [
          { index: 1, title: 'Stalker', release_year: 1979, short_reason: 'Haunting sci-fi' },
        ],
      })
    )

    const result = await getRecommendationsFromPlatformAi([{ tmdbId: 1, title: 'Alien', year: 1979 }], [])

    expect(result.recommendations).toEqual([
      {
        index: 1,
        name: 'Stalker',
        originalName: 'Stalker',
        year: 1979,
        shortReason: 'Haunting sci-fi',
        tmdbId: 1398,
      },
    ])
  })

  it('asks for a larger candidate pool and sends taste-profile context', async () => {
    setupSearchRows([{ title: 'Stalker', year: 1979, tmdbId: 1398 }])
    askPlatformAiMock.mockResolvedValue(
      JSON.stringify({
        recommendations: [
          { index: 1, title: 'Stalker', release_year: 1979, short_reason: 'Haunting sci-fi' },
        ],
      })
    )

    await getRecommendationsFromPlatformAi(
      [
        {
          tmdbId: 1,
          title: 'Alien',
          year: 1979,
          genres: ['Science Fiction', 'Horror'],
          popularity: 80,
          voteCount: 20000,
        },
      ],
      [
        {
          tmdbId: 2,
          title: 'Solaris',
          year: 1972,
          genres: ['Science Fiction', 'Drama'],
          popularity: 50,
          voteCount: 10000,
        },
      ]
    )

    expect(askPlatformAiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: expect.stringContaining(
          `exactly ${getInitialRecommendationCount()} candidate movies`
        ),
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('TASTE PROFILE:'),
          }),
        ]),
        userMessage: expect.stringContaining('TASTE PROFILE:'),
      })
    )
  })

  it('asks for indexed replacements and returns only backend-validated accepted movies', async () => {
    const validInitialItems = Array.from({ length: 18 }, (_, index) => ({
      index: index + 3,
      title: `Candidate ${index + 1}`,
      release_year: 2000 + index,
      short_reason: `Reason ${index + 1}`,
    }))
    const replacementItems = [
      {
        replaced_index: 1,
        title: 'Replacement One',
        release_year: 1988,
        short_reason: 'Fresh replacement one',
      },
      {
        replaced_index: 2,
        title: 'Replacement Two',
        release_year: 1991,
        short_reason: 'Fresh replacement two',
      },
    ]
    const searchMovies = [
      { title: 'Alien', year: 1979, tmdbId: 1 },
      ...validInitialItems.map((item, index) => ({
        title: item.title,
        year: item.release_year,
        tmdbId: 1000 + index,
      })),
      ...replacementItems.map((item, index) => ({
        title: item.title,
        year: item.release_year,
        tmdbId: 2000 + index,
      })),
    ]

    setupSearchRows(searchMovies)
    askPlatformAiMock
      .mockResolvedValueOnce(
        JSON.stringify({
          recommendations: [
            {
              index: 1,
              title: 'Alien',
              release_year: 1979,
              short_reason: 'Too obvious',
            },
            {
              index: 2,
              title: 'Unknown Festival Cut',
              release_year: 2024,
              short_reason: 'Unresolved title',
            },
            ...validInitialItems,
          ],
        })
      )
      .mockResolvedValueOnce(
        JSON.stringify({
          recommendations: replacementItems,
        })
      )

    const result = await getRecommendationsFromPlatformAi(
      [{ tmdbId: 1, title: 'Alien', year: 1979 }],
      [],
      'user-1'
    )

    expect(result.recommendations.map((recommendation) => recommendation.tmdbId)).toEqual([
      ...Array.from({ length: 18 }, (_, index) => 1000 + index),
      2000,
      2001,
    ])
    expect(askPlatformAiMock).toHaveBeenCalledTimes(2)

    const followUpRequest = askPlatformAiMock.mock.calls[1]?.[0] as
      | { messages?: Array<{ role: string; content: string }>; rateLimit?: boolean }
      | undefined
    if (!followUpRequest?.messages) {
      throw new Error('Expected follow-up request messages')
    }

    const followUpMessage = followUpRequest.messages[followUpRequest.messages.length - 1]
    expect(followUpMessage?.content).toContain('accepted_indexes')
    expect(followUpMessage?.content).toContain('blocked_indexes')
    expect(followUpMessage?.content).toContain('2')
    expect(followUpMessage?.content).not.toContain('Alien')
    expect(followUpMessage?.content).not.toContain('Unknown Festival Cut')
    expect(followUpRequest.rateLimit).toBe(false)
  })

  it('builds a compact prompt with representative watched, top watched, and My List reminders', () => {
    const message = buildUserMessage(
      [
        {
          tmdbId: 1,
          title: 'Alien',
          year: 1979,
          genres: ['Science Fiction', 'Horror'],
          popularity: 80,
          voteCount: 20000,
        },
      ],
      [{ tmdbId: 2, title: 'Solaris', year: 1972 }],
      [{ name: 'Moon', originalName: 'Moon', year: 2009 }]
    )

    expect(message).toContain('TASTE PROFILE:')
    expect(message).toContain('REPRESENTATIVE WATCHED MOVIES:')
    expect(message).toContain('TOP WATCHED MOVIES:')
    expect(message).toContain('MY LIST REMINDERS:')
    expect(message).toContain('RECENTLY RECOMMENDED (FORBIDDEN)')
    expect(message).toContain(`up to 20 final recommendations`)
  })
})
