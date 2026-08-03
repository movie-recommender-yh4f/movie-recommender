import http from 'k6/http'
import {
  assertTargetSafety,
  getBaseUrl,
  getProductionHosts,
  getTargetHostname,
  isExplicitlyEnabled,
  isLocalTarget,
  optionalInteger,
  requiredEnv,
} from './config.js'
import { classifyResponse } from './checks.js'

const STATUS_ROUTE = '/api/load-test/status'
const SAFE_LOAD_TEST_ENVIRONMENTS = new Set(['local', 'staging', 'load-test'])
const REAL_AI_CONFIRMATION = 'I_UNDERSTAND_REAL_AI_COSTS'
const DEFAULT_REAL_AI_REQUESTS = 1
const DEFAULT_MAX_REAL_AI_REQUESTS = 5
const ABSOLUTE_REAL_AI_REQUEST_CAP = 10

export function preflight(profile, options = {}) {
  const highLoad = options.highLoad === true
  assertTargetSafety(profile, highLoad)

  const token = requiredEnv('LOAD_TEST_TOKEN')
  const response = http.get(getBaseUrl() + STATUS_ROUTE, {
    headers: {
      'X-NextWatch-Load-Test-Token': token,
    },
    tags: {
      route: STATUS_ROUTE,
      scenario: profile,
      auth_state: 'protected_preflight',
    },
  })
  const result = classifyResponse(response, {
    route: STATUS_ROUTE,
    scenario: profile,
    authState: 'protected_preflight',
    expectedStatuses: [200],
  })

  if (!result.expectedResponse) {
    throw new Error('Protected load-test preflight failed with status ' + response.status + '.')
  }

  let status
  try {
    status = response.json()
  } catch {
    throw new Error('Protected load-test preflight did not return JSON.')
  }

  const productionOverride = isExplicitlyEnabled('ALLOW_PRODUCTION_LOAD_TEST')
  if (highLoad && !SAFE_LOAD_TEST_ENVIRONMENTS.has(status.environment) && !productionOverride) {
    throw new Error(
      profile +
        ' requires NUXT_LOAD_TEST_ENVIRONMENT=staging or load-test on the target deployment.'
    )
  }

  if (highLoad && getProductionHosts().has(getTargetHostname()) && !productionOverride) {
    throw new Error(profile + ' refuses the configured production hostname.')
  }

  if (options.requireMock === true) {
    if (status.providerMode !== 'mock' || status.mockEnabled !== true) {
      throw new Error(profile + ' requires the protected server-side mock provider.')
    }

    const expectedScenario = (__ENV.EXPECTED_MOCK_SCENARIO || '').trim()
    if (expectedScenario && status.mockScenario !== expectedScenario) {
      throw new Error(
        'Target mock scenario is ' +
          status.mockScenario +
          ', not EXPECTED_MOCK_SCENARIO=' +
          expectedScenario +
          '.'
      )
    }
  }

  if (options.requireLiveOpenRouter === true) {
    if (status.providerMode !== 'live') {
      throw new Error('The real-AI test requires live provider mode.')
    }

    if (!Array.isArray(status.providers) || status.providers[0] !== 'openrouter') {
      throw new Error(
        'The real-AI test requires OpenRouter to be the first configured live provider. Remove the Google key from this dedicated deployment.'
      )
    }
  }

  return status
}

export function getRealAiRequestCount() {
  if (!isExplicitlyEnabled('ALLOW_REAL_AI_TEST')) {
    throw new Error('ALLOW_REAL_AI_TEST=true is required for the real-AI test.')
  }
  const productionOverride = isExplicitlyEnabled('ALLOW_PRODUCTION_LOAD_TEST')
  if (getProductionHosts().has(getTargetHostname()) && !productionOverride) {
    throw new Error(
      'The real-AI test requires ALLOW_PRODUCTION_LOAD_TEST=true on a configured production host.'
    )
  }

  if ((__ENV.REAL_AI_CONFIRMATION || '').trim() !== REAL_AI_CONFIRMATION) {
    throw new Error('REAL_AI_CONFIRMATION must equal ' + REAL_AI_CONFIRMATION + '.')
  }

  const maximum = optionalInteger(
    'MAX_REAL_AI_REQUESTS',
    DEFAULT_MAX_REAL_AI_REQUESTS,
    1,
    ABSOLUTE_REAL_AI_REQUEST_CAP
  )

  return optionalInteger('REAL_AI_REQUESTS', DEFAULT_REAL_AI_REQUESTS, 1, maximum)
}

export function assertSignupSafety() {
  assertTargetSafety('signup-smoke', false)

  if (!isExplicitlyEnabled('ALLOW_SIGNUP_TEST')) {
    throw new Error('ALLOW_SIGNUP_TEST=true is required because signup may send one email.')
  }

  if (!isLocalTarget() && getProductionHosts().has(getTargetHostname())) {
    throw new Error('The signup smoke test never runs against a configured production host.')
  }
}
