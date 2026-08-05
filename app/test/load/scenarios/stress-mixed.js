import { assertAccountCapacity } from '../helpers/auth.js'
import { boundedDuration, getProvisionalThresholds, isExplicitlyEnabled } from '../helpers/config.js'
import { preflight } from '../helpers/safety.js'
import {
  allocateMixedVus,
  assertStressVuSafety,
  buildStressStages,
  getAccountSlot,
  parseStressLevels,
} from '../helpers/stress-config.js'
import { authenticatedOnce, browseOnce } from '../helpers/workflows.js'

const PROFILE = 'stress-mixed'
const LEVELS_VARIABLE = 'MIXED_STRESS_LEVELS'
const DEFAULT_STAGE_DURATION = '1m'
const DEFAULT_MAX_STAGE_DURATION_SECONDS = 30 * 60
const STAGE_DURATION = boundedDuration(
  'MIXED_STRESS_STAGE_DURATION',
  DEFAULT_STAGE_DURATION,
  DEFAULT_MAX_STAGE_DURATION_SECONDS,
  'ALLOW_LONG_MIXED_STRESS'
)
const LEVELS = parseStressLevels(__ENV[LEVELS_VARIABLE], LEVELS_VARIABLE)
const MAXIMUM_TOTAL_VUS = assertStressVuSafety(
  LEVELS,
  LEVELS_VARIABLE,
  isExplicitlyEnabled('ALLOW_HIGH_VU_COUNT')
)
const ALLOCATIONS = new Map(LEVELS.map((level) => [level, allocateMixedVus(level)]))
const MAXIMUM_AUTHENTICATED_VUS = allocateMixedVus(MAXIMUM_TOTAL_VUS).authenticated
const AUTHENTICATED_USER_TYPE = 'authenticated'
const ANONYMOUS_USER_TYPE = 'anonymous'
const STRESS_UNEXPECTED_FAILURE_RATE = 0.1
const DEFAULT_STRESS_P95_MS = 2_000
const stressP95Ms = Number(__ENV.MIXED_STRESS_P95_MS_THRESHOLD) || DEFAULT_STRESS_P95_MS
const thresholds = getProvisionalThresholds()

for (const userType of [AUTHENTICATED_USER_TYPE, ANONYMOUS_USER_TYPE]) {
  thresholds['unexpected_failures{user_type:' + userType + '}'] = [
    {
      threshold: 'rate<' + STRESS_UNEXPECTED_FAILURE_RATE,
      abortOnFail: true,
      delayAbortEval: '30s',
    },
  ]
  thresholds['route_duration{user_type:' + userType + '}'] = [
    {
      threshold: 'p(95)<' + stressP95Ms,
      abortOnFail: true,
      delayAbortEval: '30s',
    },
  ]
  thresholds['timeout_rate{user_type:' + userType + '}'] = ['rate<0.01']
  thresholds['unexpected_4xx_rate{user_type:' + userType + '}'] = [
    'rate<' + STRESS_UNEXPECTED_FAILURE_RATE,
  ]
  thresholds['unexpected_5xx_rate{user_type:' + userType + '}'] = [
    'rate<' + STRESS_UNEXPECTED_FAILURE_RATE,
  ]
  thresholds['expected_rate_limits{user_type:' + userType + '}'] = ['rate>=0']
  thresholds['status_429{user_type:' + userType + '}'] = ['count>=0']
  thresholds['checks{user_type:' + userType + '}'] = ['rate>0.9']
}

thresholds['authentication_failure_rate{user_type:authenticated}'] = ['rate<0.01']

thresholds.unexpected_failures = [
  {
    threshold: 'rate<' + STRESS_UNEXPECTED_FAILURE_RATE,
    abortOnFail: true,
    delayAbortEval: '30s',
  },
]
thresholds.route_duration = [
  {
    threshold: 'p(95)<' + stressP95Ms,
    abortOnFail: true,
    delayAbortEval: '30s',
  },
]

function allocationFor(level) {
  const allocation = ALLOCATIONS.get(level)
  if (!allocation) {
    throw new Error('No mixed stress allocation exists for total VU level ' + level + '.')
  }

  return allocation
}

export const options = {
  scenarios: {
    authenticated_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: buildStressStages(
        LEVELS,
        STAGE_DURATION,
        (level) => allocationFor(level).authenticated
      ),
      gracefulRampDown: '0s',
      exec: 'authenticatedActivity',
      tags: { user_type: AUTHENTICATED_USER_TYPE },
    },
    anonymous_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: buildStressStages(
        LEVELS,
        STAGE_DURATION,
        (level) => allocationFor(level).anonymous
      ),
      gracefulRampDown: '0s',
      exec: 'anonymousBrowsing',
      tags: { user_type: ANONYMOUS_USER_TYPE },
    },
  },
  thresholds,
}

export function setup() {
  assertAccountCapacity(MAXIMUM_AUTHENTICATED_VUS)
  return preflight(PROFILE, { highLoad: true })
}

export function authenticatedActivity() {
  const accountSlot = getAccountSlot(__VU, MAXIMUM_AUTHENTICATED_VUS)
  authenticatedOnce(PROFILE, accountSlot)
}

export function anonymousBrowsing() {
  browseOnce(PROFILE)
}
