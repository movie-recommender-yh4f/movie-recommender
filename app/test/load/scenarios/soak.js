import { assertAccountCapacity } from '../helpers/auth.js'
import { boundedDuration, getProvisionalThresholds, optionalInteger } from '../helpers/config.js'
import { preflight } from '../helpers/safety.js'
import { authenticatedOnce, browseOnce } from '../helpers/workflows.js'

const PROFILE = 'soak'
const VUS = optionalInteger('SOAK_VUS', 5, 1, 50)
const DURATION = boundedDuration('SOAK_DURATION', '20m', 30 * 60, 'ALLOW_LONG_SOAK')
const AUTHENTICATED_INTERVAL = 4

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
  if (__ITER % AUTHENTICATED_INTERVAL === 0) {
    authenticatedOnce(PROFILE)
    return
  }

  browseOnce(PROFILE)
}
