import { boundedDuration, getProvisionalThresholds, optionalInteger } from '../helpers/config.js'
import { preflight } from '../helpers/safety.js'
import { browseOnce } from '../helpers/workflows.js'

const PROFILE = 'browse'
const VUS = optionalInteger('BROWSE_VUS', 5, 1, 50)
const DURATION = boundedDuration('BROWSE_DURATION', '2m', 30 * 60, 'ALLOW_LONG_BROWSE')

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: getProvisionalThresholds(),
}

export function setup() {
  return preflight(PROFILE, { highLoad: true })
}

export default function () {
  browseOnce(PROFILE)
}
