export const PLATFORM_AI_PROVIDER_MODES = ['live', 'mock'] as const

export const MOCK_AI_SCENARIOS = [
  'success-fast',
  'success-normal',
  'success-slow',
  'malformed-json',
  'schema-invalid',
  'partial-response',
  'provider-429',
  'provider-500',
  'timeout',
  'duplicate-results',
  'blocked-results',
  'insufficient-results',
] as const

export type PlatformAiProviderMode = (typeof PLATFORM_AI_PROVIDER_MODES)[number]
export type MockAiScenario = (typeof MOCK_AI_SCENARIOS)[number]

interface MockAiRequest {
  event?: H3Event
  schemaName?: string
  userId?: string
}

interface MockMovie {
  title: string
  year: number
}

const LIVE_PROVIDER_MODE: PlatformAiProviderMode = 'live'
const REPLACEMENT_SCHEMA_NAME = 'movie_recommendation_replacements'
const MOCK_RESPONSE_EVENT = 'recommendation.mock_provider_response'
const MOCK_CONFIGURATION_EVENT = 'recommendation.mock_provider_misconfigured'
const MOCK_SOURCE = 'mock_ai_provider'
const MOCK_PROVIDER_ERROR_MESSAGE = 'Unable to generate recommendations.'
const MAX_MOCK_DELAY_MS = 30_000
const DEFAULT_MOCK_DELAYS_MS: Record<MockAiScenario, number> = {
  'success-fast': 0,
  'success-normal': 500,
  'success-slow': 5_000,
  'malformed-json': 0,
  'schema-invalid': 0,
  'partial-response': 500,
  'provider-429': 0,
  'provider-500': 0,
  timeout: 10_000,
  'duplicate-results': 500,
  'blocked-results': 500,
  'insufficient-results': 500,
}
const PARTIAL_RESPONSE_COUNT = 12
const INSUFFICIENT_RESPONSE_COUNT = 3
const MALFORMED_RESPONSE = '{"recommendations":['
const SCHEMA_INVALID_RESPONSE = '{"recommendations":[{"title":42}]}'

const MOCK_MOVIES: MockMovie[] = [
  { title: 'The Shawshank Redemption', year: 1994 },
  { title: 'The Godfather', year: 1972 },
  { title: 'The Dark Knight', year: 2008 },
  { title: 'Pulp Fiction', year: 1994 },
  { title: 'The Lord of the Rings: The Return of the King', year: 2003 },
  { title: 'Forrest Gump', year: 1994 },
  { title: 'Inception', year: 2010 },
  { title: 'Fight Club', year: 1999 },
  { title: 'The Matrix', year: 1999 },
  { title: 'Goodfellas', year: 1990 },
  { title: 'Interstellar', year: 2014 },
  { title: 'Parasite', year: 2019 },
  { title: 'Spirited Away', year: 2001 },
  { title: 'Whiplash', year: 2014 },
  { title: 'The Departed', year: 2006 },
  { title: 'Gladiator', year: 2000 },
  { title: 'The Prestige', year: 2006 },
  { title: 'Memento', year: 2000 },
  { title: 'Alien', year: 1979 },
  { title: 'Blade Runner', year: 1982 },
  { title: 'Arrival', year: 2016 },
  { title: 'Heat', year: 1995 },
  { title: 'Se7en', year: 1995 },
  { title: 'The Silence of the Lambs', year: 1991 },
  { title: 'City of God', year: 2002 },
]

function isEnabled(value: unknown): boolean {
  return value === true || value === 'true'
}

function isProviderMode(value: string): value is PlatformAiProviderMode {
  return PLATFORM_AI_PROVIDER_MODES.some((mode) => mode === value)
}

function isMockScenario(value: string): value is MockAiScenario {
  return MOCK_AI_SCENARIOS.some((scenario) => scenario === value)
}

function throwMockConfigurationError(request: MockAiRequest, cause: unknown): never {
  if (request.event) {
    throwConfigError(request.event, cause, {
      event: MOCK_CONFIGURATION_EVENT,
      userId: request.userId,
    })
  }

  logPrivateError({
    cause,
    event: MOCK_CONFIGURATION_EVENT,
    source: 'config',
    statusCode: 503,
    userId: request.userId,
  })

  throw createError({
    statusCode: 503,
    statusMessage: 'Service is temporarily unavailable.',
  })
}

function parseMockDelay(
  request: MockAiRequest,
  rawDelay: unknown,
  scenario: MockAiScenario
): number {
  if (rawDelay === '' || rawDelay === undefined || rawDelay === null) {
    return DEFAULT_MOCK_DELAYS_MS[scenario]
  }

  const delay = Number(rawDelay)
  if (!Number.isInteger(delay) || delay < 0 || delay > MAX_MOCK_DELAY_MS) {
    throwMockConfigurationError(
      request,
      new Error('Mock AI delay must be an integer from 0 through 30000 milliseconds')
    )
  }

  return delay
}

async function waitForMockDelay(delayMs: number): Promise<void> {
  if (delayMs === 0) {
    return
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs))
}

function createSuccessfulPayload(request: MockAiRequest, movies: MockMovie[]): string {
  const recommendations = movies.map((movie, index) => {
    if (request.schemaName === REPLACEMENT_SCHEMA_NAME) {
      return {
        replaced_index: index + 1,
        title: movie.title,
        release_year: movie.year,
        short_reason: 'Deterministic replacement from the protected load-test provider.',
      }
    }

    return {
      index: index + 1,
      title: movie.title,
      release_year: movie.year,
      short_reason: 'Deterministic recommendation from the protected load-test provider.',
    }
  })

  return JSON.stringify({ recommendations })
}

function createScenarioResponse(request: MockAiRequest, scenario: MockAiScenario): string {
  if (scenario === 'malformed-json') {
    return MALFORMED_RESPONSE
  }

  if (scenario === 'schema-invalid') {
    return SCHEMA_INVALID_RESPONSE
  }

  if (scenario === 'partial-response') {
    return createSuccessfulPayload(request, MOCK_MOVIES.slice(0, PARTIAL_RESPONSE_COUNT))
  }

  if (scenario === 'insufficient-results') {
    return createSuccessfulPayload(request, MOCK_MOVIES.slice(0, INSUFFICIENT_RESPONSE_COUNT))
  }

  if (scenario === 'duplicate-results' || scenario === 'blocked-results') {
    return createSuccessfulPayload(
      request,
      MOCK_MOVIES.map(() => MOCK_MOVIES[0])
    )
  }

  return createSuccessfulPayload(request, MOCK_MOVIES)
}

function logMockResponse(
  request: MockAiRequest,
  scenario: MockAiScenario,
  delayMs: number,
  statusCode: number
): void {
  logPrivateInfo({
    event: MOCK_RESPONSE_EVENT,
    source: MOCK_SOURCE,
    statusCode,
    userId: request.userId,
    route: request.event?.path,
    method: request.event?.method,
    extra: {
      scenario,
      delayMs,
      schemaName: request.schemaName,
    },
  })
}

export async function askMockPlatformAi(request: MockAiRequest): Promise<string | null> {
  const config = useRuntimeConfig()
  const rawMode = String(config.platformAiProviderMode || LIVE_PROVIDER_MODE)
    .trim()
    .toLowerCase()

  if (!isProviderMode(rawMode)) {
    throwMockConfigurationError(request, new Error('Unknown platform AI provider mode'))
  }

  if (rawMode === LIVE_PROVIDER_MODE) {
    return null
  }

  if (!isEnabled(config.platformAiMockEnabled)) {
    throwMockConfigurationError(
      request,
      new Error('Mock provider mode requires the separate mock-enabled flag')
    )
  }

  const rawScenario = String(config.platformAiMockScenario || 'success-normal')
    .trim()
    .toLowerCase()

  if (!isMockScenario(rawScenario)) {
    throwMockConfigurationError(request, new Error('Unknown mock AI scenario'))
  }

  const delayMs = parseMockDelay(request, config.platformAiMockDelayMs, rawScenario)
  await waitForMockDelay(delayMs)

  if (rawScenario === 'provider-429') {
    logMockResponse(request, rawScenario, delayMs, 429)
    throw createError({
      statusCode: 429,
      statusMessage: 'Rate limit exceeded. Please try again later.',
    })
  }

  if (rawScenario === 'provider-500') {
    logMockResponse(request, rawScenario, delayMs, 502)
    throw createError({
      statusCode: 502,
      statusMessage: MOCK_PROVIDER_ERROR_MESSAGE,
    })
  }

  if (rawScenario === 'timeout') {
    logMockResponse(request, rawScenario, delayMs, 504)
    throw createError({
      statusCode: 504,
      statusMessage: MOCK_PROVIDER_ERROR_MESSAGE,
    })
  }

  logMockResponse(request, rawScenario, delayMs, 200)
  return createScenarioResponse(request, rawScenario)
}
