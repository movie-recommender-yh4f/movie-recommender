import { createClient } from '@supabase/supabase-js'
import path from 'node:path'

export const MAX_TEST_USERS = 200
export const DEFAULT_TEST_USER_COUNT = 10
export const DEFAULT_USER_PREFIX = 'nextwatch-loadtest'
export const DEFAULT_EMAIL_DOMAIN = 'example.invalid'
export const DEFAULT_ACCOUNT_FILE = 'test/load/data/accounts.json'
export const LOAD_TEST_MARKER = 'nextwatch-load-test'
export const MIN_PASSWORD_LENGTH = 12
export const DEFAULT_WATCHED_IDS = [550, 680, 155, 13, 122]
const MAX_WATCHED_IDS = 20
const PREFIX_PATTERN = /^[a-z0-9-]+$/

export function writeOutput(message) {
  process.stdout.write(message + '\n')
}

export function writeError(message) {
  process.stderr.write(message + '\n')
}

export function requiredEnvironment(name) {
  const value = (process.env[name] || '').trim()
  if (!value) {
    throw new Error(name + ' is required.')
  }

  return value
}

function parseInteger(name, fallback, minimum, maximum) {
  const rawValue = (process.env[name] || '').trim()
  if (!rawValue) {
    return fallback
  }

  const value = Number(rawValue)
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(name + ' must be an integer from ' + minimum + ' through ' + maximum + '.')
  }

  return value
}

function parseProjectReference(supabaseUrl) {
  const hostname = new URL(supabaseUrl).hostname
  return hostname.endsWith('.supabase.co') ? hostname.split('.')[0] : hostname
}

function parseWatchedIds() {
  const configured = (process.env.LOAD_TEST_WATCHED_TMDB_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  const values = configured.length > 0 ? configured : DEFAULT_WATCHED_IDS
  const ids = values.map((value) => Number(value))

  if (
    ids.length === 0 ||
    ids.length > MAX_WATCHED_IDS ||
    ids.some((value) => !Number.isInteger(value) || value <= 0)
  ) {
    throw new Error('LOAD_TEST_WATCHED_TMDB_IDS must contain 1 through 20 positive integer IDs.')
  }

  return [...new Set(ids)]
}

function resolveAccountFile() {
  const configured = process.env.LOAD_TEST_ACCOUNT_FILE || DEFAULT_ACCOUNT_FILE
  const resolved = path.resolve(configured)
  const allowedRoot = path.resolve('test/load/data') + path.sep

  if (!resolved.startsWith(allowedRoot)) {
    throw new Error('LOAD_TEST_ACCOUNT_FILE must stay under app/test/load/data.')
  }

  return resolved
}

export function loadAdminConfiguration() {
  const supabaseUrl = requiredEnvironment('LOAD_TEST_SUPABASE_URL').replace(/\/+$/, '')
  const serviceRoleKey = requiredEnvironment('LOAD_TEST_SUPABASE_SERVICE_ROLE_KEY')
  const expectedProjectRef = requiredEnvironment('LOAD_TEST_EXPECTED_PROJECT_REF')
  const actualProjectRef = parseProjectReference(supabaseUrl)
  const productionProjectRefs = requiredEnvironment('PRODUCTION_SUPABASE_PROJECT_REFS')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (productionProjectRefs.includes(actualProjectRef)) {
    throw new Error('Test-user administration is disabled for known production projects.')
  }

  if (actualProjectRef !== expectedProjectRef) {
    throw new Error('Supabase URL project reference does not match LOAD_TEST_EXPECTED_PROJECT_REF.')
  }

  const prefix = (process.env.LOAD_TEST_USER_PREFIX || DEFAULT_USER_PREFIX).trim().toLowerCase()
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(
      'LOAD_TEST_USER_PREFIX may contain only lowercase letters, numbers, and hyphens.'
    )
  }

  const emailDomain = (process.env.LOAD_TEST_USER_EMAIL_DOMAIN || DEFAULT_EMAIL_DOMAIN)
    .trim()
    .toLowerCase()
  if (!emailDomain || /\s/.test(emailDomain)) {
    throw new Error('LOAD_TEST_USER_EMAIL_DOMAIN is invalid.')
  }

  return {
    accountFile: resolveAccountFile(),
    actualProjectRef,
    client: createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
    count: parseInteger('LOAD_TEST_USER_COUNT', DEFAULT_TEST_USER_COUNT, 1, MAX_TEST_USERS),
    emailDomain,
    password: requiredEnvironment('LOAD_TEST_USER_PASSWORD'),
    prefix,
    watchedIds: parseWatchedIds(),
  }
}

export function validatePassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      'LOAD_TEST_USER_PASSWORD must contain at least ' + MIN_PASSWORD_LENGTH + ' characters.'
    )
  }
}

export function createTestEmail(prefix, emailDomain, index) {
  return prefix + '-' + String(index + 1).padStart(3, '0') + '@' + emailDomain
}

export function isMarkedTestUser(user, prefix) {
  return (
    user?.app_metadata?.load_test_marker === LOAD_TEST_MARKER &&
    user?.app_metadata?.load_test_prefix === prefix
  )
}

export async function listAllAuthUsers(client) {
  const users = []
  const perPage = 200
  let page = 1

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage })
    if (error) {
      throw error
    }

    users.push(...data.users)
    if (data.users.length < perPage) {
      return users
    }

    page++
  }
}
