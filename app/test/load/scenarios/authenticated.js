import { assertAccountCapacity } from '../helpers/auth.js'
import { boundedDuration, getProvisionalThresholds, optionalInteger } from '../helpers/config.js'
import { preflight } from '../helpers/safety.js'
import { authenticatedOnce } from '../helpers/workflows.js'

const PROFILE = 'authenticated'
const VUS = optionalInteger('AUTHENTICATED_VUS', 5, 1, 50)
const DURATION = boundedDuration(
  'AUTHENTICATED_DURATION',
  '2m',
  30 * 60,
  'ALLOW_LONG_AUTHENTICATED'
)

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: getProvisionalThresholds(),
}

export function setup() {
  assertAccountCapacity(VUS)
  return preflight(PROFILE, { highLoad: true })
}

export default function () {
  authenticatedOnce(PROFILE)
}
