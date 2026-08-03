import http from 'k6/http'
import { classifyResponse } from '../helpers/checks.js'
import { getBaseUrl, getProvisionalThresholds, requiredEnv } from '../helpers/config.js'
import { assertSignupSafety, preflight } from '../helpers/safety.js'

const PROFILE = 'signup-smoke'
const SIGNUP_ROUTE = '/api/auth/signup'
const DEFAULT_EMAIL_PREFIX = 'nextwatch-loadtest-'

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: getProvisionalThresholds(),
}

export function setup() {
  assertSignupSafety()
  return preflight(PROFILE)
}

export default function () {
  const email = requiredEnv('SIGNUP_EMAIL')
  const emailPrefix = (__ENV.SIGNUP_EMAIL_PREFIX || DEFAULT_EMAIL_PREFIX).trim()

  if (!email.toLowerCase().startsWith(emailPrefix.toLowerCase())) {
    throw new Error('SIGNUP_EMAIL must use the configured synthetic test prefix.')
  }

  const expectDuplicate = (__ENV.EXPECT_DUPLICATE_SIGNUP || '').trim().toLowerCase() === 'true'
  const response = http.post(
    getBaseUrl() + SIGNUP_ROUTE,
    JSON.stringify({
      email,
      password: requiredEnv('SIGNUP_PASSWORD'),
      username: requiredEnv('SIGNUP_USERNAME'),
      captchaToken: requiredEnv('HCAPTCHA_TEST_TOKEN'),
    }),
    {
      headers: {
        'Content-Type': 'application/json',
      },
      tags: {
        route: SIGNUP_ROUTE,
        scenario: PROFILE,
        auth_state: 'signup',
      },
    }
  )

  classifyResponse(response, {
    route: SIGNUP_ROUTE,
    scenario: PROFILE,
    authState: 'signup',
    expectedStatuses: [expectDuplicate ? 409 : 200],
  })
}
