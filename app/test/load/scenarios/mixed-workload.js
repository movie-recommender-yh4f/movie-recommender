import { assertAccountCapacity } from '../helpers/auth.js'
import { boundedDuration, getProvisionalThresholds, optionalInteger } from '../helpers/config.js'
import { preflight } from '../helpers/safety.js'
import { authenticatedOnce, browseOnce, recommendOnce } from '../helpers/workflows.js'

const PROFILE = 'mixed-workload'
const TOTAL_VUS = optionalInteger('MIXED_VUS', 10, 3, 100)
const DURATION = boundedDuration('MIXED_DURATION', '5m', 30 * 60, 'ALLOW_LONG_MIXED')
const BROWSE_VUS = Math.max(1, Math.round(TOTAL_VUS * 0.65))
const RECOMMEND_VUS = Math.max(1, Math.round(TOTAL_VUS * 0.1))
const AUTHENTICATED_VUS = Math.max(1, TOTAL_VUS - BROWSE_VUS - RECOMMEND_VUS)

export const options = {
  scenarios: {
    browsing: {
      executor: 'constant-vus',
      vus: BROWSE_VUS,
      duration: DURATION,
      exec: 'browsing',
    },
    authenticated_activity: {
      executor: 'constant-vus',
      vus: AUTHENTICATED_VUS,
      duration: DURATION,
      exec: 'authenticatedActivity',
    },
    mocked_recommendations: {
      executor: 'constant-vus',
      vus: RECOMMEND_VUS,
      duration: DURATION,
      exec: 'mockedRecommendations',
    },
  },
  thresholds: getProvisionalThresholds(),
}

export function setup() {
  assertAccountCapacity(TOTAL_VUS)
  return preflight(PROFILE, { highLoad: true, requireMock: true })
}

export function browsing() {
  browseOnce(PROFILE)
}

export function authenticatedActivity() {
  authenticatedOnce(PROFILE)
}

export function mockedRecommendations() {
  recommendOnce(PROFILE, 'mock', '?getNew=true', {
    expectedStatuses: [200],
    expectRateLimit: true,
  })
}
