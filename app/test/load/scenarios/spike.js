import { boundedDuration, getProvisionalThresholds, optionalInteger } from '../helpers/config.js'
import { preflight } from '../helpers/safety.js'
import { browseOnce } from '../helpers/workflows.js'

const PROFILE = 'spike'
const BASE_VUS = optionalInteger('SPIKE_BASE_VUS', 2, 1, 20)
const MAX_VUS = optionalInteger('SPIKE_MAX_VUS', 20, BASE_VUS, 100)
const RAMP_DURATION = boundedDuration('SPIKE_RAMP_DURATION', '15s', 60, 'ALLOW_LONG_SPIKE')
const HOLD_DURATION = boundedDuration('SPIKE_HOLD_DURATION', '30s', 5 * 60, 'ALLOW_LONG_SPIKE')

export const options = {
  stages: [
    { duration: RAMP_DURATION, target: BASE_VUS },
    { duration: RAMP_DURATION, target: MAX_VUS },
    { duration: HOLD_DURATION, target: MAX_VUS },
    { duration: RAMP_DURATION, target: BASE_VUS },
    { duration: RAMP_DURATION, target: 0 },
  ],
  thresholds: getProvisionalThresholds(),
}

export function setup() {
  return preflight(PROFILE, { highLoad: true })
}

export default function () {
  browseOnce(PROFILE)
}
