const DEFAULT_STRESS_LEVELS = [5, 10, 20, 30]
const MINIMUM_VUS = 1
const DEFAULT_HIGH_VU_LIMIT = 50
const ABSOLUTE_MAX_VUS = 200
const AUTHENTICATED_SHARE = 0.8
const ANONYMOUS_SHARE = 1 - AUTHENTICATED_SHARE

export function parseStressLevels(value, variableName) {
  const configuredLevels = (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const levels =
    configuredLevels.length > 0
      ? configuredLevels.map((level) => Number(level))
      : DEFAULT_STRESS_LEVELS

  if (
    levels.some(
      (level) =>
        !Number.isInteger(level) || level < MINIMUM_VUS || level > ABSOLUTE_MAX_VUS
    )
  ) {
    throw new Error(
      variableName +
        ' must contain integers from ' +
        MINIMUM_VUS +
        ' through ' +
        ABSOLUTE_MAX_VUS +
        '.'
    )
  }

  return levels
}

export function assertStressVuSafety(levels, variableName, highVuCountAllowed) {
  const maximumVus = Math.max(...levels)
  if (maximumVus > DEFAULT_HIGH_VU_LIMIT && !highVuCountAllowed) {
    throw new Error(
      variableName +
        ' levels above ' +
        DEFAULT_HIGH_VU_LIMIT +
        ' VUs require ALLOW_HIGH_VU_COUNT=true after explicit approval.'
    )
  }

  return maximumVus
}

export function allocateMixedVus(totalVus) {
  if (!Number.isInteger(totalVus) || totalVus < MINIMUM_VUS) {
    throw new Error('The mixed stress total must be a positive integer.')
  }

  if (totalVus === MINIMUM_VUS) {
    return { authenticated: MINIMUM_VUS, anonymous: 0 }
  }

  const anonymous = Math.max(MINIMUM_VUS, Math.round(totalVus * ANONYMOUS_SHARE))
  const authenticated = Math.max(MINIMUM_VUS, totalVus - anonymous)

  return { authenticated, anonymous }
}

export function buildStressStages(levels, duration, selectTarget) {
  return [
    ...levels.map((level) => ({
      duration,
      target: selectTarget(level),
    })),
    { duration, target: 0 },
  ]
}

export function getAccountSlot(vuId, accountCount) {
  if (!Number.isInteger(vuId) || vuId < MINIMUM_VUS) {
    throw new Error('The k6 VU ID must be a positive integer.')
  }

  if (!Number.isInteger(accountCount) || accountCount < MINIMUM_VUS) {
    throw new Error('The account count must be a positive integer.')
  }

  return ((vuId - MINIMUM_VUS) % accountCount) + MINIMUM_VUS
}
