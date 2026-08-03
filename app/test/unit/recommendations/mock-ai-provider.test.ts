import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { askMockPlatformAi } from '../../../server/utils/recommendations/mock-ai-provider'

const logPrivateErrorMock = vi.fn()
const logPrivateInfoMock = vi.fn()
const throwConfigErrorMock = vi.fn((_event, _cause, _options) => {
  throw createError({
    statusCode: 503,
    statusMessage: 'Service is temporarily unavailable.',
  })
})
const useRuntimeConfigMock = vi.fn()

function setRuntimeConfig(overrides = {}) {
  useRuntimeConfigMock.mockReturnValue({
    platformAiProviderMode: 'mock',
    platformAiMockEnabled: true,
    platformAiMockScenario: 'success-fast',
    platformAiMockDelayMs: '0',
    ...overrides,
  })
}

describe('askMockPlatformAi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(globalThis, {
      createError,
      logPrivateError: logPrivateErrorMock,
      logPrivateInfo: logPrivateInfoMock,
      throwConfigError: throwConfigErrorMock,
      useRuntimeConfig: useRuntimeConfigMock,
    })
    setRuntimeConfig()
  })

  it('returns null without intercepting live provider requests', async () => {
    setRuntimeConfig({
      platformAiProviderMode: 'live',
      platformAiMockEnabled: false,
    })

    await expect(askMockPlatformAi({ userId: 'user-1' })).resolves.toBeNull()
    expect(logPrivateInfoMock).not.toHaveBeenCalled()
  })

  it('returns deterministic initial recommendations in protected mock mode', async () => {
    const raw = await askMockPlatformAi({
      schemaName: 'movie_recommendations',
      userId: 'user-1',
    })
    const payload = JSON.parse(raw || '{}')

    expect(payload.recommendations).toHaveLength(25)
    expect(payload.recommendations[0]).toEqual({
      index: 1,
      title: 'The Shawshank Redemption',
      release_year: 1994,
      short_reason: 'Deterministic recommendation from the protected load-test provider.',
    })
  })

  it('returns replacement-shaped data for follow-up rounds', async () => {
    const raw = await askMockPlatformAi({
      schemaName: 'movie_recommendation_replacements',
      userId: 'user-1',
    })
    const payload = JSON.parse(raw || '{}')

    expect(payload.recommendations[0].replaced_index).toBe(1)
    expect(payload.recommendations[0]).not.toHaveProperty('index')
  })

  it('rejects mock mode when the second opt-in flag is disabled', async () => {
    setRuntimeConfig({
      platformAiMockEnabled: false,
    })

    await expect(askMockPlatformAi({ userId: 'user-1' })).rejects.toMatchObject({
      statusCode: 503,
    })
  })

  it('provides deterministic malformed and provider failure scenarios', async () => {
    setRuntimeConfig({
      platformAiMockScenario: 'malformed-json',
    })

    await expect(askMockPlatformAi({ userId: 'user-1' })).resolves.toBe('{"recommendations":[')

    setRuntimeConfig({
      platformAiMockScenario: 'provider-429',
    })

    await expect(askMockPlatformAi({ userId: 'user-1' })).rejects.toMatchObject({
      statusCode: 429,
    })
  })
})
