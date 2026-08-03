import { check } from 'k6'
import http from 'k6/http'
import { authorizationHeaders, assertAccountCapacity, loginForVu } from '../helpers/auth.js'
import { classifyRecommendationResponse } from '../helpers/checks.js'
import {
  boundedDuration,
  getBaseUrl,
  getProvisionalThresholds,
  optionalInteger,
  parseCsv,
} from '../helpers/config.js'
import { preflight } from '../helpers/safety.js'
import { recommendOnce } from '../helpers/workflows.js'

const PROFILE = 'recommendations-mock'
const RECOMMEND_ROUTE = '/api/recommend'
const VUS = optionalInteger('RECOMMENDATION_VUS', 5, 1, 50)
const ITERATIONS_PER_VU = optionalInteger('RECOMMENDATION_ITERATIONS_PER_VU', 1, 1, 5)
const DURATION = boundedDuration(
  'RECOMMENDATION_DURATION',
  '1m',
  10 * 60,
  'ALLOW_LONG_RECOMMENDATIONS'
)
const EXPECTED_STATUSES = parseCsv(__ENV.EXPECTED_RECOMMENDATION_STATUSES).map((status) =>
  Number(status)
)
if (
  EFFECTIVE_EXPECTED_STATUSES.some(
    (status) => !Number.isInteger(status) || status < 100 || status > 599
  )
) {
  throw new Error('EXPECTED_RECOMMENDATION_STATUSES contains an invalid HTTP status.')
}

const EFFECTIVE_EXPECTED_STATUSES = EXPECTED_STATUSES.length > 0 ? EXPECTED_STATUSES : [200]

export const options = {
  scenarios: {
    distinct_users: {
      executor: 'per-vu-iterations',
      vus: VUS,
      iterations: ITERATIONS_PER_VU,
      maxDuration: DURATION,
      exec: 'distinctUsers',
    },
    duplicate_same_user: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'duplicateSameUser',
      maxDuration: '45s',
    },
  },
  thresholds: getProvisionalThresholds(),
}

export function setup() {
  assertAccountCapacity(VUS + 1)
  return preflight(PROFILE, { highLoad: true, requireMock: true })
}

export function distinctUsers() {
  recommendOnce(PROFILE, 'mock', '?getNew=true', {
    expectedStatuses: EFFECTIVE_EXPECTED_STATUSES,
    expectRateLimit: EFFECTIVE_EXPECTED_STATUSES.includes(429),
  })
}

export function duplicateSameUser() {
  const session = loginForVu(PROFILE)
  const headers = authorizationHeaders(session)
  const request = {
    method: 'GET',
    url: getBaseUrl() + RECOMMEND_ROUTE + '?getNew=true',
    params: {
      headers,
      tags: {
        route: RECOMMEND_ROUTE,
        scenario: PROFILE,
        auth_state: 'authenticated',
        provider_mode: 'mock',
      },
    },
  }
  const responses = http.batch([request, request])

  for (const response of responses) {
    classifyRecommendationResponse(response, {
      route: RECOMMEND_ROUTE,
      scenario: PROFILE,
      authState: 'authenticated',
      providerMode: 'mock',
      expectedStatuses: [200, 409],
    })
  }

  check(responses, {
    'duplicate request lock returned one conflict': (items) =>
      items.some((response) => response.status === 409),
  })
}
