import { assertAccountCapacity } from '../helpers/auth.js'
import {
  getProvisionalThresholds,
  isExplicitlyEnabled,
  optionalInteger,
} from '../helpers/config.js'
import { getRealAiRequestCount, preflight } from '../helpers/safety.js'
import { recommendOnce } from '../helpers/workflows.js'

const PROFILE = 'recommendations-real'
const REQUESTS = getRealAiRequestCount()
const VUS = optionalInteger('REAL_AI_VUS', 1, 1, 3)

if (VUS > 1 && !isExplicitlyEnabled('ALLOW_REAL_AI_CONCURRENCY')) {
  throw new Error(
    'REAL_AI_VUS above 1 requires ALLOW_REAL_AI_CONCURRENCY=true after explicit cost approval.'
  )
}

export const options = {
  scenarios: {
    real_ai: {
      executor: 'shared-iterations',
      vus: VUS,
      iterations: REQUESTS,
      maxDuration: '10m',
    },
  },
  thresholds: {
    ...getProvisionalThresholds(),
    recommendation_success_rate: ['rate>0.95'],
  },
}

export function setup() {
  assertAccountCapacity(VUS)
  return preflight(PROFILE, {
    requireLiveOpenRouter: true,
  })
}

export default function () {
  recommendOnce(PROFILE, 'live')
}
