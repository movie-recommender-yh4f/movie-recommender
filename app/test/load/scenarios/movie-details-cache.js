import http from 'k6/http'
import { classifyResponse } from '../helpers/checks.js'
import {
  getBaseUrl,
  getProvisionalThresholds,
  optionalInteger,
  parseCsv,
  requiredEnv,
} from '../helpers/config.js'
import { preflight } from '../helpers/safety.js'

const PROFILE = 'movie-details-cache'
const DETAILS_ROUTE = '/api/movies/:id'
const WARM_MOVIE_ID = optionalInteger('WARM_MOVIE_ID', 550, 1, 2_147_483_647)
const INVALID_MOVIE_ID = optionalInteger('INVALID_MOVIE_ID', 2_147_483_647, 1, 2_147_483_647)
const STAMPEDE_MOVIE_ID = optionalInteger(
  'STAMPEDE_MOVIE_ID',
  Number(requiredEnv('STAMPEDE_MOVIE_ID')),
  1,
  2_147_483_647
)
const COLD_MOVIE_IDS = parseCsv(requiredEnv('COLD_MOVIE_IDS'))
  .slice(0, 5)
  .map((movieId) => Number(movieId))
const STAMPEDE_VUS = optionalInteger('STAMPEDE_VUS', 5, 2, 5)

if (
  COLD_MOVIE_IDS.length === 0 ||
  COLD_MOVIE_IDS.some((movieId) => !Number.isInteger(movieId) || movieId <= 0)
) {
  throw new Error('COLD_MOVIE_IDS must include at least one verified uncached valid TMDB ID.')
}

export const options = {
  scenarios: {
    warm_positive: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 3,
      exec: 'warmPositive',
      maxDuration: '15s',
    },
    cold_distinct: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'coldDistinct',
      startTime: '10s',
      maxDuration: '20s',
    },
    same_key_stampede: {
      executor: 'shared-iterations',
      vus: STAMPEDE_VUS,
      iterations: STAMPEDE_VUS,
      exec: 'sameKeyStampede',
      startTime: '25s',
      maxDuration: '20s',
    },
    invalid_first: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'invalidFirst',
      startTime: '45s',
      maxDuration: '10s',
    },
    invalid_repeated: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 3,
      exec: 'invalidRepeated',
      startTime: '50s',
      maxDuration: '15s',
    },
  },
  thresholds: getProvisionalThresholds(),
}

function requestMovie(movieId, phase, cacheState, expectedStatuses, guestIp) {
  const response = http.get(getBaseUrl() + '/api/movies/' + movieId, {
    headers: {
      'x-vercel-forwarded-for': guestIp,
    },
    tags: {
      route: DETAILS_ROUTE,
      scenario: PROFILE,
      cache_state: cacheState,
      phase,
    },
  })

  classifyResponse(response, {
    route: DETAILS_ROUTE,
    scenario: PROFILE,
    cacheState,
    expectedStatuses,
  })
}

export function setup() {
  return preflight(PROFILE, { highLoad: true })
}

export function warmPositive() {
  requestMovie(WARM_MOVIE_ID, 'warm-positive', 'warm_positive', [200], '198.51.100.10')
}

export function coldDistinct() {
  for (const movieId of COLD_MOVIE_IDS) {
    requestMovie(movieId, 'cold-distinct', 'cold_positive', [200], '198.51.100.11')
  }
}

export function sameKeyStampede() {
  requestMovie(STAMPEDE_MOVIE_ID, 'same-key-stampede', 'cold_stampede', [200], '198.51.100.12')
}

export function invalidFirst() {
  requestMovie(INVALID_MOVIE_ID, 'invalid-first', 'negative_miss', [404], '198.51.100.13')
}

export function invalidRepeated() {
  requestMovie(
    INVALID_MOVIE_ID,
    'invalid-repeated',
    'negative_repeat_no_cache',
    [404],
    '198.51.100.14'
  )
}
