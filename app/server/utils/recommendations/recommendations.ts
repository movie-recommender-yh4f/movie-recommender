import type { H3Event } from 'h3'
import { askPlatformAi } from './ai-client'
import type { PlatformAiMessage } from './ai-client'
import { MAX_RECOMMENDATION_ROUNDS, TARGET_RECOMMENDATIONS } from './constants'
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
import type {
  IndexedRecommendationWithId,
  InitialModelRecommendation,
  Recommendation,
  RecommendationWithId,
  ReplacementModelRecommendation,
  WatchedMovieRecord,
} from './types'

import { logPrivateInfo } from '../shared/api-error'

const RECOMMENDATION_TIMING_SOURCE = 'ai_provider' as const

function logRecommendationTiming(
  event: H3Event | undefined,
  userId: string | undefined,
  action: string,
  startedAt: number
): void {
  if (!event) {
    return
  }

  logPrivateInfo({
    event: 'recommendation.timing',
    source: RECOMMENDATION_TIMING_SOURCE,
    statusCode: 200,
    userId,
    route: event.path,
    method: event.method,
    extra: {
      action,
      durationMs: performance.now() - startedAt,
    },
  })
}

function toRecommendation(
  recommendation: InitialModelRecommendation | ReplacementModelRecommendation
): Recommendation {
  const title = recommendation.title.trim()

  return {
    name: title,
    originalName: title,
    year: recommendation.release_year,
    shortReason: recommendation.short_reason,
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
  excludedMovies: RecommendationWithId[] = []
): Promise<{
  recommendations: RecommendationWithId[]
  aiCandidateCount: number
  tmdbFallbackCount: number
  systemPrompt: string
  userMessage: string
}> {
  const requestStartedAt = performance.now()
  const systemPrompt = createRecommendationSystemPrompt()
  const userMessage = buildUserMessage(watchedMovies, myListMovies, excludedMovies)
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
  logRecommendationTiming(event, userId, 'build_prompt_messages', requestStartedAt)

  const validationStateStartedAt = performance.now()
  const validationState = createRecommendationValidationState(
    watchedMovies,
    myListMovies,
    toBlockedExcludedRecommendations(excludedMovies)
  )
  logRecommendationTiming(event, userId, 'create_validation_state', validationStateStartedAt)

  const acceptedRecommendations: IndexedRecommendationWithId[] = []
  let tmdbFallbackCount = 0
  let aiCandidateCount = 0

  const initialAiRequestStartedAt = performance.now()
  const raw = await askPlatformAi({
    systemPrompt,
    userMessage,
    messages: [...messages],
    schema: RECOMMENDATION_RESPONSE_SCHEMA,
    schemaName: 'movie_recommendations',
    userId,
    event,
  })
  logRecommendationTiming(event, userId, 'initial_ai_request', initialAiRequestStartedAt)
  messages.push({
    role: 'assistant',
    content: raw,
  })

  const initialParseStartedAt = performance.now()
  const parsed = parseInitialRecommendationResponse(raw, userId, event)
  logRecommendationTiming(event, userId, 'parse_initial_response', initialParseStartedAt)
  aiCandidateCount += parsed.length

  const initialResolutionStartedAt = performance.now()
  const initialResult = await resolveInitialRecommendations(parsed, event)
  logRecommendationTiming(event, userId, 'resolve_initial_recommendations', initialResolutionStartedAt)
  tmdbFallbackCount += initialResult.tmdbFallbackCount

  const initialValidationStartedAt = performance.now()
  let validationResult = validateRecommendationBatch(initialResult.recommendations, validationState)
  logRecommendationTiming(event, userId, 'validate_initial_recommendations', initialValidationStartedAt)
  acceptedRecommendations.push(...validationResult.accepted)

  for (
    let round = 2;
    round <= MAX_RECOMMENDATION_ROUNDS &&
    acceptedRecommendations.length < TARGET_RECOMMENDATIONS &&
    validationResult.blocked.length > 0;
    round++
  ) {
    const replacementPromptStartedAt = performance.now()
    const replacementsNeeded = TARGET_RECOMMENDATIONS - acceptedRecommendations.length
    const followUpMessage = buildReplacementUserMessage(
      toIndexes(validationResult.accepted),
      toIndexes(validationResult.blocked),
      replacementsNeeded,
      shouldAskForDeeperCuts(validationResult)
    )
    logRecommendationTiming(event, userId, `build_replacement_prompt_round_${round}`, replacementPromptStartedAt)

    messages.push({
      role: 'user',
      content: followUpMessage,
    })

    const replacementAiRequestStartedAt = performance.now()
    const replacementRaw = await askPlatformAi({
      systemPrompt,
      userMessage,
      messages: [...messages],
      schema: REPLACEMENT_RESPONSE_SCHEMA,
      schemaName: 'movie_recommendation_replacements',
      userId,
      event,
      rateLimit: false,
    })
    logRecommendationTiming(event, userId, `replacement_ai_request_round_${round}`, replacementAiRequestStartedAt)
    messages.push({
      role: 'assistant',
      content: replacementRaw,
    })

    const replacementParseStartedAt = performance.now()
    const replacements = parseReplacementRecommendationResponse(replacementRaw, userId, event)
    logRecommendationTiming(event, userId, `parse_replacement_response_round_${round}`, replacementParseStartedAt)
    aiCandidateCount += replacements.length

    const replacementResolutionStartedAt = performance.now()
    const replacementResult = await resolveReplacementRecommendations(replacements, event)
    logRecommendationTiming(
      event,
      userId,
      `resolve_replacement_recommendations_round_${round}`,
      replacementResolutionStartedAt
    )
    tmdbFallbackCount += replacementResult.tmdbFallbackCount

    const replacementValidationStartedAt = performance.now()
    validationResult = validateRecommendationBatch(
      replacementResult.recommendations,
      validationState
    )
    logRecommendationTiming(
      event,
      userId,
      `validate_replacement_recommendations_round_${round}`,
      replacementValidationStartedAt
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
