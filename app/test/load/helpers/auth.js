import http from 'k6/http'
import { classifyAuthResponse } from './checks.js'
import { requiredEnv } from './config.js'

const DEFAULT_ACCOUNT_FILE = '../data/accounts.json'
const TOKEN_ROUTE = '/auth/v1/token?grant_type=password'
const AUTH_ROUTE_TAG = 'supabase-password-grant'
const FORBIDDEN_ACCOUNT_FIELDS = new Set([
  'access_token',
  'refresh_token',
  'service_role_key',
  'serviceRoleKey',
])
let cachedSession = null

function readAccounts() {
  const accountFile = (__ENV.LOAD_TEST_ACCOUNTS_FILE || DEFAULT_ACCOUNT_FILE).trim()
  let rawAccounts

  try {
    rawAccounts = open(accountFile)
  } catch {
    return []
  }

  let accounts
  try {
    accounts = JSON.parse(rawAccounts)
  } catch {
    throw new Error('The load-test account file is not valid JSON.')
  }

  if (!Array.isArray(accounts)) {
    throw new Error('The load-test account file must contain a JSON array.')
  }

  for (const account of accounts) {
    if (!account || typeof account.email !== 'string' || typeof account.password !== 'string') {
      throw new Error('Each load-test account needs an email and password.')
    }

    const forbiddenField = Object.keys(account).find((field) => FORBIDDEN_ACCOUNT_FIELDS.has(field))
    if (forbiddenField) {
      throw new Error('Account fixtures must not contain ' + forbiddenField + '.')
    }
  }

  return accounts
}

export const accounts = readAccounts()

export function assertAccountCapacity(requiredCount) {
  if (accounts.length < requiredCount) {
    throw new Error(
      'This scenario needs ' +
        requiredCount +
        ' accounts, but the fixture contains only ' +
        accounts.length +
        '.'
    )
  }
}

export function getAccountForVu(vuId = __VU) {
  const index = vuId - 1
  if (index < 0 || index >= accounts.length) {
    throw new Error('No stable account exists for VU ' + vuId + '. Increase the account pool.')
  }

  return accounts[index]
}

export function loginForVu(scenario, vuId = __VU) {
  if (cachedSession && cachedSession.vuId === vuId) {
    return cachedSession
  }

  const account = getAccountForVu(vuId)
  const supabaseUrl = requiredEnv('LOAD_TEST_SUPABASE_URL').replace(/\/+$/, '')
  const anonKey = requiredEnv('LOAD_TEST_SUPABASE_ANON_KEY')
  const response = http.post(
    supabaseUrl + TOKEN_ROUTE,
    JSON.stringify({
      email: account.email,
      password: account.password,
    }),
    {
      headers: {
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      tags: {
        route: AUTH_ROUTE_TAG,
        scenario,
        auth_state: 'credential_exchange',
      },
    }
  )

  const result = classifyAuthResponse(response, {
    route: AUTH_ROUTE_TAG,
    scenario,
    authState: 'credential_exchange',
    expectedStatuses: [200],
  })

  if (!result.expectedResponse) {
    throw new Error('Supabase login failed for the stable account assigned to VU ' + vuId + '.')
  }

  const body = response.json()
  if (!body.access_token) {
    throw new Error('Supabase login response did not include an access token.')
  }

  cachedSession = {
    accessToken: body.access_token,
    account,
    vuId,
  }

  return cachedSession
}

export function authorizationHeaders(session) {
  return {
    Authorization: 'Bearer ' + session.accessToken,
    'Content-Type': 'application/json',
  }
}
