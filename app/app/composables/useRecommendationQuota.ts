import { RECOMMENDATION_LIMIT } from '../constants'

export interface RecommendationQuota {
  limit: number
  remaining: number
  reset: number
}

function isRecommendationQuota(value: unknown): value is RecommendationQuota {
  if (!value || typeof value !== 'object') {
    return false
  }

  const quota = value as Record<string, unknown>

  return (
    typeof quota.limit === 'number' &&
    typeof quota.remaining === 'number' &&
    typeof quota.reset === 'number'
  )
}

export function useRecommendationQuota() {
  const supabase = useSupabase()
  const { completed } = useOnboarding()
  const quota = useState<RecommendationQuota>('recommendation-quota', () => ({
    limit: RECOMMENDATION_LIMIT,
    remaining: RECOMMENDATION_LIMIT,
    reset: 0,
  }))
  const pending = useState('recommendation-quota-pending', () => false)
  const error = useState<string | null>('recommendation-quota-error', () => null)

  async function fetchQuota() {
    pending.value = true
    error.value = null

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        quota.value = {
          limit: RECOMMENDATION_LIMIT,
          remaining: RECOMMENDATION_LIMIT,
          reset: 0,
        }
        return
      }

      if (completed.value !== true) {
        quota.value = {
          limit: RECOMMENDATION_LIMIT,
          remaining: RECOMMENDATION_LIMIT,
          reset: 0,
        }
        return
      }

      const response = await $fetch<unknown>('/api/recommend/quota', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })

      if (!isRecommendationQuota(response)) {
        throw new Error('Recommendation quota response was invalid.')
      }

      quota.value = response
    } catch (caughtError) {
      error.value = caughtError instanceof Error ? caughtError.message : 'Unable to load quota.'
    } finally {
      pending.value = false
    }
  }

  return {
    quota,
    pending,
    error,
    fetchQuota,
  }
}
