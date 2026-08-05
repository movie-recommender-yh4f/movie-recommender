<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="shouldShowUpdateNotice"
        class="fixed inset-0 z-[220] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
      >
        <section
          aria-labelledby="pwa-update-title"
          aria-modal="true"
          role="dialog"
          class="mx-4 mb-4 w-[min(92vw,40rem)] overflow-hidden rounded-[2rem] border border-outline-variant bg-surface-container-low shadow-glow sm:mb-0"
        >
          <div class="border-b border-outline-variant bg-surface-container-high/80 px-6 py-4 sm:px-8">
            <p class="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-on-surface-variant">
              App update available
            </p>
            <h2
              id="pwa-update-title"
              class="mt-3 text-2xl font-bold tracking-[-0.03em] text-on-surface sm:text-[2rem]"
            >
              A new version of NextWatch is ready.
            </h2>
          </div>

          <div class="space-y-6 px-6 py-6 sm:px-8 sm:py-8">
            <p class="max-w-2xl text-sm leading-7 text-on-surface-variant sm:text-base">
              Update now to continue with the latest version of the app. This installed app stays
              on this screen until you refresh into the new release.
            </p>

            <button
              class="btn-press flex h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-base font-semibold text-on-primary transition-colors hover:bg-primary/90 disabled:cursor-wait disabled:opacity-70"
              :disabled="isApplyingUpdate"
              @click="applyUpdate"
            >
              {{ isApplyingUpdate ? 'Updating...' : 'Update app' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
const { applyUpdate, isApplyingUpdate, shouldShowUpdateNotice } = usePwaUpdate()
</script>
