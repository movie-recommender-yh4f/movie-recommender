import type { H3Event } from 'h3'
import OpenAI from 'openai'
import { logPrivateError, throwConfigError } from '../shared/api-error'
import { recommendationLimiter, RECOMMENDATION_LIMIT } from './rate-limit'

const GOOGLE_AI_STUDIO_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/'
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const GENERATE_RECOMMENDATIONS_MESSAGE = 'Unable to generate recommendations right now.'
const TOO_MANY_REQUESTS_STATUS_CODE = 429
const BAD_GATEWAY_STATUS_CODE = 502

export interface PlatformAiRequest {
  systemPrompt?: string
  userMessage?: string
  messages?: PlatformAiMessage[]
  schema?: Record<string, unknown>
  schemaName?: string
  userId?: string
  event?: H3Event
  rateLimit?: boolean
}

export interface PlatformAiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface PlatformAiResponse {
  content: string
  finishReason: string | null
  provider: 'google' | 'openrouter'
  model: string
  responseMode: 'json_schema'
  usage: unknown
}

interface AskPlatformAiOptions {
  excludedModels?: Array<{
    provider: PlatformAiResponse['provider']
    model: string
  }>
}

interface PlatformAiProviderConfig {
  provider: 'google' | 'openrouter'
  baseUrl: string
  apiKey: string
  models: string[]
  defaultHeaders?: Record<string, string>
}

interface PlatformAiConfig {
  googleApiKey: string
  googleModels: string
  openRouterApiKey: string
  openRouterModels: string
}

interface ProviderErrorContext {
  provider: PlatformAiProviderConfig['provider']
  model: string
  responseMode: 'json_schema'
}

interface ProviderAttempt {
  provider: PlatformAiProviderConfig['provider']
  model: string
  responseMode: 'json_schema'
  statusCode: number | null
  causeMessage: string
}

export function parseProviderModels(value: string): string[] {
  return value
    .split(',')
    .map((model) => model.trim())
    .filter((model) => model.length > 0)
}

function createOpenAIClient(config: PlatformAiProviderConfig) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    defaultHeaders: config.defaultHeaders,
  })
}

export function createPlatformAiProviderConfig(
  platformAiConfig: PlatformAiConfig
): PlatformAiProviderConfig[] {
  const providers: PlatformAiProviderConfig[] = []
  const googleModels = parseProviderModels(platformAiConfig.googleModels)
  const openRouterModels = parseProviderModels(platformAiConfig.openRouterModels)

  if (platformAiConfig.googleApiKey.length && googleModels.length > 0) {
    providers.push({
      provider: 'google',
      baseUrl: GOOGLE_AI_STUDIO_BASE_URL,
      apiKey: platformAiConfig.googleApiKey,
      models: googleModels,
    })
  }

  if (platformAiConfig.openRouterApiKey.length && openRouterModels.length > 0) {
    providers.push({
      provider: 'openrouter',
      baseUrl: OPENROUTER_BASE_URL,
      apiKey: platformAiConfig.openRouterApiKey,
      models: openRouterModels,
    })
  }

  return providers
}

function getPlatformAiProviderConfig(event?: H3Event, userId?: string): PlatformAiProviderConfig[] {
  const config = useRuntimeConfig()
  const providers = createPlatformAiProviderConfig({
    googleApiKey: config.googleApiKey || process.env.NUXT_GOOGLE_API_KEY || '',
    googleModels: config.googleModels || process.env.NUXT_GOOGLE_MODELS || '',
    openRouterApiKey: config.openRouterApiKey || process.env.NUXT_OPENROUTER_API_KEY || '',
    openRouterModels: config.openRouterModels || process.env.NUXT_OPENROUTER_MODELS || '',
  })

  if (providers.length === 0) {
    const cause = new Error('Missing platform AI provider configuration')

    if (event) {
      throwConfigError(event, cause, {
        event: 'recommendation.ai_provider_misconfigured',
        userId,
      })
    }

    logPrivateError({
      cause,
      event: 'recommendation.ai_provider_misconfigured',
      source: 'config',
      statusCode: 503,
      userId,
    })

    throw createError({
      statusCode: 503,
      statusMessage: 'Service is temporarily unavailable.',
    })
  }

  return providers
}

function getProviderErrorStatusCode(error: unknown): number | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  const record = error as { status?: number; statusCode?: number }
  const status = record.status ?? record.statusCode

  if (typeof status === 'number' && status >= 400 && status < 600) {
    return status
  }

  return null
}

function getProviderErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message
  }

  if (typeof error !== 'object' || error === null) {
    return 'Unknown AI provider error'
  }

  const record = error as Record<string, unknown>

  if (typeof record.message === 'string' && record.message.length > 0) {
    return record.message
  }

  if (typeof record.error === 'object' && record.error !== null) {
    const nestedError = record.error as Record<string, unknown>

    if (typeof nestedError.message === 'string' && nestedError.message.length > 0) {
      return nestedError.message
    }
  }

  return 'Unknown AI provider error'
}

function createProviderError(error: unknown, context: ProviderErrorContext): Error {
  const statusCode = getProviderErrorStatusCode(error)
  const providerError = createError({
    statusCode: statusCode === TOO_MANY_REQUESTS_STATUS_CODE ? TOO_MANY_REQUESTS_STATUS_CODE : BAD_GATEWAY_STATUS_CODE,
    statusMessage: GENERATE_RECOMMENDATIONS_MESSAGE,
  })

  return Object.assign(providerError, {
    provider: context.provider,
    model: context.model,
    responseMode: context.responseMode,
    causeMessage: getProviderErrorMessage(error),
    originalStatusCode: statusCode,
  })
}

function getAttemptFromError(
  error: unknown,
  provider: PlatformAiProviderConfig['provider'],
  model: string
): ProviderAttempt {
  if (typeof error !== 'object' || error === null) {
    return {
      provider,
      model,
      responseMode: 'json_schema',
      statusCode: null,
      causeMessage: getProviderErrorMessage(error),
    }
  }

  const record = error as Record<string, unknown>
  const causeMessage =
    typeof record.causeMessage === 'string' && record.causeMessage.length > 0
      ? record.causeMessage
      : getProviderErrorMessage(error)
  const originalStatusCode =
    typeof record.originalStatusCode === 'number' ? record.originalStatusCode : getProviderErrorStatusCode(error)

  return {
    provider,
    model,
    responseMode: 'json_schema',
    statusCode: originalStatusCode,
    causeMessage,
  }
}

function attachAttempts(error: unknown, attempts: ProviderAttempt[]): Error {
  const providerError = error instanceof Error
    ? error
    : createError({
        statusCode: BAD_GATEWAY_STATUS_CODE,
        statusMessage: GENERATE_RECOMMENDATIONS_MESSAGE,
      })

  return Object.assign(providerError, { attempts })
}

function getRequestMessages(request: PlatformAiRequest): PlatformAiMessage[] {
  if (request.messages && request.messages.length > 0) {
    return request.messages
  }

  return [
    {
      role: 'system',
      content: request.systemPrompt ?? '',
    },
    {
      role: 'user',
      content: request.userMessage ?? '',
    },
  ]
}

async function createChatCompletion(
  provider: PlatformAiProviderConfig,
  model: string,
  request: PlatformAiRequest
): Promise<PlatformAiResponse> {
  try {
    const completion = await createOpenAIClient(provider).chat.completions.create({
      model,
      messages: getRequestMessages(request),
      temperature: 0.4,
      ...(request.schema && {
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: request.schemaName || 'structured_response',
            strict: true,
            schema: request.schema,
          },
        },
      }),
    })

    const content = completion.choices[0]?.message?.content

    if (!content) {
      throw createError({
        statusCode: 502,
        statusMessage: GENERATE_RECOMMENDATIONS_MESSAGE,
      })
    }

    return {
      content,
      finishReason: completion.choices[0]?.finish_reason ?? null,
      provider: provider.provider,
      model,
      responseMode: 'json_schema',
      usage: completion.usage ?? null,
    }
  } catch (error) {
    throw createProviderError(error, {
      provider: provider.provider,
      model,
      responseMode: 'json_schema',
    })
  }
}

export async function askPlatformAiResponse(
  request: PlatformAiRequest,
  options?: AskPlatformAiOptions
): Promise<PlatformAiResponse> {
  const providers = getPlatformAiProviderConfig(request.event, request.userId)

  if ((request.rateLimit ?? true) && request.userId) {
    const { success, remaining, reset } = await recommendationLimiter.limit(request.userId)

    if (request.event) {
      request.event.node.res.setHeader('X-RateLimit-Limit', RECOMMENDATION_LIMIT.toString())
      request.event.node.res.setHeader('X-RateLimit-Remaining', remaining.toString())
      request.event.node.res.setHeader('X-RateLimit-Reset', reset.toString())
    }

    if (!success) {
      throw createError({
        statusCode: 429,
        statusMessage: 'Rate limit exceeded. Please try again later.',
      })
    }
  }

  let lastError: unknown = null
  const attempts: ProviderAttempt[] = []
  const excludedModels = new Set(
    (options?.excludedModels ?? []).map(({ provider, model }) => `${provider}:${model}`)
  )

  for (const provider of providers) {
    for (const model of provider.models) {
      if (excludedModels.has(`${provider.provider}:${model}`)) {
        continue
      }

      try {
        return await createChatCompletion(provider, model, request)
      } catch (error) {
        lastError = error
        attempts.push(getAttemptFromError(error, provider.provider, model))
      }
    }
  }

  if (lastError) {
    logPrivateError({
      cause: lastError,
      event: 'recommendation.ai_provider_all_attempts_failed',
      source: 'ai_provider',
      statusCode: getProviderErrorStatusCode(lastError) ?? BAD_GATEWAY_STATUS_CODE,
      route: request.event?.path,
      method: request.event?.method,
      userId: request.userId,
      extra: {
        attempts,
        excludedModels: options?.excludedModels ?? [],
        schemaName: request.schemaName,
      },
    })

    throw attachAttempts(lastError, attempts)
  }

  throw createError({
    statusCode: 503,
    statusMessage: 'Service is temporarily unavailable.',
  })
}

export async function askPlatformAi(request: PlatformAiRequest): Promise<string> {
  const response = await askPlatformAiResponse(request)

  return response.content
}
