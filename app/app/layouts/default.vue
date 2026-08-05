<template>
  <div :style="appShellStyle" class="w-full overflow-hidden bg-background text-on-background">
    <div class="flex h-full w-full flex-col overflow-hidden bg-surface">
      <TopHeader />
      <main class="flex-1 relative overflow-hidden">
        <div v-if="authLoading" class="flex h-full min-h-0 items-center justify-center px-4">
          <FilmReelLoader :label="SESSION_LOADING_LABEL" />
        </div>
        <slot v-else />
      </main>
      <BottomNav v-if="showBottomNav" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const ONBOARDING_ROUTE = '/onboarding'
const SESSION_LOADING_LABEL = 'Loading your session...'

const route = useRoute()
const { loading: authLoading } = useAuth()
const { appHeightCssValue } = useStableViewportHeight()

const showBottomNav = computed(() => route.path !== ONBOARDING_ROUTE)
const appShellStyle = computed(() => ({ height: appHeightCssValue }))
</script>
