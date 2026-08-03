import http from 'k6/http'
import { sleep } from 'k6'
import { authorizationHeaders, loginForVu } from './auth.js'
import { classifyRecommendationResponse, classifyResponse } from './checks.js'
import { getBaseUrl, optionalInteger, parseCsv } from './config.js'

const POPULAR_ROUTE = '/api/movies/popular'
const SEARCH_ROUTE = '/api/movies/search'
const WATCHED_ROUTE = '/api/watched'
const MY_LIST_ROUTE = '/api/mylist'
const METADATA_ROUTE = '/api/movies/metadata'
const RECOMMEND_ROUTE = '/api/recommend'
const DEFAULT_MOVIE_IDS = ['550', '680', '155', '13']
const DEFAULT_SEARCH_TERMS = ['matrix', 'arrival', 'godfather']
const DEFAULT_THINK_TIME_SECONDS = 1
const DEFAULT_MUTATION_MOVIE_ID = 603

function requestOptions(route, scenario, authState, headers = {}) {
  return {
    headers,
    tags: {
      route,
      scenario,
      auth_state: authState,
    },
  }
}

export function getMovieIds() {
  const configured = parseCsv(__ENV.MOVIE_IDS)
  return configured.length > 0 ? configured : DEFAULT_MOVIE_IDS
}

export function browseOnce(scenario) {
  const baseUrl = getBaseUrl()
  const thinkTime = optionalInteger('THINK_TIME_SECONDS', DEFAULT_THINK_TIME_SECONDS, 0, 30)
  const movieIds = getMovieIds()
  const searchTerms = parseCsv(__ENV.SEARCH_TERMS)
  const terms = searchTerms.length > 0 ? searchTerms : DEFAULT_SEARCH_TERMS

  const pageResponse = http.get(baseUrl + '/', requestOptions('/', scenario, 'anonymous'))
  classifyResponse(pageResponse, {
    route: '/',
    scenario,
    expectedStatuses: [200],
  })
  sleep(thinkTime)

  const popularResponse = http.get(
    baseUrl + POPULAR_ROUTE,
    requestOptions(POPULAR_ROUTE, scenario, 'anonymous')
  )
  classifyResponse(popularResponse, {
    route: POPULAR_ROUTE,
    scenario,
    expectedStatuses: [200, 429],
    expectRateLimit: popularResponse.status === 429,
  })
  sleep(thinkTime)

  const searchTerm = terms[__ITER % terms.length]
  const searchResponse = http.get(
    baseUrl + SEARCH_ROUTE + '?q=' + encodeURIComponent(searchTerm),
    requestOptions(SEARCH_ROUTE, scenario, 'anonymous')
  )
  classifyResponse(searchResponse, {
    route: SEARCH_ROUTE,
    scenario,
    expectedStatuses: [200],
  })
  sleep(thinkTime)

  const movieId = movieIds[__ITER % movieIds.length]
  const detailsRoute = '/api/movies/:id'
  const detailsResponse = http.get(
    baseUrl + '/api/movies/' + movieId,
    requestOptions(detailsRoute, scenario, 'anonymous')
  )
  classifyResponse(detailsResponse, {
    route: detailsRoute,
    scenario,
    cacheState: 'mixed',
    expectedStatuses: [200],
  })
  sleep(thinkTime)
}

export function authenticatedOnce(scenario) {
  const baseUrl = getBaseUrl()
  const session = loginForVu(scenario)
  const headers = authorizationHeaders(session)

  const watchedResponse = http.get(
    baseUrl + WATCHED_ROUTE,
    requestOptions(WATCHED_ROUTE, scenario, 'authenticated', headers)
  )
  const watchedResult = classifyResponse(watchedResponse, {
    route: WATCHED_ROUTE,
    scenario,
    authState: 'authenticated',
    expectedStatuses: [200],
  })

  const myListResponse = http.get(
    baseUrl + MY_LIST_ROUTE,
    requestOptions(MY_LIST_ROUTE, scenario, 'authenticated', headers)
  )
  const myListResult = classifyResponse(myListResponse, {
    route: MY_LIST_ROUTE,
    scenario,
    authState: 'authenticated',
    expectedStatuses: [200],
  })

  if (watchedResult.expectedResponse && myListResult.expectedResponse) {
    const watchedIds = watchedResponse.json().tmdbIds || []
    const myListIds = myListResponse.json().tmdbIds || []
    const metadataIds = [...new Set([...watchedIds, ...myListIds])].slice(0, 20)

    const metadataResponse = http.post(
      baseUrl + METADATA_ROUTE,
      JSON.stringify({ tmdbIds: metadataIds }),
      requestOptions(METADATA_ROUTE, scenario, 'authenticated', headers)
    )
    classifyResponse(metadataResponse, {
      route: METADATA_ROUTE,
      scenario,
      authState: 'authenticated',
      expectedStatuses: [200],
    })
  }

  const mutationMovieId = optionalInteger(
    'LOAD_TEST_MUTATION_MOVIE_ID',
    DEFAULT_MUTATION_MOVIE_ID,
    1,
    2_147_483_647
  )
  const mutationBody = JSON.stringify({ tmdbId: mutationMovieId })
  const addResponse = http.post(
    baseUrl + MY_LIST_ROUTE,
    mutationBody,
    requestOptions(MY_LIST_ROUTE + ':post', scenario, 'authenticated', headers)
  )
  const addResult = classifyResponse(addResponse, {
    route: MY_LIST_ROUTE + ':post',
    scenario,
    authState: 'authenticated',
    expectedStatuses: [200, 409],
  })

  if (addResult.expectedResponse) {
    const deleteResponse = http.del(
      baseUrl + MY_LIST_ROUTE,
      mutationBody,
      requestOptions(MY_LIST_ROUTE + ':delete', scenario, 'authenticated', headers)
    )
    classifyResponse(deleteResponse, {
      route: MY_LIST_ROUTE + ':delete',
      scenario,
      authState: 'authenticated',
      expectedStatuses: [200],
    })
  }
}

export function recommendOnce(scenario, providerMode, query = '?getNew=true', options = {}) {
  const session = loginForVu(scenario)
  const headers = authorizationHeaders(session)
  const response = http.get(
    getBaseUrl() + RECOMMEND_ROUTE + query,
    requestOptions(RECOMMEND_ROUTE, scenario, 'authenticated', headers)
  )

  return classifyRecommendationResponse(response, {
    route: RECOMMEND_ROUTE,
    scenario,
    authState: 'authenticated',
    providerMode,
    expectedStatuses: options.expectedStatuses || [200],
    expectRateLimit: options.expectRateLimit === true,
  })
}
