import { getProvisionalThresholds, isExplicitlyEnabled, parseCsv } from '../helpers/config.js'
import { preflight } from '../helpers/safety.js'
import { browseOnce } from '../helpers/workflows.js'

const PROFILE = 'stress'
const DEFAULT_LEVELS = [5, 10, 20, 30]
const DEFAULT_STAGE_DURATION = '1m'
const DEFAULT_MAX_VUS = 50
const ABSOLUTE_MAX_VUS = 200
const configuredLevels = parseCsv(__ENV.STRESS_LEVELS)
const LEVELS =
  configuredLevels.length > 0 ? configuredLevels.map((level) => Number(level)) : DEFAULT_LEVELS

if (LEVELS.some((level) => !Number.isInteger(level) || level < 1 || level > ABSOLUTE_MAX_VUS)) {
  throw new Error('STRESS_LEVELS must contain integers from 1 through 200.')
}

if (Math.max(...LEVELS) > DEFAULT_MAX_VUS && !isExplicitlyEnabled('ALLOW_HIGH_VU_COUNT')) {
  throw new Error(
    'Stress levels above 50 VUs require ALLOW_HIGH_VU_COUNT=true after explicit approval.'
  )
}

const thresholds = getProvisionalThresholds()
thresholds.unexpected_failures = [
  {
    threshold: 'rate<0.1',
    abortOnFail: true,
    delayAbortEval: '30s',
  },
]
thresholds.route_duration = [
  {
    threshold: 'p(95)<' + (Number(__ENV.STRESS_P95_MS_THRESHOLD) || 2_000),
    abortOnFail: true,
    delayAbortEval: '30s',
  },
]

export const options = {
  stages: [
    ...LEVELS.map((level) => ({
      duration: DEFAULT_STAGE_DURATION,
      target: level,
    })),
    { duration: DEFAULT_STAGE_DURATION, target: 0 },
  ],
  thresholds,
}

export function setup() {
  return preflight(PROFILE, { highLoad: true })
}

export default function () {
  browseOnce(PROFILE)
}
