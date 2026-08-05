import type { H3Event } from 'h3'
import { askPlatformAiResponse } from './ai-client'
import type { PlatformAiMessage, PlatformAiResponse } from './ai-client'
import {
  INITIAL_RECOMMENDATION_RETRY_COUNT,
  INITIAL_RECOMMENDATION_COUNT,
  MAX_RECOMMENDATION_ROUNDS,
  TARGET_RECOMMENDATIONS,
} from './constants'
import { appendTmdbIds } from './movie-id-matching'
import {
  buildReplacementUserMessage,
  buildUserMessage,
  createRecommendationSystemPrompt,
  RECOMMENDATION_RESPONSE_SCHEMA,
  REPLACEMENT_RESPONSE_SCHEMA,
} from './prompts'
import {
  parseInitialRecommendationResponse,
  parseReplacementRecommendationResponse,
} from './response-parser'
import {
  createRecommendationValidationState,
  shouldAskForDeeperCuts,
  toBlockedExcludedRecommendations,
  validateRecommendationBatch,
} from './recommendation-validation'
import { logPrivateError, logPrivateInfo } from '../shared/api-error'
import type {
  IndexedRecommendationWithId,
  InitialModelRecommendation,
  Recommendation,
  RecommendationWithId,
  ReplacementModelRecommendation,
  WatchedMovieRecord,
} from './types'

function toRecommendation(
  recommendation: InitialModelRecommendation | ReplacementModelRecommendation
): Recommendation {
  const title = recommendation.title.trim()

  return {
    name: title,
    originalName: title,
    year: recommendation.release_year,
  }
}

interface InitialRecommendationRequest {
  systemPrompt: string
  userMessage: string
  messages: PlatformAiMessage[]
}

function toResponseMetadata(response: PlatformAiResponse) {
  return {
    finishReason: response.finishReason,
    provider: response.provider,
    model: response.model,
    responseMode: response.responseMode,
    usage: response.usage,
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }

  return 'Unknown recommendation error'
}

function buildInitialRecommendationRequest(
  watchedMovies: WatchedMovieRecord[],
  myListMovies: WatchedMovieRecord[],
  excludedMovies: RecommendationWithId[],
  candidateCount?: number
): InitialRecommendationRequest {
  const systemPrompt = createRecommendationSystemPrompt(candidateCount)
  const userMessage = buildUserMessage(watchedMovies, myListMovies, excludedMovies, candidateCount)

  return {
    systemPrompt,
    userMessage,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
      },
      {
        role: 'user',
        content: userMessage,
      },
    ],
  }
}

async function requestInitialRecommendationRaw(
  request: InitialRecommendationRequest,
  options?: {
    excludedModels?: Array<{
      provider: PlatformAiResponse['provider']
      model: string
    }>
  },
  userId?: string,
  event?: H3Event
): Promise<PlatformAiResponse> {
  return askPlatformAiResponse({
    systemPrompt: request.systemPrompt,
    userMessage: request.userMessage,
    messages: [...request.messages],
    schema: RECOMMENDATION_RESPONSE_SCHEMA,
    schemaName: 'movie_recommendations',
    userId,
    event,
  }, options)
}

async function fetchInitialRecommendations(
  watchedMovies: WatchedMovieRecord[],
  myListMovies: WatchedMovieRecord[],
  excludedMovies: RecommendationWithId[],
  userId?: string,
  event?: H3Event
): Promise<{
  systemPrompt: string
  userMessage: string
  raw: string
  parsed: InitialModelRecommendation[]
}> {
  const initialRequest = buildInitialRecommendationRequest(
    watchedMovies,
    myListMovies,
    excludedMovies
  )
  const initialResponse = await requestInitialRecommendationRaw(initialRequest, undefined, userId, event)

  try {
    return {
      systemPrompt: initialRequest.systemPrompt,
      userMessage: initialRequest.userMessage,
      raw: initialResponse.content,
      parsed: parseInitialRecommendationResponse(
        initialResponse.content,
        {
          event,
          requestedCount: INITIAL_RECOMMENDATION_COUNT,
          responseMetadata: toResponseMetadata(initialResponse),
          userId,
        }
      ),
    }
  } catch (firstError) {
    const retryRequest = buildInitialRecommendationRequest(
      watchedMovies,
      myListMovies,
      excludedMovies,
      INITIAL_RECOMMENDATION_RETRY_COUNT
    )
    const retryResponse = await requestInitialRecommendationRaw(
      retryRequest,
      {
        excludedModels: [
          {
            provider: initialResponse.provider,
            model: initialResponse.model,
          },
        ],
      },
      userId,
      event
    )

    try {
      const parsed = parseInitialRecommendationResponse(
        retryResponse.content,
        {
          event,
          requestedCount: INITIAL_RECOMMENDATION_RETRY_COUNT,
          responseMetadata: toResponseMetadata(retryResponse),
          userId,
        }
      )

      logPrivateInfo({
        event: 'recommendation.ai_provider_response_recovered',
        source: 'ai_provider',
        statusCode: 200,
        route: event?.path,
        method: event?.method,
        userId,
        extra: {
          initialAttempt: {
            errorMessage: getErrorMessage(firstError),
            ...toResponseMetadata(initialResponse),
          },
          retryAttempt: toResponseMetadata(retryResponse),
        },
      })

      return {
        systemPrompt: retryRequest.systemPrompt,
        userMessage: retryRequest.userMessage,
        raw: retryResponse.content,
        parsed,
      }
    } catch (retryError) {
      logPrivateError({
        cause: firstError,
        event: 'recommendation.ai_provider_response_invalid_after_retry',
        source: 'ai_provider',
        statusCode: 502,
        route: event?.path,
        method: event?.method,
        userId,
        extra: {
          initialAttempt: {
            errorMessage: getErrorMessage(firstError),
            ...toResponseMetadata(initialResponse),
          },
          retryAttempt: {
            errorMessage: getErrorMessage(retryError),
            ...toResponseMetadata(retryResponse),
          },
        },
      })

      throw firstError
    }
  }
}

function toIndexedRecommendation(
  recommendation: InitialModelRecommendation,
  resolvedRecommendation: RecommendationWithId
): IndexedRecommendationWithId {
  return {
    ...resolvedRecommendation,
    index: recommendation.index,
  }
}

function toIndexedReplacementRecommendation(
  recommendation: ReplacementModelRecommendation,
  resolvedRecommendation: RecommendationWithId
): IndexedRecommendationWithId {
  return {
    ...resolvedRecommendation,
    index: recommendation.replaced_index,
  }
}

function toIndexedRecommendations(
  modelRecommendations: InitialModelRecommendation[],
  resolvedRecommendations: RecommendationWithId[]
): IndexedRecommendationWithId[] {
  const recommendations: IndexedRecommendationWithId[] = []

  for (const [index, modelRecommendation] of modelRecommendations.entries()) {
    const resolvedRecommendation = resolvedRecommendations[index]

    if (!resolvedRecommendation) {
      continue
    }

    recommendations.push(toIndexedRecommendation(modelRecommendation, resolvedRecommendation))
  }

  return recommendations
}

function toIndexedReplacementRecommendations(
  modelRecommendations: ReplacementModelRecommendation[],
  resolvedRecommendations: RecommendationWithId[]
): IndexedRecommendationWithId[] {
  const recommendations: IndexedRecommendationWithId[] = []

  for (const [index, modelRecommendation] of modelRecommendations.entries()) {
    const resolvedRecommendation = resolvedRecommendations[index]

    if (!resolvedRecommendation) {
      continue
    }

    recommendations.push(
      toIndexedReplacementRecommendation(modelRecommendation, resolvedRecommendation)
    )
  }

  return recommendations
}

async function resolveInitialRecommendations(
  modelRecommendations: InitialModelRecommendation[],
  event?: H3Event
): Promise<{ recommendations: IndexedRecommendationWithId[]; tmdbFallbackCount: number }> {
  const result = await appendTmdbIds(modelRecommendations.map(toRecommendation), event)

  return {
    recommendations: toIndexedRecommendations(modelRecommendations, result.recommendations),
    tmdbFallbackCount: result.tmdbFallbackCount,
  }
}

async function resolveReplacementRecommendations(
  modelRecommendations: ReplacementModelRecommendation[],
  event?: H3Event
): Promise<{ recommendations: IndexedRecommendationWithId[]; tmdbFallbackCount: number }> {
  const result = await appendTmdbIds(modelRecommendations.map(toRecommendation), event)

  return {
    recommendations: toIndexedReplacementRecommendations(
      modelRecommendations,
      result.recommendations
    ),
    tmdbFallbackCount: result.tmdbFallbackCount,
  }
}

function toIndexes(recommendations: Array<{ index: number }>): number[] {
  return recommendations.map((recommendation) => recommendation.index)
}

export async function getRecommendationsFromPlatformAi(
  watchedMovies: WatchedMovieRecord[],
  myListMovies: WatchedMovieRecord[],
  userId?: string,
  event?: H3Event,
  excludedMovies: RecommendationWithId[] = [],
  validationExcludedTmdbIds: number[] = []
): Promise<{
  recommendations: RecommendationWithId[]
  aiCandidateCount: number
  tmdbFallbackCount: number
  systemPrompt: string
  userMessage: string
}> {
  const validationState = createRecommendationValidationState(
    watchedMovies,
    myListMovies,
    toBlockedExcludedRecommendations(excludedMovies),
    validationExcludedTmdbIds
  )
  const acceptedRecommendations: IndexedRecommendationWithId[] = []
  let tmdbFallbackCount = 0
  let aiCandidateCount = 0

  const initialResult = await fetchInitialRecommendations(
    watchedMovies,
    myListMovies,
    excludedMovies,
    userId,
    event
  )
  const { systemPrompt, userMessage, raw, parsed } = initialResult
  const messages: PlatformAiMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: userMessage,
    },
  ]
  messages.push({
    role: 'assistant',
    content: raw,
  })

  aiCandidateCount += parsed.length
  const resolvedInitialResult = await resolveInitialRecommendations(parsed, event)
  tmdbFallbackCount += resolvedInitialResult.tmdbFallbackCount

  let validationResult = validateRecommendationBatch(
    resolvedInitialResult.recommendations,
    validationState
  )
  acceptedRecommendations.push(...validationResult.accepted)

  for (
    let round = 2;
    round <= MAX_RECOMMENDATION_ROUNDS &&
    acceptedRecommendations.length < TARGET_RECOMMENDATIONS &&
    validationResult.blocked.length > 0;
    round++
  ) {
    const replacementsNeeded = TARGET_RECOMMENDATIONS - acceptedRecommendations.length
    const followUpMessage = buildReplacementUserMessage(
      toIndexes(validationResult.accepted),
      toIndexes(validationResult.blocked),
      replacementsNeeded,
      shouldAskForDeeperCuts(validationResult)
    )

    messages.push({
      role: 'user',
      content: followUpMessage,
    })

    const replacementResponse = await askPlatformAiResponse({
      systemPrompt,
      userMessage,
      messages: [...messages],
      schema: REPLACEMENT_RESPONSE_SCHEMA,
      schemaName: 'movie_recommendation_replacements',
      userId,
      event,
      rateLimit: false,
    })
    messages.push({
      role: 'assistant',
      content: replacementResponse.content,
    })

    const replacements = parseReplacementRecommendationResponse(replacementResponse.content, {
      event,
      replacementIndexes: toIndexes(validationResult.blocked),
      requestedCount: replacementsNeeded,
      responseMetadata: toResponseMetadata(replacementResponse),
      userId,
    })
    aiCandidateCount += replacements.length
    const replacementResult = await resolveReplacementRecommendations(replacements, event)
    tmdbFallbackCount += replacementResult.tmdbFallbackCount
    validationResult = validateRecommendationBatch(
      replacementResult.recommendations,
      validationState
    )
    acceptedRecommendations.push(...validationResult.accepted)
  }

  return {
    recommendations: acceptedRecommendations.slice(0, TARGET_RECOMMENDATIONS),
    aiCandidateCount,
    tmdbFallbackCount,
    systemPrompt,
    userMessage,
  }
}
