<template>
  <div
    v-bind="containerProps"
    class="h-full min-h-0 overflow-y-auto bg-background px-4 pb-24 pt-6 text-on-background sm:px-6 lg:px-8"
  >
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-8">
      <section class="flex flex-col gap-6">
        <div
          class="flex flex-col gap-4 border-l-2 border-primary pl-4 lg:flex-row lg:items-end lg:justify-between"
        >
          <div class="space-y-2">
            <p class="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-primary">
              Step 1 of 1
            </p>
            <h1 class="text-3xl font-semibold uppercase tracking-[-0.04em] text-on-background">
              Pick At Least {{ ONBOARDING_MIN_SELECTIONS }} Movies
            </h1>
            <p class="max-w-2xl text-sm text-on-surface-variant">
              We use these picks to build your watched history and unlock your recommendation feed.
            </p>
          </div>

          <div class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div
              class="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-4 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-on-surface-variant"
            >
              <span class="h-2 w-2 rounded-full bg-primary"></span>
              {{ selectionLabel }}
            </div>
            <button
              type="button"
              class="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              :disabled="selectedMovieIds.length < ONBOARDING_MIN_SELECTIONS || isSubmitting"
              @click="submitOnboarding"
            >
              {{ isSubmitting ? 'Saving...' : 'Finish Onboarding' }}
            </button>
          </div>
        </div>

        <AlertMessage type="error" :message="submissionError" />

        <div
          class="rounded-[1.75rem] border border-outline-variant bg-surface-container-low p-2 shadow-glow"
        >
          <div class="relative">
            <span
              class="pointer-events-none absolute inset-y-0 left-4 flex items-center text-outline"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.75"
                  d="M21 21l-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </span>
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Find a movie..."
              class="h-12 w-full rounded-[1.35rem] bg-surface-container-high pl-11 pr-11 text-sm font-medium text-on-surface outline-none transition placeholder:text-outline focus:ring-1 focus:ring-primary/30"
              @input="handleInput"
            />
            <button
              v-if="searchQuery || searchResults.length > 0"
              type="button"
              class="absolute inset-y-0 right-4 flex items-center text-outline transition hover:text-on-surface"
              @click="clearSearch"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.75"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <MovieFilterBarHorizontal
            v-if="searchResults.length > 0"
            class="mt-2"
            :search-query="searchQuery"
            :selected-genres="selectedGenres"
            :selected-runtime="selectedRuntime"
            :sort-by="sortBy"
            :available-genres="availableGenres"
            :runtime-ranges="runtimeRanges"
            :has-active-filters="hasActiveFilters"
            :filtered-count="filteredResults.length"
            :total-count="searchResults.length"
            :is-loading-metadata="false"
            :metadata-progress="{ loaded: 0, total: 0 }"
            :show-search="false"
            :show-runtime="false"
            :min-rating="minRating"
            :rating-options="RATING_OPTIONS"
            :sort-labels="SEARCH_SORT_LABELS"
            :embedded="true"
            sort-modal-title="Sort onboarding picks"
            @update:selected-runtime="selectedRuntime = $event"
            @update:sort-by="sortBy = $event"
            @update:min-rating="minRating = $event"
            @toggle-genre="toggleGenre"
            @clear-filters="clearFilters"
          />
        </div>

        <div
          v-if="isSearching"
          class="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-2 md:grid-cols-3 md:gap-x-6 md:gap-y-10 lg:grid-cols-4 xl:grid-cols-5"
        >
          <SkeletonSearchCard v-for="item in SKELETON_CARD_COUNT" :key="item" />
        </div>

        <div
          v-else-if="searchResults.length === 0"
          class="rounded-[1.75rem] border border-dashed border-outline-variant bg-surface-container-low px-6 py-14 text-center shadow-glow"
        >
          <p class="text-2xl font-semibold text-on-background">
            No results for "{{ searchQuery }}"
          </p>
        </div>

        <div
          v-else-if="filteredResults.length === 0 && hasActiveFilters"
          class="rounded-[1.75rem] border border-dashed border-outline-variant bg-surface-container-low px-6 py-14 text-center shadow-glow"
        >
          <p class="text-2xl font-semibold text-on-background">No results match these filters</p>
          <button
            type="button"
            class="mt-8 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-on-primary transition-colors hover:bg-primary/90"
            @click="clearFilters"
          >
            Clear Filters
          </button>
        </div>

        <div v-else ref="gridMeasureRef" class="min-h-[24rem]">
          <div v-bind="wrapperProps">
            <div v-for="row in virtualRows" :key="row.data.key" :style="rowStyle">
              <OnboardingMovieCard
                v-for="movie in row.data.items"
                :key="movie.id"
                :movie="movie"
                :is-selected="selectedMovieIds.includes(movie.id)"
                @details="openDetails"
                @select="selectMovie"
                @deselect="deselectMovie"
              />
            </div>
          </div>
        </div>
      </section>
    </div>

    <MovieDetails
      :is-open="isModalOpen"
      :movie="selectedMovie"
      media-size="compact"
      :show-add-button="false"
      :show-my-list-button="false"
      @close="closeDetails"
    />
    <ScrollToTopButton :target="containerProps.ref" />
  </div>
</template>

<script setup lang="ts">
import type { Movie, SearchDisplayMovie, SearchMovie as ApiSearchMovie } from '~/types/movie'
import { SEARCH_SORT_LABELS, useFilters } from '~/composables/useFilters'
import { normalizeSearchMovie } from '~/utils/search-movie'
import { ONBOARDING_MIN_SELECTIONS, createOnboardingMockMovies } from '~/utils/onboarding-movies'
import { useOnboarding } from '~/composables/useOnboarding'
import { useVirtualGrid } from '~/composables/useVirtualGrid'

interface SearchMoviesResponse {
  results: ApiSearchMovie[]
}

interface RatingOption {
  label: string
  value: number
}

const SEARCH_DEBOUNCE_MS = 500
const SKELETON_CARD_COUNT = 6
const GRID_CARD_ASPECT_RATIO = 2 / 3
const GRID_CARD_BODY_HEIGHT = 112
const GRID_COLUMN_GAP = { compact: 16, regular: 24 }
const GRID_ROW_GAP = { compact: 32, regular: 40 }
const GRID_OVERSCAN = 12
const RATING_OPTIONS: RatingOption[] = [
  { label: '7+', value: 7 },
  { label: '8+', value: 8 },
  { label: '9+', value: 9 },
]

const { getMovieDetails } = useMovieDetails()
const { completeOnboarding, isOnboardingComplete } = useOnboarding()
const { syncWatchedMoviesFromSupabase } = useWatchedMovies()
const searchQuery = useState('onboarding-search-query', () => '')
const searchResults = useState<SearchDisplayMovie[]>('onboarding-search-results', () => [])
const selectedMovieIds = useState<number[]>('onboarding-selected-movie-ids', () => [])
const isSearching = ref(false)
const submissionError = ref('')
const isSubmitting = ref(false)
const isModalOpen = ref(false)
const selectedMovie = ref<Movie | null>(null)
const isLoadingDetails = ref(false)
let debounceTimeout: ReturnType<typeof setTimeout> | null = null
let activeSearchToken = 0

const {
  selectedGenres,
  selectedRuntime,
  sortBy,
  minRating,
  availableGenres,
  filteredMovies: filteredResults,
  hasActiveFilters,
  clearFilters,
  toggleGenre,
  runtimeRanges,
} = useFilters(searchResults, {
  searchQuery,
  enableRating: true,
  enableRuntime: false,
  includeSearchInActiveState: false,
  clearSearchOnReset: false,
})
const { virtualRows, containerProps, gridMeasureRef, rowStyle, wrapperProps } = useVirtualGrid(
  filteredResults,
  {
    getKey: (movie) => movie.id,
    cardAspectRatio: GRID_CARD_ASPECT_RATIO,
    cardBodyHeight: GRID_CARD_BODY_HEIGHT,
    columnGap: GRID_COLUMN_GAP,
    rowGap: GRID_ROW_GAP,
    overscan: GRID_OVERSCAN,
  }
)

const selectionLabel = computed(() => {
  return `${selectedMovieIds.value.length} of ${ONBOARDING_MIN_SELECTIONS} selected`
})

function loadMockMovies() {
  searchResults.value = createOnboardingMockMovies()
}

async function searchMovies(query: string) {
  const normalizedQuery = query.trim()
  const searchToken = ++activeSearchToken

  if (!normalizedQuery) {
    clearFilters()
    loadMockMovies()
    return
  }

  isSearching.value = true

  try {
    const data = await $fetch<SearchMoviesResponse>('/api/movies/search', {
      query: { q: normalizedQuery },
    })

    if (searchToken !== activeSearchToken) {
      return
    }

    searchResults.value = data.results.map(normalizeSearchMovie)
  } catch {
    if (searchToken === activeSearchToken) {
      searchResults.value = []
    }
  } finally {
    if (searchToken === activeSearchToken) {
      isSearching.value = false
    }
  }
}

function handleInput() {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout)
  }

  debounceTimeout = setTimeout(() => {
    void searchMovies(searchQuery.value)
  }, SEARCH_DEBOUNCE_MS)
}

function clearSearch() {
  if (debounceTimeout) {
    clearTimeout(debounceTimeout)
  }

  activeSearchToken++
  searchQuery.value = ''
  clearFilters()
  loadMockMovies()
}

function selectMovie(movie: SearchDisplayMovie) {
  if (selectedMovieIds.value.includes(movie.id)) {
    return
  }

  selectedMovieIds.value = [...selectedMovieIds.value, movie.id]
}

function deselectMovie(movie: SearchDisplayMovie) {
  selectedMovieIds.value = selectedMovieIds.value.filter((movieId) => movieId !== movie.id)
}

async function openDetails(movie: SearchDisplayMovie) {
  if (isLoadingDetails.value) {
    return
  }

  isLoadingDetails.value = true

  try {
    selectedMovie.value = await getMovieDetails(movie.id)
    isModalOpen.value = true
  } catch {
  } finally {
    isLoadingDetails.value = false
  }
}

function closeDetails() {
  isModalOpen.value = false
  selectedMovie.value = null
}

async function submitOnboarding() {
  if (selectedMovieIds.value.length < ONBOARDING_MIN_SELECTIONS || isSubmitting.value) {
    return
  }

  submissionError.value = ''
  isSubmitting.value = true

  try {
    const result = await completeOnboarding(selectedMovieIds.value)

    if (!result?.completed) {
      throw new Error('Unable to complete onboarding.')
    }

    await syncWatchedMoviesFromSupabase({ force: true })
    selectedMovieIds.value = []
    await navigateTo('/')
  } catch (caughtError) {
    submissionError.value =
      caughtError instanceof Error ? caughtError.message : 'Unable to complete onboarding.'
  } finally {
    isSubmitting.value = false
  }
}

onMounted(async () => {
  if (isOnboardingComplete.value) {
    await navigateTo('/')
    return
  }

  loadMockMovies()
})
</script>
