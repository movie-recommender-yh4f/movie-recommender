const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const DURATION_PATTERN = /^(\d+)(s|m|h)$/
const SECONDS_PER_MINUTE = 60
const MINUTES_PER_HOUR = 60
const DEFAULT_ABSOLUTE_DURATION_SECONDS = 4 * MINUTES_PER_HOUR * SECONDS_PER_MINUTE
const DURATION_FACTORS = {
  s: 1,
  m: SECONDS_PER_MINUTE,
  h: MINUTES_PER_HOUR * SECONDS_PER_MINUTE,
}
const DEFAULT_UNEXPECTED_FAILURE_RATE = 0.01
const DEFAULT_API_P95_MS = 1_000
const MIN_URL_LENGTH = 8

export function requiredEnv(name) {
  const value = (__ENV[name] || '').trim()
  if (!value) {
    throw new Error(name + ' is required.')
  }

  return value
}

export function optionalInteger(name, fallback, minimum, maximum) {
  const rawValue = (__ENV[name] || '').trim()
  if (!rawValue) {
    return fallback
  }

  const value = Number(rawValue)
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(name + ' must be an integer from ' + minimum + ' through ' + maximum + '.')
  }

  return value
}

export function boundedDuration(
  name,
  fallback,
  defaultMaximumSeconds,
  overrideName,
  absoluteMaximumSeconds = DEFAULT_ABSOLUTE_DURATION_SECONDS
) {
  const value = (__ENV[name] || fallback).trim()
  const match = DURATION_PATTERN.exec(value)

  if (!match) {
    throw new Error(name + ' must use a whole-number k6 duration such as 30s, 5m, or 1h.')
  }

  const amount = Number(match[1])
  const unit = match[2]
  const durationSeconds = amount * DURATION_FACTORS[unit]

  if (durationSeconds > absoluteMaximumSeconds) {
    throw new Error(name + ' exceeds the absolute safety cap.')
  }

  if (durationSeconds > defaultMaximumSeconds && !isExplicitlyEnabled(overrideName)) {
    throw new Error(
      name + ' exceeds its default safety cap. Set ' + overrideName + '=true only after approval.'
    )
  }

  return value
}

export function parseCsv(value) {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function isExplicitlyEnabled(name) {
  return (__ENV[name] || '').trim().toLowerCase() === 'true'
}

export function getBaseUrl() {
  const rawUrl = requiredEnv('BASE_URL')
  if (rawUrl.length < MIN_URL_LENGTH) {
    throw new Error('BASE_URL is invalid.')
  }

  let parsed
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error('BASE_URL must be an absolute URL.')
  }

  if (parsed.protocol !== 'https:' && !LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error('BASE_URL must use HTTPS unless it targets localhost.')
  }

  return rawUrl.replace(/\/+$/, '')
}

export function getTargetHostname() {
  return new URL(getBaseUrl()).hostname.toLowerCase()
}

export function isLocalTarget() {
  return LOCAL_HOSTS.has(getTargetHostname())
}

export function getProductionHosts() {
  const hosts = parseCsv(__ENV.PRODUCTION_HOSTS).map((host) => host.toLowerCase())

  if (hosts.length === 0 && !isLocalTarget()) {
    throw new Error(
      'PRODUCTION_HOSTS is required for non-local runs so production safety can be enforced.'
    )
  }

  return new Set(hosts)
}

export function assertNoServiceRoleKey() {
  const forbiddenVariables = [
    'LOAD_TEST_SUPABASE_SERVICE_ROLE_KEY',
    'NUXT_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]

  const exposedVariable = forbiddenVariables.find((name) => (__ENV[name] || '').trim())
  if (exposedVariable) {
    throw new Error(
      exposedVariable +
        ' must be removed from the k6 environment. Service-role keys are local setup-only.'
    )
  }
}

export function assertTargetSafety(profile, highLoad) {
  assertNoServiceRoleKey()

  const hostname = getTargetHostname()
  const isKnownProduction = getProductionHosts().has(hostname)
  const productionOverride = isExplicitlyEnabled('ALLOW_PRODUCTION_LOAD_TEST')

  if (highLoad && isKnownProduction && !productionOverride) {
    throw new Error(
      profile +
        ' refuses to target a known production host. Set ALLOW_PRODUCTION_LOAD_TEST=true only after explicit approval.'
    )
  }
}

export function getProvisionalThresholds() {
  const unexpectedFailureRate =
    Number(__ENV.UNEXPECTED_FAILURE_RATE_THRESHOLD) || DEFAULT_UNEXPECTED_FAILURE_RATE
  const apiP95Ms = Number(__ENV.API_P95_MS_THRESHOLD) || DEFAULT_API_P95_MS

  return {
    unexpected_failures: ['rate<' + unexpectedFailureRate],
    route_duration: ['p(95)<' + apiP95Ms],
    timeout_rate: ['rate<0.01'],
  }
}
