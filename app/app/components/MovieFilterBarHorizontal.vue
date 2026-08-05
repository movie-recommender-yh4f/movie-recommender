<template>
  <section>
    <div class="flex flex-col gap-3">
      <div class="hidden items-center gap-2 max-[449px]:flex">
        <button
          type="button"
          class="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition"
          :class="sortBy !== defaultSort ? mobileActionActiveClass : mobileActionInactiveClass"
          @click="isSortModalOpen = true"
        >
          <span>{{ sortLabels[sortBy] }}</span>
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M3 7h18M6 12h12m-9 5h6"
            />
          </svg>
        </button>

        <button
          type="button"
          class="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium transition"
          :class="hasFilterSelections ? mobileActionActiveClass : mobileActionInactiveClass"
          @click="isFilterMenuOpen = true"
        >
          <span>Filters</span>
          <span
            v-if="activeFilterCount > 0"
            class="rounded-full border border-primary/10 bg-primary/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-[0.18em]"
          >
            {{ activeFilterCount }}
          </span>
          <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M7 12h10m-7 6h4"
            />
          </svg>
        </button>
      </div>

      <div
        data-movie-filter-dropdown
        class="flex flex-col gap-2 max-[449px]:hidden lg:flex-row lg:items-center"
        :class="filterSurfaceClass"
      >
        <label v-if="showSearch" class="relative min-w-0 flex-1">
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
            :value="searchQuery"
            type="text"
            :placeholder="searchPlaceholder"
            class="h-12 w-full rounded-full bg-surface-container-high pl-11 pr-10 text-base text-on-surface outline-none transition placeholder:text-outline focus:ring-1 focus:ring-primary/30 sm:text-sm"
            @input="handleSearchInput"
          />
          <button
            v-if="searchQuery"
            type="button"
            class="absolute inset-y-0 right-3 flex items-center text-outline transition hover:text-on-surface"
            @click="$emit('update:searchQuery', '')"
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
        </label>

        <div v-if="showSearch" class="hidden h-8 w-px bg-outline-variant lg:block"></div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="relative" data-movie-filter-dropdown>
            <button
              type="button"
              class="inline-flex h-12 items-center gap-2 rounded-full border px-4 text-sm font-medium transition"
              :class="selectedGenres.length > 0 ? activeChipClass : inactiveChipClass"
              @click="toggleDropdown('genre')"
            >
              <span>Genre</span>
              <span
                v-if="selectedGenres.length > 0"
                class="rounded-full border border-primary/10 bg-primary/10 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-[0.18em]"
              >
                {{ selectedGenres.length }}
              </span>
              <svg
                class="h-3.5 w-3.5 transition-transform"
                :class="openDropdown === 'genre' ? 'rotate-180' : ''"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            <div
              v-if="openDropdown === 'genre'"
              class="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-64 rounded-[1.25rem] border border-outline-variant bg-surface-container-lowest p-3 shadow-glow"
            >
              <div class="max-h-64 space-y-1 overflow-y-auto pr-1">
                <button
                  v-for="genre in availableGenres"
                  :key="genre"
                  type="button"
                  class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition"
                  :class="selectedGenres.includes(genre) ? selectedRowClass : inactiveRowClass"
                  @click="$emit('toggleGenre', genre)"
                >
                  <span>{{ genre }}</span>
                  <svg
                    v-if="selectedGenres.includes(genre)"
                    class="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </button>
              </div>
              <p v-if="availableGenres.length === 0" class="px-2 py-3 text-sm text-outline">
                {{ genreEmptyLabel }}
              </p>
            </div>
          </div>

          <div v-if="showRuntime" class="relative" data-movie-filter-dropdown>
            <button
              type="button"
              class="inline-flex h-12 items-center gap-2 rounded-full border px-4 text-sm font-medium transition"
              :class="selectedRuntime ? activeChipClass : inactiveChipClass"
              @click="toggleDropdown('length')"
            >
              <span>{{ selectedRuntime?.label ?? lengthLabel }}</span>
              <svg
                class="h-3.5 w-3.5 transition-transform"
                :class="openDropdown === 'length' ? 'rotate-180' : ''"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            <div
              v-if="openDropdown === 'length'"
              class="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-56 rounded-[1.25rem] border border-outline-variant bg-surface-container-lowest p-2 shadow-glow"
            >
              <button
                type="button"
                class="w-full rounded-xl px-3 py-2 text-left text-sm transition"
                :class="!selectedRuntime ? selectedRowClass : inactiveRowClass"
                @click="selectRuntime(null)"
              >
                Any length
              </button>
              <button
                v-for="range in runtimeRanges"
                :key="range.label"
                type="button"
                class="w-full rounded-xl px-3 py-2 text-left text-sm transition"
                :class="
                  selectedRuntime?.label === range.label ? selectedRowClass : inactiveRowClass
                "
                @click="selectRuntime(range)"
              >
                {{ range.label }}
              </button>
            </div>
          </div>

          <div v-if="ratingOptions.length > 0" class="relative" data-movie-filter-dropdown>
            <button
              type="button"
              class="inline-flex h-12 items-center gap-2 rounded-full border px-4 text-sm font-medium transition"
              :class="minRating !== null ? activeChipClass : inactiveChipClass"
              @click="toggleDropdown('rating')"
            >
              <span>{{ minRatingLabel }}</span>
              <svg
                class="h-3.5 w-3.5 transition-transform"
                :class="openDropdown === 'rating' ? 'rotate-180' : ''"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            <div
              v-if="openDropdown === 'rating'"
              class="absolute left-0 top-[calc(100%+0.5rem)] z-30 w-56 rounded-[1.25rem] border border-outline-variant bg-surface-container-lowest p-2 shadow-glow"
            >
              <button
                type="button"
                class="w-full rounded-xl px-3 py-2 text-left text-sm transition"
                :class="minRating === null ? selectedRowClass : inactiveRowClass"
                @click="selectRating(null)"
              >
                Any rating
              </button>
              <button
                v-for="option in ratingOptions"
                :key="option.value"
                type="button"
                class="w-full rounded-xl px-3 py-2 text-left text-sm transition"
                :class="minRating === option.value ? selectedRowClass : inactiveRowClass"
                @click="selectRating(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>

          <div class="relative" data-movie-filter-dropdown>
            <button
              type="button"
              class="inline-flex h-12 items-center gap-2 rounded-full border px-4 text-sm font-medium transition"
              :class="sortBy !== defaultSort ? activeChipClass : inactiveChipClass"
              @click="toggleDropdown('sort')"
            >
              <span>{{ sortLabelPrefix }} {{ sortLabels[sortBy] }}</span>
              <svg
                class="h-3.5 w-3.5 transition-transform"
                :class="openDropdown === 'sort' ? 'rotate-180' : ''"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            <div
              v-if="openDropdown === 'sort'"
              class="absolute right-0 top-[calc(100%+0.5rem)] z-30 w-56 rounded-[1.25rem] border border-outline-variant bg-surface-container-lowest p-2 shadow-glow"
            >
              <button
                v-for="option in sortOptions"
                :key="option.value"
                type="button"
                class="w-full rounded-xl px-3 py-2 text-left text-sm transition"
                :class="sortBy === option.value ? selectedRowClass : inactiveRowClass"
                @click="selectSortOption(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="hasVisibleActiveFilters" class="flex items-center gap-2 overflow-x-auto px-1 pb-1">
        <button
          v-if="showSearch && searchQuery.trim()"
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-on-surface transition hover:border-primary/40"
          @click="$emit('update:searchQuery', '')"
        >
          <span>Search: {{ searchQuery.trim() }}</span>
          <svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <button
          v-for="genre in selectedGenres"
          :key="genre"
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-on-surface transition hover:border-primary/40"
          @click="$emit('toggleGenre', genre)"
        >
          <span>{{ genre }}</span>
          <svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <button
          v-if="showRuntime && selectedRuntime"
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-on-surface transition hover:border-primary/40"
          @click="selectRuntime(null)"
        >
          <span>{{ selectedRuntime.label }}</span>
          <svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <button
          v-if="minRating !== null"
          type="button"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-2.5 py-1 text-[0.65rem] font-medium uppercase tracking-[0.14em] text-on-surface transition hover:border-primary/40"
          @click="selectRating(null)"
        >
          <span>{{ minRatingLabel }}</span>
          <svg class="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <button
          type="button"
          class="inline-flex shrink-0 items-center self-center px-1 text-[0.62rem] uppercase tracking-[0.16em] text-outline transition hover:text-on-surface"
          @click="$emit('clearFilters')"
        >
          Clear all
        </button>
      </div>

      <div v-if="isLoadingMetadata" class="space-y-2 px-1">
        <div class="flex items-center gap-2 text-xs text-outline">
          <span
            class="h-3.5 w-3.5 animate-spin rounded-full border border-outline-variant border-t-primary"
          ></span>
          <span>
            Loading movie metadata for filters... {{ metadataProgress.loaded }}/{{
              metadataProgress.total
            }}
          </span>
        </div>
        <div class="h-1 overflow-hidden rounded-full bg-surface-container-high">
          <div
            class="h-full rounded-full bg-primary transition-[width] duration-300"
            :style="{ width: metadataWidth }"
          />
        </div>
      </div>
    </div>

    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200 ease-out"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-200 ease-in"
        leave-to-class="opacity-0"
      >
        <div
          v-if="isFilterMenuOpen"
          class="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-4"
          @click.self="isFilterMenuOpen = false"
        >
          <div class="flex max-h-[95dvh] w-full max-w-md flex-col overflow-hidden bg-transparent">
            <div class="overflow-y-auto">
              <MovieFilterBarSideMenu
                :selected-genres="selectedGenres"
                :selected-runtime="selectedRuntime"
                :sort-by="sortBy"
                :available-genres="availableGenres"
                :runtime-ranges="runtimeRanges"
                :show-runtime="showRuntime"
                :min-rating="minRating"
                :rating-options="ratingOptions"
                @update:selected-runtime="$emit('update:selectedRuntime', $event)"
                @update:sort-by="$emit('update:sortBy', $event)"
                @update:min-rating="$emit('update:minRating', $event)"
                @toggle-genre="$emit('toggleGenre', $event)"
                @clear-filters="$emit('clearFilters')"
                @close="isFilterMenuOpen = false"
              />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200 ease-out"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-200 ease-in"
        leave-to-class="opacity-0"
      >
        <div
          v-if="isSortModalOpen"
          class="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-4"
          @click.self="isSortModalOpen = false"
        >
          <div class="flex max-h-[95dvh] w-full max-w-sm flex-col overflow-hidden bg-transparent">
            <div class="flex items-center justify-between px-5 pb-2 pt-4">
              <p class="text-sm text-outline">{{ sortModalTitle }}</p>
              <button
                class="rounded-full p-1 text-outline transition hover:text-on-surface"
                @click="isSortModalOpen = false"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div
              class="space-y-2 rounded-[1.75rem] border border-outline-variant bg-surface-container-low px-4 pb-4 pt-4"
            >
              <button
                v-for="option in sortOptions"
                :key="`mobile-${option.value}`"
                type="button"
                class="w-full rounded-xl border px-4 py-3 text-left text-sm transition"
                :class="sortBy === option.value ? mobileSortActiveClass : mobileSortInactiveClass"
                @click="selectMobileSortOption(option.value)"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<script setup lang="ts">
import type { RuntimeRange, SortOption } from '~/composables/useFilters'
import { MY_LIST_SORT_LABELS } from '~/composables/useFilters'

const DEFAULT_SORT: SortOption = 'default'
const SEARCH_PLACEHOLDER = 'Search your watchlist...'
const LENGTH_LABEL = 'Length'
const SORT_LABEL_PREFIX = 'Sort:'
const SORT_MODAL_TITLE = 'Sort watchlist'
const EMPTY_GENRE_LABEL = 'No genres available yet'
const SURFACE_RADIUS_CLASS = 'rounded-[1.5rem]'
const ACTIVE_CHIP_CLASS =
  'border-primary/10 bg-primary text-on-primary shadow-sm'
const INACTIVE_CHIP_CLASS =
  'border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:border-primary/40 hover:text-on-surface'
const SELECTED_ROW_CLASS = 'border-outline-variant bg-surface-container-high text-on-surface'
const INACTIVE_ROW_CLASS = 'border-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
const MOBILE_ACTION_ACTIVE_CLASS =
  'border-primary/10 bg-surface-container-high text-on-surface shadow-glow'
const MOBILE_ACTION_INACTIVE_CLASS =
  'border-outline-variant bg-surface-container-low text-on-surface-variant shadow-sm hover:border-primary/40 hover:bg-surface-container-high hover:text-on-surface'
const MOBILE_SORT_ACTIVE_CLASS =
  'border-outline-variant bg-surface-container-high text-on-surface shadow-glow'
const MOBILE_SORT_INACTIVE_CLASS =
  'border-outline-variant bg-surface-container-low text-on-surface-variant shadow-sm hover:border-primary/40 hover:bg-surface-container-high hover:text-on-surface'
const MOBILE_BREAKPOINT_QUERY = '(max-width: 449px)'

interface RatingOption {
  label: string
  value: number
}

type DropdownName = 'genre' | 'length' | 'rating' | 'sort'

const props = withDefaults(
  defineProps<{
    searchQuery: string
    selectedGenres: string[]
    selectedRuntime: RuntimeRange | null
    sortBy: SortOption
    availableGenres: string[]
    runtimeRanges: RuntimeRange[]
    hasActiveFilters: boolean
    filteredCount: number
    totalCount: number
    isLoadingMetadata: boolean
    metadataProgress: {
      loaded: number
      total: number
    }
    showSearch?: boolean
    showRuntime?: boolean
    minRating?: number | null
    ratingOptions?: RatingOption[]
    embedded?: boolean
    searchPlaceholder?: string
    sortLabels?: Record<SortOption, string>
    sortLabelPrefix?: string
    sortModalTitle?: string
  }>(),
  {
    showSearch: true,
    showRuntime: true,
    minRating: null,
    ratingOptions: () => [],
    embedded: false,
    searchPlaceholder: SEARCH_PLACEHOLDER,
    sortLabels: () => MY_LIST_SORT_LABELS,
    sortLabelPrefix: SORT_LABEL_PREFIX,
    sortModalTitle: SORT_MODAL_TITLE,
  }
)

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  'update:selectedRuntime': [value: RuntimeRange | null]
  'update:sortBy': [value: SortOption]
  'update:minRating': [value: number | null]
  toggleGenre: [genre: string]
  clearFilters: []
}>()

const openDropdown = ref<DropdownName | null>(null)
const isFilterMenuOpen = ref(false)
const isSortModalOpen = ref(false)
let mobileMediaQuery: MediaQueryList | null = null
const defaultSort = DEFAULT_SORT
const lengthLabel = LENGTH_LABEL
const genreEmptyLabel = EMPTY_GENRE_LABEL
const surfaceRadiusClass = SURFACE_RADIUS_CLASS
const activeChipClass = ACTIVE_CHIP_CLASS
const inactiveChipClass = INACTIVE_CHIP_CLASS
const selectedRowClass = SELECTED_ROW_CLASS
const inactiveRowClass = INACTIVE_ROW_CLASS
const mobileActionActiveClass = MOBILE_ACTION_ACTIVE_CLASS
const mobileActionInactiveClass = MOBILE_ACTION_INACTIVE_CLASS
const mobileSortActiveClass = MOBILE_SORT_ACTIVE_CLASS
const mobileSortInactiveClass = MOBILE_SORT_INACTIVE_CLASS
const showSearch = computed(() => props.showSearch)
const showRuntime = computed(() => props.showRuntime)
const filterSurfaceClass = computed(() => {
  if (props.embedded) {
    return 'bg-transparent p-0'
  }

  return `border border-outline-variant bg-surface-container-low p-2.5 sm:p-2.5 ${surfaceRadiusClass}`
})

const sortOptions = computed(() => {
  return (Object.keys(props.sortLabels) as SortOption[]).map((value) => ({
    value,
    label: props.sortLabels[value],
  }))
})

const metadataWidth = computed(() => {
  if (props.metadataProgress.total === 0) {
    return '0%'
  }

  return `${(props.metadataProgress.loaded / props.metadataProgress.total) * 100}%`
})

const hasVisibleActiveFilters = computed(() => {
  return (
    (props.showSearch && props.searchQuery.trim() !== '') ||
    props.selectedGenres.length > 0 ||
    (props.showRuntime && props.selectedRuntime !== null) ||
    props.minRating !== null
  )
})

const hasFilterSelections = computed(() => {
  return (
    (props.showSearch && props.searchQuery.trim() !== '') ||
    props.selectedGenres.length > 0 ||
    (props.showRuntime && props.selectedRuntime !== null) ||
    props.minRating !== null
  )
})

const activeFilterCount = computed(() => {
  let count = 0

  if (props.showSearch && props.searchQuery.trim() !== '') {
    count++
  }

  count += props.selectedGenres.length

  if (props.showRuntime && props.selectedRuntime !== null) {
    count++
  }

  if (props.minRating !== null) {
    count++
  }

  return count
})

const minRatingLabel = computed(() => {
  const selectedOption = props.ratingOptions.find((option) => option.value === props.minRating)
  return selectedOption?.label ?? 'Rating'
})

const toggleDropdown = (name: DropdownName) => {
  openDropdown.value = openDropdown.value === name ? null : name
}

const handleSearchInput = (event: Event) => {
  const input = event.target

  if (!(input instanceof HTMLInputElement)) {
    return
  }

  emit('update:searchQuery', input.value)
}

const selectRuntime = (runtime: RuntimeRange | null) => {
  emit('update:selectedRuntime', runtime)
  openDropdown.value = null
}

const selectSortOption = (sortOption: SortOption) => {
  emit('update:sortBy', sortOption)
  openDropdown.value = null
}

const selectRating = (rating: number | null) => {
  emit('update:minRating', rating)
  openDropdown.value = null
}

const selectMobileSortOption = (sortOption: SortOption) => {
  emit('update:sortBy', sortOption)
  isSortModalOpen.value = false
}

const closeDropdowns = (event: MouseEvent) => {
  const target = event.target

  if (!(target instanceof HTMLElement)) {
    return
  }

  if (target.closest('[data-movie-filter-dropdown]')) {
    return
  }

  openDropdown.value = null
}

const closeDesktopOverlays = (event: MediaQueryListEvent) => {
  if (event.matches) {
    openDropdown.value = null
  }
}

onMounted(() => {
  document.addEventListener('click', closeDropdowns)
  mobileMediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY)
  mobileMediaQuery.addEventListener('change', closeDesktopOverlays)
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdowns)

  if (!mobileMediaQuery) {
    return
  }

  mobileMediaQuery.removeEventListener('change', closeDesktopOverlays)
  mobileMediaQuery = null
})
</script>
