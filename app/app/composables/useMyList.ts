import type {
  MyListMovie,
  Movie,
  MoviePreview,
  MovieListMetadata,
  PendingMyListMovie,
  WatchedMovie,
} from '~/types/movie'
import { fetchMovieListMetadata } from '~/composables/useMovieListMetadata'

const PENDING_MY_LIST_STORAGE_KEY = 'movie-recommender-pending-my-list'
const MY_LIST_LOADED_STATE_KEY = 'my-list-loaded'

interface MyListSyncOptions {
  accessToken?: string
  force?: boolean
}

let myListSyncRequest: Promise<void> | null = null

const isPendingMyListMovie = (movie: unknown): movie is PendingMyListMovie => {
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

const hasMyListMovieDetails = (
  movie: Pick<MyListMovie, 'title' | 'year' | 'posterPath'> & {
    rating?: number | null
    genres?: string[]
    runtime?: number | null
  }
) =>
  movie.title.trim().length > 0 &&
  movie.year > 0 &&
  movie.posterPath.trim().length > 0 &&
  typeof movie.rating === 'number' &&
  Number.isFinite(movie.rating) &&
  movie.rating > 0 &&
  Array.isArray(movie.genres) &&
  movie.genres.length > 0 &&
  movie.runtime !== undefined

const toMyListMovie = (movie: MovieListMetadata): MyListMovie => ({
  tmdbId: movie.tmdbId,
  title: movie.title,
  year: movie.year,
  posterPath: movie.posterPath,
  rating: movie.rating,
  genres: movie.genres,
  runtime: movie.runtime,
})

const mergeMyListMetadata = (currentMovies: MyListMovie[], metadata: MovieListMetadata[]) => {
  const currentById = new Map(currentMovies.map((movie) => [movie.tmdbId, movie]))

  return metadata.map((movie) => {
    const currentMovie = currentById.get(movie.tmdbId)

    if (!currentMovie) {
      return toMyListMovie(movie)
    }

    return {
      ...currentMovie,
      ...toMyListMovie(movie),
    }
  })
}

export const useMyList = () => {
  const supabase = useSupabase()

  const myList = useState<MyListMovie[]>('my-list', () => [])
  const watchedMovies = useState<WatchedMovie[]>('watched', () => [])
  const pendingMyListMovies = useState<PendingMyListMovie[]>('pending-my-list', () => [])
  const hasLoadedMyList = useState<boolean>(MY_LIST_LOADED_STATE_KEY, () => false)

  const { load: loadPendingMyListFromStorage, persist: persistPendingMyListToStorage } =
    usePendingStorage(PENDING_MY_LIST_STORAGE_KEY, pendingMyListMovies, isPendingMyListMovie)

  const normalizeSyncOptions = (options?: string | MyListSyncOptions): MyListSyncOptions => {
    if (typeof options === 'string') {
      return { accessToken: options }
    }

    return options ?? {}
  }

  const clearMyList = () => {
    myList.value = []
    hasLoadedMyList.value = false
    myListSyncRequest = null
  }

  const syncMyListFromSupabase = async (options?: string | MyListSyncOptions) => {
    const { accessToken, force = false } = normalizeSyncOptions(options)

    if (!force && hasLoadedMyList.value) {
      return
    }

    if (myListSyncRequest) {
      return myListSyncRequest
    }

    myListSyncRequest = (async () => {
      try {
        const token = await resolveAccessToken(supabase, accessToken)

        if (!token) {
          clearMyList()
          return
        }

        const response = await $fetch<{ success: boolean; tmdbIds: number[] }>('/api/mylist', {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        const metadata = await fetchMovieListMetadata(token, response.tmdbIds)
        myList.value = mergeMyListMetadata(myList.value, metadata)
        hasLoadedMyList.value = true
      } catch {}
      finally {
        myListSyncRequest = null
      }
    })()

    return myListSyncRequest
  }

  const addToMyList = async (
    movie: Pick<MoviePreview, 'id' | 'title' | 'year' | 'poster'> & {
      rating?: number | null
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
        !hasMyListMovieDetails({
          title: movie.title,
          year: movie.year,
          posterPath: path,
          rating: movie.rating,
          genres: movie.genres,
          runtime: movie.runtime,
        })
      ) {
        try {
          const { getMovieDetails } = useMovieDetails()
          details = await getMovieDetails(movie.id)
        } catch {}
      }

      const alreadyInState = myList.value.some((m) => m.tmdbId === movie.id)
      if (!alreadyInState) {
        const entry: MyListMovie = {
          tmdbId: movie.id,
          title: details?.title ?? movie.title,
          year: details?.year ?? movie.year,
          posterPath: details ? posterPath(details.poster) : path,
        }
        if (details) entry.rating = details.rating
        if (!details && typeof movie.rating === 'number') entry.rating = movie.rating
        if (details?.genres.length) entry.genres = details.genres
        if (details) entry.runtime = details.runtime
        if (!details && movie.genres?.length) entry.genres = movie.genres
        if (!details && typeof movie.runtime === 'number') entry.runtime = movie.runtime
        myList.value.push(entry)
      }

      try {
        await $fetch('/api/mylist', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: {
            tmdbId: movie.id,
          },
        })
      } catch {
        if (!alreadyInState) {
          myList.value = myList.value.filter((m) => m.tmdbId !== movie.id)
        }
        return 'error'
      }
    } catch {
      return 'error'
    }

    return 'ok'
  }

  const removeFromMyList = async (tmdbId: number): Promise<'ok' | 'unauthorized' | 'error'> => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session?.access_token) {
        return 'unauthorized'
      }

      myList.value = myList.value.filter((m) => m.tmdbId !== tmdbId)

      await $fetch('/api/mylist', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: { tmdbId },
      })
    } catch {
      await syncMyListFromSupabase({ force: true })
      return 'error'
    }

    return 'ok'
  }

  const queuePendingMyListMovie = (
    movie: Pick<MoviePreview, 'id' | 'title' | 'year' | 'poster'> & {
      rating?: number | null
      genres?: string[]
      runtime?: number | null
    }
  ) => {
    if (pendingMyListMovies.value.some((pendingMovie) => pendingMovie.id === movie.id)) {
      return
    }

    const entry: PendingMyListMovie = {
      id: movie.id,
      title: movie.title,
      year: movie.year,
      posterPath: posterPath(movie.poster),
    }
    if (typeof movie.rating === 'number') entry.rating = movie.rating
    if (movie.genres?.length) entry.genres = movie.genres
    if (typeof movie.runtime === 'number') entry.runtime = movie.runtime

    pendingMyListMovies.value.push(entry)

    persistPendingMyListToStorage()
  }

  const removePendingMyListMovie = (movieId: number) => {
    pendingMyListMovies.value = pendingMyListMovies.value.filter((movie) => movie.id !== movieId)
    persistPendingMyListToStorage()
  }

  const processPendingMyListMovies = async (accessToken?: string): Promise<number> => {
    if (pendingMyListMovies.value.length === 0) {
      loadPendingMyListFromStorage()
    }

    if (pendingMyListMovies.value.length === 0) {
      return 0
    }

    try {
      const token = await resolveAccessToken(supabase, accessToken)

      if (!token) {
        return 0
      }

      let processedCount = 0
      const queueSnapshot = [...pendingMyListMovies.value]

      for (const movie of queueSnapshot) {
        const isAlreadyInMyList = myList.value.some((listMovie) => listMovie.tmdbId === movie.id)
        const isAlreadyWatched = watchedMovies.value.some(
          (watchedMovie) => watchedMovie.tmdbId === movie.id
        )

        if (isAlreadyInMyList || isAlreadyWatched) {
          removePendingMyListMovie(movie.id)
          processedCount++
          continue
        }

        try {
          await $fetch('/api/mylist', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: {
              tmdbId: movie.id,
            },
          })

          if (!myList.value.some((listMovie) => listMovie.tmdbId === movie.id)) {
            const entry: MyListMovie = {
              tmdbId: movie.id,
              title: movie.title,
              year: movie.year,
              posterPath: movie.posterPath,
            }
            if (typeof movie.rating === 'number') entry.rating = movie.rating
            if (movie.genres?.length) entry.genres = movie.genres
            if (typeof movie.runtime === 'number') entry.runtime = movie.runtime
            myList.value.push(entry)
          }

          removePendingMyListMovie(movie.id)
          processedCount++
        } catch {}
      }

      return processedCount
    } catch {
      return 0
    }
  }

  return {
    myList,
    pendingMyListMovies,
    addToMyList,
    removeFromMyList,
    queuePendingMyListMovie,
    removePendingMyListMovie,
    processPendingMyListMovies,
    syncMyListFromSupabase,
    clearMyList,
  }
}
