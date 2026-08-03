import { check } from 'k6'
import {
  authFailureRate,
  partialRecoveryRate,
  recommendationParseFailureRate,
  recommendationSuccessRate,
  recordResponse,
} from './metrics.js'

export function classifyResponse(response, options) {
  const classification = recordResponse(response, options)
  const passed = check(response, {
    ['expected status for ' + options.route]: () => classification.expectedResponse,
  })

  return {
    ...classification,
    passed,
  }
}

export function classifyAuthResponse(response, options) {
  const result = classifyResponse(response, options)
  authFailureRate.add(!result.expectedResponse, {
    route: options.route,
    scenario: options.scenario,
  })
  return result
}

export function classifyRecommendationResponse(response, options) {
  const result = classifyResponse(response, options)
  let body = null

  try {
    body = response.json()
  } catch {
    body = null
  }

  const success = response.status === 200 && Array.isArray(body?.recommendations)
  const parseFailure = response.status === 502 && /response/i.test(response.body || '')
  const partialRecovery =
    response.status === 200 && body?.stale === true && Array.isArray(body?.staleRecommendations)

  recommendationSuccessRate.add(success, {
    scenario: options.scenario,
    provider_mode: options.providerMode || 'unknown',
  })
  recommendationParseFailureRate.add(parseFailure, {
    scenario: options.scenario,
    provider_mode: options.providerMode || 'unknown',
  })
  partialRecoveryRate.add(partialRecovery, {
    scenario: options.scenario,
    provider_mode: options.providerMode || 'unknown',
  })

  return {
    ...result,
    body,
    parseFailure,
    partialRecovery,
    success,
  }
}
