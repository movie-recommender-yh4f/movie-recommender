import { Counter, Rate, Trend } from 'k6/metrics'

export const unexpectedFailures = new Rate('unexpected_failures')
export const expectedRateLimits = new Rate('expected_rate_limits')
export const timeoutRate = new Rate('timeout_rate')
export const authFailureRate = new Rate('authentication_failure_rate')
export const recommendationSuccessRate = new Rate('recommendation_success_rate')
export const recommendationParseFailureRate = new Rate('recommendation_parse_failure_rate')
export const partialRecoveryRate = new Rate('partial_recovery_rate')
export const routeDuration = new Trend('route_duration', true)
export const status2xx = new Counter('status_2xx')
export const status4xx = new Counter('status_4xx')
export const status5xx = new Counter('status_5xx')
export const status429 = new Counter('status_429')
export const requestTimeouts = new Counter('request_timeouts')

export const unexpected4xxRate = new Rate('unexpected_4xx_rate')
export const unexpected5xxRate = new Rate('unexpected_5xx_rate')

function isTimeout(response) {
  return response.status === 0 || /timeout/i.test(response.error || '')
}

function recordStatus(response, tags) {
  if (response.status >= 200 && response.status < 300) {
    status2xx.add(1, tags)
    return
  }

  if (response.status >= 400 && response.status < 500) {
    status4xx.add(1, tags)
    return
  }

  if (response.status >= 500) {
    status5xx.add(1, tags)
  }
}

export function recordResponse(response, options) {
  const authState = options.authState || 'anonymous'
  const userType =
    options.userType ||
    (authState === 'authenticated' || authState === 'credential_exchange'
      ? 'authenticated'
      : 'anonymous')
  const tags = {
    route: options.route,
    scenario: options.scenario,
    auth_state: authState,
    user_type: userType,
    cache_state: options.cacheState || 'not_applicable',
    provider_mode: options.providerMode || 'not_applicable',
    expected_status: (options.expectedStatuses || []).join(','),
  }
  const timedOut = isTimeout(response)
  const expectedStatuses = options.expectedStatuses || [200]
  const expectedRateLimit = response.status === 429 && options.expectRateLimit === true
  const expectedResponse = expectedStatuses.includes(response.status) || expectedRateLimit
  const unexpectedFailure = timedOut || !expectedResponse
  const unexpected4xx =
    response.status >= 400 && response.status < 500 && !expectedResponse && !timedOut
  const unexpected5xx = response.status >= 500 && !expectedResponse && !timedOut

  routeDuration.add(response.timings.duration, tags)
  expectedRateLimits.add(expectedRateLimit, tags)
  unexpectedFailures.add(unexpectedFailure, tags)
  unexpected4xxRate.add(unexpected4xx, tags)
  unexpected5xxRate.add(unexpected5xx, tags)
  timeoutRate.add(timedOut, tags)
  status429.add(response.status === 429 ? 1 : 0, tags)
  recordStatus(response, tags)

  if (timedOut) {
    requestTimeouts.add(1, tags)
  }

  return {
    expectedRateLimit,
    expectedResponse,
    tags,
    timedOut,
    unexpectedFailure,
  }
}
