import { computed, ref } from 'vue'

export function useInitialPageLoad() {
  const isInitialLoadPending = ref(true)

  const runInitialLoad = async (loader: () => Promise<void>) => {
    try {
      await loader()
    } finally {
      isInitialLoadPending.value = false
    }
  }

  return {
    isInitialLoadPending: computed(() => isInitialLoadPending.value),
    runInitialLoad,
  }
}
