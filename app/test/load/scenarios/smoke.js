import { sleep } from 'k6'
import { accounts, assertAccountCapacity } from '../helpers/auth.js'
import { boundedDuration, getProvisionalThresholds, optionalInteger } from '../helpers/config.js'
import { preflight } from '../helpers/safety.js'
import { authenticatedOnce, browseOnce } from '../helpers/workflows.js'

const PROFILE = 'smoke'
const VUS = optionalInteger('SMOKE_VUS', 1, 1, 2)
const DURATION = boundedDuration('SMOKE_DURATION', '30s', 60, 'ALLOW_LONG_SMOKE')

export const options = {
  vus: VUS,
  duration: DURATION,
  thresholds: getProvisionalThresholds(),
}

export function setup() {
  const status = preflight(PROFILE)
  if (accounts.length > 0) {
    assertAccountCapacity(VUS)
  }

  return status
}

export default function () {
  browseOnce(PROFILE)

  if (accounts.length > 0) {
    authenticatedOnce(PROFILE)
  }

  sleep(1)
}
