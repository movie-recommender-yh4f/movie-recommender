const SESSION_RECOMMENDATION_STORAGE_KEY = 'movie-recommender-session-recommended-tmdb-ids'
const SESSION_RECOMMENDATION_STATE_KEY = 'recommendation-session-recommended-tmdb-ids'
const MIN_RECOMMENDATION_TMDB_ID = 1
const QUERY_ID_DELIMITER = ','

interface RecommendationLike {
  tmdbId: number | null
}

function canUseSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined'
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_RECOMMENDATION_TMDB_ID
}

function normalizeRecommendationIds(ids: number[]): number[] {
  const seenIds = new Set<number>()
  const normalizedIds: number[] = []

  for (const id of ids) {
    if (seenIds.has(id)) {
      continue
    }

    seenIds.add(id)
    normalizedIds.push(id)
  }

  return normalizedIds
}

function readSessionRecommendedTmdbIds(): number[] {
  if (!canUseSessionStorage()) {
    return []
  }

  try {
    const raw = window.sessionStorage.getItem(SESSION_RECOMMENDATION_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return normalizeRecommendationIds(parsed.filter(isPositiveInteger))
  } catch {
    return []
  }
}

function writeSessionRecommendedTmdbIds(ids: number[]): void {
  if (!canUseSessionStorage()) {
    return
  }

  try {
    if (ids.length === 0) {
      window.sessionStorage.removeItem(SESSION_RECOMMENDATION_STORAGE_KEY)
      return
    }

    window.sessionStorage.setItem(SESSION_RECOMMENDATION_STORAGE_KEY, JSON.stringify(ids))
  } catch {}
}

export function useRecommendationSession() {
  const sessionRecommendedTmdbIds = useState<number[]>(
    SESSION_RECOMMENDATION_STATE_KEY,
    () => []
  )

  const hydrateSessionRecommendations = (): void => {
    sessionRecommendedTmdbIds.value = readSessionRecommendedTmdbIds()
  }

  const persistSessionRecommendations = (): void => {
    writeSessionRecommendedTmdbIds(sessionRecommendedTmdbIds.value)
  }

  const clearSessionRecommendations = (): void => {
    sessionRecommendedTmdbIds.value = []
    persistSessionRecommendations()
  }

  const rememberSessionRecommendations = (recommendations: RecommendationLike[]): number[] => {
    const nextIds = recommendations.flatMap((recommendation) =>
      isPositiveInteger(recommendation.tmdbId) ? [recommendation.tmdbId] : []
    )

    if (nextIds.length === 0) {
      return sessionRecommendedTmdbIds.value
    }

    sessionRecommendedTmdbIds.value = normalizeRecommendationIds([
      ...sessionRecommendedTmdbIds.value,
      ...nextIds,
    ])
    persistSessionRecommendations()

    return sessionRecommendedTmdbIds.value
  }

  const buildSessionRecommendationQueryValue = (): string =>
    sessionRecommendedTmdbIds.value.join(QUERY_ID_DELIMITER)

  if (canUseSessionStorage()) {
    hydrateSessionRecommendations()
  }

  return {
    buildSessionRecommendationQueryValue,
    clearSessionRecommendations,
    hydrateSessionRecommendations,
    persistSessionRecommendations,
    rememberSessionRecommendations,
    sessionRecommendedTmdbIds,
  }
}
