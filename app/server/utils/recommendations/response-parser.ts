import type { H3Event } from 'h3'
import { GENERATE_RECOMMENDATIONS_MESSAGE } from './constants'
import type {
  InitialModelRecommendation,
  Recommendation,
  ReplacementModelRecommendation,
} from './types'
import { RECOMMENDATION_RESPONSE_SCHEMA, REPLACEMENT_RESPONSE_SCHEMA } from './prompts'
import { logPrivateError, logPrivateInfo, throwAiProviderError } from '../shared/api-error'

const AI_RESPONSE_LOG_PREVIEW_LENGTH = 500
const MAXIMUM_MINIMUM_RECOVERED_CANDIDATES = 20
const MINIMUM_RECOVERY_RATIO = 0.6
const COMPLETE_FINISH_REASON = 'stop'

interface RecommendationObjectResponse {
  recommendations: unknown
}

interface ProviderResponseMetadata {
  finishReason?: string | null
  provider: 'google' | 'openrouter'
  model: string
  responseMode: 'json_schema'
  usage?: unknown
}

interface RecommendationParseContext {
  allowPartialRecovery?: boolean
  event?: H3Event
  replacementIndexes?: number[]
  requestedCount?: number
  responseMetadata?: ProviderResponseMetadata
  suppressLogging?: boolean
  userId?: string
}

type RecommendationTuple = [string, number | null]

function throwPlatformAiRecommendationError(
  cause: unknown,
  logEvent: string,
  context: {
    event?: H3Event
    suppressLogging?: boolean
    userId?: string
    statusCode: number
    extra?: Record<string, unknown>
  }
): never {
  const { event, suppressLogging = false, userId, statusCode, extra } = context

  if (suppressLogging) {
    throw Object.assign(createError({ statusCode, statusMessage: GENERATE_RECOMMENDATIONS_MESSAGE }), {
      cause,
      event: logEvent,
      extra,
    })
  }

  if (event) {
    throwAiProviderError(event, cause, {
      event: logEvent,
      userId,
      publicMessage: GENERATE_RECOMMENDATIONS_MESSAGE,
      statusCode,
      extra,
    })
  }

  logPrivateError({
    cause,
    event: logEvent,
    source: 'ai_provider',
    statusCode,
    userId,
    extra,
  })

  throw createError({ statusCode, statusMessage: GENERATE_RECOMMENDATIONS_MESSAGE })
}

export function isRecommendationArray(value: unknown): value is Recommendation[] {
  return Array.isArray(value) && value.every((item) => {
    if (typeof item !== 'object' || item === null) {
      return false
    }

    const record = item as Record<string, unknown>
    return typeof record.name === 'string' &&
      typeof record.originalName === 'string' &&
      (typeof record.year === 'number' || record.year === null)
  })
}

function isRecommendationTuple(value: unknown): value is RecommendationTuple {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'string' &&
    value[0].trim().length > 0 &&
    (value[1] === null || (typeof value[1] === 'number' && Number.isInteger(value[1])))
}

function isRecommendationObjectResponse(value: unknown): value is RecommendationObjectResponse {
  return typeof value === 'object' && value !== null && 'recommendations' in value
}

function normalizeRecommendationPayload(value: unknown): unknown {
  return isRecommendationObjectResponse(value) ? value.recommendations : value
}

function getErrorDetails(error: unknown): { errorName: string; errorMessage: string } {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message }
  }

  return { errorName: 'UnknownError', errorMessage: 'Unknown recommendation parse error' }
}

function createParseFailureLogExtra(
  raw: string,
  error: unknown,
  responseSchema: Record<string, unknown>,
  responseSchemaName: string,
  responseMetadata?: ProviderResponseMetadata
): Record<string, unknown> {
  return {
    ...getErrorDetails(error),
    finishReason: responseMetadata?.finishReason ?? null,
    usage: responseMetadata?.usage ?? null,
    contentLength: raw.length,
    contentStart: raw.slice(0, AI_RESPONSE_LOG_PREVIEW_LENGTH),
    contentEnd: raw.slice(-AI_RESPONSE_LOG_PREVIEW_LENGTH),
    provider: responseMetadata?.provider,
    model: responseMetadata?.model,
    responseMode: responseMetadata?.responseMode,
    schemaName: responseSchemaName,
    expectedResponseSchema: responseSchema,
  }
}

function findRecommendationArrayStart(raw: string): number {
  const propertyIndex = raw.indexOf('"recommendations"')
  return raw.indexOf('[', propertyIndex >= 0 ? propertyIndex : 0)
}

function extractCompleteRecommendationTuples(raw: string): RecommendationTuple[] {
  const arrayStart = findRecommendationArrayStart(raw)
  if (arrayStart < 0) {
    return []
  }

  const tuples: RecommendationTuple[] = []
  let tupleStart = -1
  let tupleDepth = 0
  let isInString = false
  let isEscaped = false

  for (let index = arrayStart + 1; index < raw.length; index++) {
    const character = raw[index]

    if (isEscaped) {
      isEscaped = false
      continue
    }
    if (character === '\\' && isInString) {
      isEscaped = true
      continue
    }
    if (character === '"') {
      isInString = !isInString
      continue
    }
    if (isInString) {
      continue
    }
    if (character === '[') {
      if (tupleDepth === 0) {
        tupleStart = index
      }
      tupleDepth++
      continue
    }
    if (character !== ']' || tupleDepth === 0 || tupleStart < 0) {
      continue
    }

    tupleDepth--
    if (tupleDepth > 0) {
      continue
    }

    try {
      const tuple: unknown = JSON.parse(raw.slice(tupleStart, index + 1))
      if (isRecommendationTuple(tuple)) {
        tuples.push(tuple)
      }
    } catch {
      // A syntactically complete-looking item is invalid and therefore not recoverable.
    }
    tupleStart = -1
  }

  return tuples
}

function normalizeTuples(tuples: RecommendationTuple[]): RecommendationTuple[] {
  const normalized: RecommendationTuple[] = []
  const seen = new Set<string>()

  for (const [rawTitle, year] of tuples) {
    const title = rawTitle.trim()
    const key = `${title.toLocaleLowerCase()}\u0000${year ?? 'null'}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    normalized.push([title, year])
  }

  return normalized
}

function trimTuples(tuples: RecommendationTuple[]): RecommendationTuple[] {
  return tuples.map(([title, year]) => [title.trim(), year])
}

function getMinimumRecoveredCandidates(requestedCount: number): number {
  return Math.min(
    MAXIMUM_MINIMUM_RECOVERED_CANDIDATES,
    Math.ceil(requestedCount * MINIMUM_RECOVERY_RATIO)
  )
}

function logRecovery(
  eventName: 'recommendation.ai_provider_partial_recovered' | 'recommendation.ai_provider_partial_recovery_failed',
  raw: string,
  recoveredCount: number,
  minimumRequiredCount: number,
  context: RecommendationParseContext
): void {
  if (context.suppressLogging) {
    return
  }

  logPrivateInfo({
    event: eventName,
    source: 'ai_provider',
    statusCode: eventName.endsWith('_failed') ? 502 : 200,
    route: context.event?.path,
    method: context.event?.method,
    userId: context.userId,
    extra: {
      requestedCount: context.requestedCount ?? 0,
      recoveredCount,
      minimumRequiredCount,
      finishReason: context.responseMetadata?.finishReason ?? null,
      provider: context.responseMetadata?.provider,
      model: context.responseMetadata?.model,
      responseLength: raw.length,
    },
  })
}

function logIncompleteResponse(raw: string, context: RecommendationParseContext): void {
  if (context.suppressLogging) {
    return
  }

  logPrivateInfo({
    event: 'recommendation.ai_provider_response_incomplete',
    source: 'ai_provider',
    statusCode: 502,
    route: context.event?.path,
    method: context.event?.method,
    userId: context.userId,
    extra: {
      finishReason: context.responseMetadata?.finishReason,
      usage: context.responseMetadata?.usage ?? null,
      contentLength: raw.length,
      provider: context.responseMetadata?.provider,
      model: context.responseMetadata?.model,
      responseMode: context.responseMetadata?.responseMode,
    },
  })
}

function recoverRecommendationTuples(
  raw: string,
  context: RecommendationParseContext
): RecommendationTuple[] | null {
  const requestedCount = context.requestedCount ?? 0
  const minimumRequiredCount = getMinimumRecoveredCandidates(requestedCount)
  const tuples = normalizeTuples(extractCompleteRecommendationTuples(raw))
  const isSuccessful = tuples.length >= minimumRequiredCount && tuples.length > 0

  logRecovery(
    isSuccessful
      ? 'recommendation.ai_provider_partial_recovered'
      : 'recommendation.ai_provider_partial_recovery_failed',
    raw,
    tuples.length,
    minimumRequiredCount,
    context
  )

  return isSuccessful ? tuples : null
}

function parseJsonRecommendationResponse(
  raw: string,
  responseSchema: Record<string, unknown>,
  responseSchemaName: string,
  context: RecommendationParseContext
): unknown {
  const finishReason = context.responseMetadata?.finishReason
  const isIncomplete = finishReason !== undefined &&
    finishReason !== null &&
    finishReason !== COMPLETE_FINISH_REASON
  let parseError: unknown = new Error(
    `AI provider response was incomplete: ${context.responseMetadata?.finishReason}`
  )

  if (!isIncomplete) {
    try {
      return normalizeRecommendationPayload(JSON.parse(raw))
    } catch (error) {
      parseError = error
    }
  }


  if (isIncomplete) {
    logIncompleteResponse(raw, context)
  }

  const recovered = (context.allowPartialRecovery ?? true)
    ? recoverRecommendationTuples(raw, context)
    : null
  if (recovered) {
    return recovered
  }

  throwPlatformAiRecommendationError(parseError, 'recommendation.ai_provider_parse_failed', {
    event: context.event,
    suppressLogging: context.suppressLogging,
    userId: context.userId,
    statusCode: 502,
    extra: createParseFailureLogExtra(
      raw,
      parseError,
      responseSchema,
      responseSchemaName,
      context.responseMetadata
    ),
  })
}

function toTuples(value: unknown): RecommendationTuple[] | null {
  if (!Array.isArray(value) || !value.every(isRecommendationTuple)) {
    return null
  }

  return trimTuples(value)
}

function throwRecommendationSchemaError(context: RecommendationParseContext): never {
  throwPlatformAiRecommendationError(
    new Error('AI provider response did not match the expected recommendation schema.'),
    'recommendation.ai_provider_schema_failed',
    {
      event: context.event,
      suppressLogging: context.suppressLogging,
      userId: context.userId,
      statusCode: 502,
    }
  )
}

export function parseInitialRecommendationResponse(
  raw: string,
  context: RecommendationParseContext = {}
): InitialModelRecommendation[] {
  const tuples = toTuples(parseJsonRecommendationResponse(
    raw,
    RECOMMENDATION_RESPONSE_SCHEMA,
    'movie_recommendations',
    context
  ))
  if (!tuples) {
    throwRecommendationSchemaError(context)
  }

  return tuples.map(([title, releaseYear], index) => ({
    index: index + 1,
    title,
    release_year: releaseYear,
  }))
}

export function parseReplacementRecommendationResponse(
  raw: string,
  context: RecommendationParseContext = {}
): ReplacementModelRecommendation[] {
  const tuples = toTuples(parseJsonRecommendationResponse(
    raw,
    REPLACEMENT_RESPONSE_SCHEMA,
    'movie_recommendation_replacements',
    context
  ))
  if (!tuples || !context.replacementIndexes || tuples.length > context.replacementIndexes.length) {
    throwRecommendationSchemaError(context)
  }

  return tuples.map(([title, releaseYear], index) => ({
    replaced_index: context.replacementIndexes?.[index] ?? index + 1,
    title,
    release_year: releaseYear,
  }))
}
