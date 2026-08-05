import { assertAccountCapacity } from '../helpers/auth.js'
import { boundedDuration, getProvisionalThresholds, isExplicitlyEnabled } from '../helpers/config.js'
import { preflight } from '../helpers/safety.js'
import {
  assertStressVuSafety,
  buildStressStages,
  parseStressLevels,
} from '../helpers/stress-config.js'
import { authenticatedOnce } from '../helpers/workflows.js'

const PROFILE = 'stress-authenticated'
const LEVELS_VARIABLE = 'AUTH_STRESS_LEVELS'
const DEFAULT_STAGE_DURATION = '1m'
const DEFAULT_MAX_STAGE_DURATION_SECONDS = 30 * 60
const STAGE_DURATION = boundedDuration(
  'AUTH_STRESS_STAGE_DURATION',
  DEFAULT_STAGE_DURATION,
  DEFAULT_MAX_STAGE_DURATION_SECONDS,
  'ALLOW_LONG_AUTH_STRESS'
)
const LEVELS = parseStressLevels(__ENV[LEVELS_VARIABLE], LEVELS_VARIABLE)
const MAXIMUM_VUS = assertStressVuSafety(
  LEVELS,
  LEVELS_VARIABLE,
  isExplicitlyEnabled('ALLOW_HIGH_VU_COUNT')
)
const AUTHENTICATED_USER_TYPE = 'authenticated'
const STRESS_UNEXPECTED_FAILURE_RATE = 0.1
const DEFAULT_STRESS_P95_MS = 2_000
const stressP95Ms = Number(__ENV.AUTH_STRESS_P95_MS_THRESHOLD) || DEFAULT_STRESS_P95_MS
const thresholds = getProvisionalThresholds()

thresholds['unexpected_failures{user_type:authenticated}'] = [
  {
    threshold: 'rate<' + STRESS_UNEXPECTED_FAILURE_RATE,
    abortOnFail: true,
    delayAbortEval: '30s',
  },
]
thresholds['route_duration{user_type:authenticated}'] = [
  {
    threshold: 'p(95)<' + stressP95Ms,
    abortOnFail: true,
    delayAbortEval: '30s',
  },
]
thresholds['authentication_failure_rate{user_type:authenticated}'] = ['rate<0.01']
thresholds['timeout_rate{user_type:authenticated}'] = ['rate<0.01']
thresholds['unexpected_4xx_rate{user_type:authenticated}'] = [
  'rate<' + STRESS_UNEXPECTED_FAILURE_RATE,
]
thresholds['unexpected_5xx_rate{user_type:authenticated}'] = [
  'rate<' + STRESS_UNEXPECTED_FAILURE_RATE,
]
thresholds['expected_rate_limits{user_type:authenticated}'] = ['rate>=0']
thresholds['status_429{user_type:authenticated}'] = ['count>=0']
thresholds['checks{user_type:authenticated}'] = ['rate>0.9']

export const options = {
  scenarios: {
    authenticated_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: buildStressStages(LEVELS, STAGE_DURATION, (level) => level),
      gracefulRampDown: '0s',
      exec: 'authenticatedActivity',
      tags: { user_type: AUTHENTICATED_USER_TYPE },
    },
  },
  thresholds,
}

thresholds.unexpected_failures =
  thresholds['unexpected_failures{user_type:authenticated}']
thresholds.route_duration = thresholds['route_duration{user_type:authenticated}']

export function setup() {
  assertAccountCapacity(MAXIMUM_VUS)
  return preflight(PROFILE, { highLoad: true })
}

export function authenticatedActivity() {
  authenticatedOnce(PROFILE)
}
