import http from 'k6/http'
import { authorizationHeaders, assertAccountCapacity, loginForVu } from '../helpers/auth.js'
import { classifyResponse } from '../helpers/checks.js'
import { getBaseUrl, getProvisionalThresholds, optionalInteger } from '../helpers/config.js'
import { preflight } from '../helpers/safety.js'

const PROFILE = 'rate-limits'
const DETAILS_ROUTE = '/api/movies/:id'
const WATCHED_ROUTE = '/api/watched'
const METADATA_ROUTE = '/api/movies/metadata'
const RECOMMEND_ROUTE = '/api/recommend'
const WARM_MOVIE_ID = optionalInteger('WARM_MOVIE_ID', 550, 1, 2_147_483_647)
const GUEST_DETAIL_REQUESTS = 8
const AUTH_DETAIL_REQUESTS = 25
const USER_LIST_REQUESTS = 25
const METADATA_REQUESTS = 8
const RECOMMENDATION_REQUESTS = 12

export const options = {
  scenarios: {
    guest_movie_details: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'guestMovieDetails',
      maxDuration: '15s',
    },
    authenticated_movie_details: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'authenticatedMovieDetails',
      maxDuration: '15s',
    },
    user_list_reads: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'userListReads',
      maxDuration: '15s',
    },
    metadata_reads: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'metadataReads',
      maxDuration: '15s',
    },
    mocked_recommendations: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      exec: 'mockedRecommendations',
      maxDuration: '45s',
    },
  },
  thresholds: getProvisionalThresholds(),
}

function classifyIntentionalRateLimit(response, route, authState) {
  classifyResponse(response, {
    route,
    scenario: PROFILE,
    authState,
    expectedStatuses: [200],
    expectRateLimit: true,
  })
}

export function setup() {
  assertAccountCapacity(1)
  return preflight(PROFILE, { highLoad: true, requireMock: true })
}

export function guestMovieDetails() {
  for (let index = 0; index < GUEST_DETAIL_REQUESTS; index++) {
    const response = http.get(getBaseUrl() + '/api/movies/' + WARM_MOVIE_ID, {
      headers: {
        'x-vercel-forwarded-for': '198.51.100.20',
      },
      tags: {
        route: DETAILS_ROUTE,
        scenario: PROFILE,
        auth_state: 'anonymous',
      },
    })
    classifyIntentionalRateLimit(response, DETAILS_ROUTE, 'anonymous')
  }
}

export function authenticatedMovieDetails() {
  const session = loginForVu(PROFILE, 1)
  const headers = authorizationHeaders(session)

  for (let index = 0; index < AUTH_DETAIL_REQUESTS; index++) {
    const response = http.get(getBaseUrl() + '/api/movies/' + WARM_MOVIE_ID, {
      headers,
      tags: {
        route: DETAILS_ROUTE,
        scenario: PROFILE,
        auth_state: 'authenticated',
      },
    })
    classifyIntentionalRateLimit(response, DETAILS_ROUTE, 'authenticated')
  }
}

export function userListReads() {
  const session = loginForVu(PROFILE, 1)
  const headers = authorizationHeaders(session)

  for (let index = 0; index < USER_LIST_REQUESTS; index++) {
    const response = http.get(getBaseUrl() + WATCHED_ROUTE, {
      headers,
      tags: {
        route: WATCHED_ROUTE,
        scenario: PROFILE,
        auth_state: 'authenticated',
      },
    })
    classifyIntentionalRateLimit(response, WATCHED_ROUTE, 'authenticated')
  }
}

export function metadataReads() {
  const session = loginForVu(PROFILE, 1)
  const headers = authorizationHeaders(session)

  for (let index = 0; index < METADATA_REQUESTS; index++) {
    const response = http.post(
      getBaseUrl() + METADATA_ROUTE,
      JSON.stringify({ tmdbIds: [WARM_MOVIE_ID] }),
      {
        headers,
        tags: {
          route: METADATA_ROUTE,
          scenario: PROFILE,
          auth_state: 'authenticated',
        },
      }
    )
    classifyIntentionalRateLimit(response, METADATA_ROUTE, 'authenticated')
  }
}

export function mockedRecommendations() {
  const session = loginForVu(PROFILE, 1)
  const headers = authorizationHeaders(session)

  for (let index = 0; index < RECOMMENDATION_REQUESTS; index++) {
    const response = http.get(getBaseUrl() + RECOMMEND_ROUTE + '?getNew=true', {
      headers,
      tags: {
        route: RECOMMEND_ROUTE,
        scenario: PROFILE,
        auth_state: 'authenticated',
        provider_mode: 'mock',
      },
    })
    classifyIntentionalRateLimit(response, RECOMMEND_ROUTE, 'authenticated')
  }
}
