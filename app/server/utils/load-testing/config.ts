import { timingSafeEqual } from 'node:crypto'

const LOAD_TEST_TOKEN_HEADER = 'x-nextwatch-load-test-token'
const MIN_LOAD_TEST_TOKEN_LENGTH = 24
const DISABLED_STATUS_CODE = 404
const UNAUTHORIZED_STATUS_CODE = 401
const MISCONFIGURED_STATUS_CODE = 503
const LIVE_PROVIDER_MODE = 'live'

interface LoadTestStatus {
  enabled: true
  environment: string
  providerMode: string
  mockEnabled: boolean
  mockScenario: string
  providers: string[]
}

function isEnabled(value: unknown): boolean {
  return value === true || value === 'true'
}

function hasConfiguredValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function tokensMatch(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)

  if (actualBuffer.length !== expectedBuffer.length) {
    return false
  }

  return timingSafeEqual(actualBuffer, expectedBuffer)
}

function getConfiguredProviders(config: ReturnType<typeof useRuntimeConfig>): string[] {
  const providers: string[] = []

  if (hasConfiguredValue(config.googleApiKey) && hasConfiguredValue(config.googleModels)) {
    providers.push('google')
  }

  if (hasConfiguredValue(config.openRouterApiKey) && hasConfiguredValue(config.openRouterModels)) {
    providers.push('openrouter')
  }

  return providers
}

export function getProtectedLoadTestStatus(event: H3Event): LoadTestStatus {
  const config = useRuntimeConfig(event)

  if (!isEnabled(config.loadTestEnabled)) {
    throw createError({
      statusCode: DISABLED_STATUS_CODE,
      statusMessage: 'Not found.',
    })
  }

  const expectedToken = String(config.loadTestToken || '')
  if (expectedToken.length < MIN_LOAD_TEST_TOKEN_LENGTH) {
    logPrivateError({
      cause: new Error('Load-test token is missing or too short'),
      event: 'load_test.status_misconfigured',
      source: 'config',
      statusCode: MISCONFIGURED_STATUS_CODE,
      route: event.path,
      method: event.method,
    })

    throw createError({
      statusCode: MISCONFIGURED_STATUS_CODE,
      statusMessage: 'Service is temporarily unavailable.',
    })
  }

  const providedToken = getHeader(event, LOAD_TEST_TOKEN_HEADER) || ''
  if (!tokensMatch(providedToken, expectedToken)) {
    throw createError({
      statusCode: UNAUTHORIZED_STATUS_CODE,
      statusMessage: 'Unauthorized.',
    })
  }

  return {
    enabled: true,
    environment: String(config.loadTestEnvironment || 'unknown'),
    providerMode: String(config.platformAiProviderMode || LIVE_PROVIDER_MODE),
    mockEnabled: isEnabled(config.platformAiMockEnabled),
    mockScenario: String(config.platformAiMockScenario || ''),
    providers: getConfiguredProviders(config),
  }
}
