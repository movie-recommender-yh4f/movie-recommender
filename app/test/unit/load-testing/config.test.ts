import { createError } from 'h3'
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getProtectedLoadTestStatus } from '../../../server/utils/load-testing/config'

const LOAD_TEST_TOKEN = 'test-token-with-at-least-24-characters'
const logPrivateErrorMock = vi.fn()
const useRuntimeConfigMock = vi.fn()
let providedToken = LOAD_TEST_TOKEN

function createStatusEvent(token = LOAD_TEST_TOKEN): H3Event {
  providedToken = token
  return {
    method: 'GET',
    path: '/api/load-test/status',
  } as H3Event
}

function setRuntimeConfig(overrides = {}) {
  useRuntimeConfigMock.mockReturnValue({
    loadTestEnabled: true,
    loadTestToken: LOAD_TEST_TOKEN,
    loadTestEnvironment: 'staging',
    platformAiProviderMode: 'mock',
    platformAiMockEnabled: true,
    platformAiMockScenario: 'success-normal',
    googleApiKey: '',
    googleModels: '',
    openRouterApiKey: '',
    openRouterModels: '',
    ...overrides,
  })
}

describe('getProtectedLoadTestStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(globalThis, {
      createError,
      getHeader: vi.fn(() => providedToken),
      logPrivateError: logPrivateErrorMock,
      useRuntimeConfig: useRuntimeConfigMock,
    })
    setRuntimeConfig()
  })

  it('returns a sanitized status for the matching token', () => {
    setRuntimeConfig({
      openRouterApiKey: 'secret-key',
      openRouterModels: 'test-model',
    })

    expect(getProtectedLoadTestStatus(createStatusEvent())).toEqual({
      enabled: true,
      environment: 'staging',
      providerMode: 'mock',
      mockEnabled: true,
      mockScenario: 'success-normal',
      providers: ['openrouter'],
    })
  })

  it('hides the endpoint when load testing is disabled', () => {
    setRuntimeConfig({
      loadTestEnabled: false,
    })

    expect(() => getProtectedLoadTestStatus(createStatusEvent())).toThrowError(
      expect.objectContaining({ statusCode: 404 })
    )
  })

  it('rejects an invalid token without returning status', () => {
    expect(() => getProtectedLoadTestStatus(createStatusEvent('wrong-token'))).toThrowError(
      expect.objectContaining({ statusCode: 401 })
    )
  })

  it('fails closed when the configured token is too short', () => {
    setRuntimeConfig({
      loadTestToken: 'short',
    })

    expect(() => getProtectedLoadTestStatus(createStatusEvent('short'))).toThrowError(
      expect.objectContaining({ statusCode: 503 })
    )
    expect(logPrivateErrorMock).toHaveBeenCalledOnce()
  })
})
