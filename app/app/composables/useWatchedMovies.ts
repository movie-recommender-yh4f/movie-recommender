import type {
  WatchedMovie,
  PendingWatchedMovie,
  MoviePreview,
  Movie,
  MovieListMetadata,
} from '~/types/movie'
import { fetchMovieListMetadata } from '~/composables/useMovieListMetadata'

const PENDING_WATCHED_STORAGE_KEY = 'movie-recommender-pending-watched'
const WATCHED_MOVIES_LOADED_STATE_KEY = 'watched-loaded'

interface WatchedSyncOptions {
  accessToken?: string
  force?: boolean
}

// to avoid multiple simultaneous requests to sync watched movies from Supabase
let watchedMoviesSyncRequest: Promise<void> | null = null

const isPendingWatchedMovie = (movie: unknown): movie is PendingWatchedMovie => {
  if (!movie || typeof movie !== 'object') {
    return false
  }

  const pendingMovie = movie as Record<string, unknown>

  return (
    typeof pendingMovie.id === 'number' &&
    typeof pendingMovie.title === 'string' &&
    typeof pendingMovie.year === 'number' &&
    typeof pendingMovie.posterPath === 'string'
  )
}

const hasWatchedMovieDetails = (
  movie: Pick<WatchedMovie, 'title' | 'year' | 'posterPath'> & {
    genres?: string[]
    runtime?: number | null
  }
) =>
  movie.title.trim().length > 0 &&
  movie.year > 0 &&
  movie.posterPath.trim().length > 0 &&
  Array.isArray(movie.genres) &&
  movie.genres.length > 0 &&
  movie.runtime !== undefined

const toWatchedMovie = (movie: MovieListMetadata): WatchedMovie => ({
  tmdbId: movie.tmdbId,
  title: movie.title,
  year: movie.year,
  posterPath: movie.posterPath,
  genres: movie.genres,
  runtime: movie.runtime,
})

const mergeWatchedMetadata = (currentMovies: WatchedMovie[], metadata: MovieListMetadata[]) => {
  const currentById = new Map(currentMovies.map((movie) => [movie.tmdbId, movie]))

  return metadata.map((movie) => {
    const currentMovie = currentById.get(movie.tmdbId)

    if (!currentMovie) {
      return toWatchedMovie(movie)
    }

    return {
      ...currentMovie,
      ...toWatchedMovie(movie),
    }
  })
}

export const useWatchedMovies = () => {
  const supabase = useSupabase()
  const { myList, removeFromMyList, removePendingMyListMovie } = useMyList()

  const watchedMovies = useState<WatchedMovie[]>('watched', () => [])
  const pendingWatchedMovies = useState<PendingWatchedMovie[]>('pending-watched', () => [])
  const hasLoadedWatchedMovies = useState<boolean>(WATCHED_MOVIES_LOADED_STATE_KEY, () => false)

  const { load: loadPendingWatchedFromStorage, persist: persistPendingWatchedToStorage } =
    usePendingStorage(PENDING_WATCHED_STORAGE_KEY, pendingWatchedMovies, isPendingWatchedMovie)

  const normalizeSyncOptions = (options?: string | WatchedSyncOptions): WatchedSyncOptions => {
    if (typeof options === 'string') {
      return { accessToken: options }
    }

    return options ?? {}
  }

  const clearWatchedMovies = () => {
    watchedMovies.value = []
    hasLoadedWatchedMovies.value = false
    watchedMoviesSyncRequest = null
  }

  const syncWatchedMoviesFromSupabase = async (options?: string | WatchedSyncOptions) => {
    const { accessToken, force = false } = normalizeSyncOptions(options)

    if (!force && hasLoadedWatchedMovies.value) {
      return
    }

    if (watchedMoviesSyncRequest) {
      return watchedMoviesSyncRequest
    }

    watchedMoviesSyncRequest = (async () => {
      try {
        const token = await resolveAccessToken(supabase, accessToken)

        if (!token) {
          clearWatchedMovies()
          return
        }

        const response = await $fetch<{ success: boolean; tmdbIds: number[] }>('/api/watched', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        const metadata = await fetchMovieListMetadata(token, response.tmdbIds)
        watchedMovies.value = mergeWatchedMetadata(watchedMovies.value, metadata)
        hasLoadedWatchedMovies.value = true
      } catch {
      } finally {
        watchedMoviesSyncRequest = null
      }
    })()

    return watchedMoviesSyncRequest
  }

  const syncMyListAfterWatchingMovie = async (movieId: number) => {
    removePendingMyListMovie(movieId)

    if (!myList.value.some((movie) => movie.tmdbId === movieId)) {
      return
    }

    try {
      await removeFromMyList(movieId)
    } catch {}
  }

  const markAsWatched = async (
    movie: Pick<MoviePreview, 'id' | 'title' | 'year' | 'poster'> & {
      genres?: string[]
      runtime?: number | null
    }
  ): Promise<'ok' | 'unauthorized' | 'error'> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        return 'unauthorized'
      }

      const path = posterPath(movie.poster)
      let details: Movie | null = null

      if (
        !hasWatchedMovieDetails({
          title: movie.title,
          year: movie.year,
          posterPath: path,
          genres: movie.genres,
          runtime: movie.runtime,
        })
      ) {
        try {
          const { getMovieDetails } = useMovieDetails()
          details = await getMovieDetails(movie.id)
        } catch {}
      }

      const alreadyInState = watchedMovies.value.some((s) => s.tmdbId === movie.id)
      if (!alreadyInState) {
        const entry: WatchedMovie = {
          tmdbId: movie.id,
          title: details?.title ?? movie.title,
          year: details?.year ?? movie.year,
          posterPath: details ? posterPath(details.poster) : path,
        }
        if (details?.genres.length) entry.genres = details.genres
        if (details) entry.runtime = details.runtime
        if (!details && movie.genres?.length) entry.genres = movie.genres
        if (!details && typeof movie.runtime === 'number') entry.runtime = movie.runtime
        watchedMovies.value.push(entry)
      }

      try {
        await $fetch('/api/watched', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: { tmdbId: movie.id },
        })
      } catch {
        if (!alreadyInState) {
          watchedMovies.value = watchedMovies.value.filter((m) => m.tmdbId !== movie.id)
        }
        return 'error'
      }

      await syncMyListAfterWatchingMovie(movie.id)
    } catch {
      return 'error'
    }

    return 'ok'
  }

  const removeFromWatched = async (tmdbId: number): Promise<'ok' | 'unauthorized' | 'error'> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        return 'unauthorized'
      }

      watchedMovies.value = watchedMovies.value.filter((m) => m.tmdbId !== tmdbId)

      await $fetch('/api/watched', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { tmdbId },
      })
    } catch {
      await syncWatchedMoviesFromSupabase({ force: true })
      return 'error'
    }

    return 'ok'
  }

  const queuePendingWatchedMovie = (
    movie: Pick<MoviePreview, 'id' | 'title' | 'year' | 'poster'>
  ) => {
    removePendingMyListMovie(movie.id)

    if (pendingWatchedMovies.value.some((pendingMovie) => pendingMovie.id === movie.id)) {
      return
    }

    pendingWatchedMovies.value.push({
      id: movie.id,
      title: movie.title,
      year: movie.year,
      posterPath: posterPath(movie.poster),
    })

    persistPendingWatchedToStorage()
  }

  const removePendingWatchedMovie = (movieId: number) => {
    pendingWatchedMovies.value = pendingWatchedMovies.value.filter((m) => m.id !== movieId)
    persistPendingWatchedToStorage()
  }

  const processPendingWatchedMovies = async (accessToken?: string): Promise<number> => {
    if (pendingWatchedMovies.value.length === 0) {
      loadPendingWatchedFromStorage()
    }

    if (pendingWatchedMovies.value.length === 0) {
      return 0
    }

    try {
      const token = await resolveAccessToken(supabase, accessToken)

      if (!token) {
        return 0
      }

      let processedCount = 0
      const queueSnapshot = [...pendingWatchedMovies.value]

      for (const movie of queueSnapshot) {
        if (watchedMovies.value.some((s) => s.tmdbId === movie.id)) {
          await syncMyListAfterWatchingMovie(movie.id)
          removePendingWatchedMovie(movie.id)
          processedCount++
          continue
        }

        try {
          await $fetch('/api/watched', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: {
              tmdbId: movie.id,
            },
          })

          if (!watchedMovies.value.some((s) => s.tmdbId === movie.id)) {
            watchedMovies.value.push({
              tmdbId: movie.id,
              title: movie.title,
              year: movie.year,
              posterPath: movie.posterPath,
            })
          }

          await syncMyListAfterWatchingMovie(movie.id)
          removePendingWatchedMovie(movie.id)
          processedCount++
        } catch {}
      }

      return processedCount
    } catch {
      return 0
    }
  }

  return {
    watchedMovies,
    pendingWatchedMovies,
    markAsWatched,
    removeFromWatched,
    queuePendingWatchedMovie,
    removePendingWatchedMovie,
    processPendingWatchedMovies,
    syncWatchedMoviesFromSupabase,
    clearWatchedMovies,
  }
}
