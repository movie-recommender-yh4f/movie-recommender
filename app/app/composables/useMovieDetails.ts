import type { Movie } from '~/types/movie'
import { IMAGE_BASE } from '~/constants'
import { resolveAccessToken, useSupabase } from './useSupabase'

const TMDB_ERROR_MESSAGE = 'TMDB data is unavailable right now. Check NUXT_TMDB_API_KEY.'
const MOVIE_DETAILS_PATH_PREFIX = '/api/movies/'

export const useMovieDetails = () => {
  const movieCache = useState<Record<number, Movie>>('movie-details-cache', () => ({}))
  const supabase = useSupabase()

  const getMovieDetails = async (movieId: number): Promise<Movie> => {
    const cached = movieCache.value[movieId]
    if (cached) return cached

    const accessToken = await resolveAccessToken(supabase)

    try {
      const movie = await $fetch<Movie>(`${MOVIE_DETAILS_PATH_PREFIX}${movieId}`, {
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined,
      })
      movieCache.value[movieId] = movie
      return movie
    } catch {
      throw new Error(TMDB_ERROR_MESSAGE)
    }
  }

  return {
    IMAGE_BASE,
    getMovieDetails,
    movieCache,
  }
}
