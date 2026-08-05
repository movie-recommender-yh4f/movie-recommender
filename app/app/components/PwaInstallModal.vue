<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isInstallModalOpen"
        class="fixed inset-0 z-[210] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center"
        @click.self="dismissInstallModal"
      >
        <section
          aria-labelledby="pwa-install-title"
          aria-modal="true"
          role="dialog"
          class="mx-4 mb-4 w-[min(92vw,40rem)] overflow-hidden rounded-[2rem] border border-outline-variant bg-surface-container-low shadow-glow sm:mb-0"
        >
          <div class="border-b border-outline-variant bg-surface-container-high/80 px-6 py-4 sm:px-8">
            <p class="text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-on-surface-variant">
              App available
            </p>
            <h2
              id="pwa-install-title"
              class="mt-3 text-2xl font-bold tracking-[-0.03em] text-on-surface sm:text-[2rem]"
            >
              Install NextWatch on your phone.
            </h2>
          </div>

          <div class="space-y-6 px-6 py-6 sm:px-8 sm:py-8">
            <p class="max-w-2xl text-sm leading-7 text-on-surface-variant sm:text-base">
              Add NextWatch to your home screen for a full-screen app experience and quicker access
              to recommendations, watchlists, and watched history.
            </p>

            <div class="flex flex-col gap-3 sm:flex-row">
              <button
                class="btn-press flex h-12 w-full items-center justify-center rounded-xl bg-primary px-6 text-base font-semibold text-on-primary transition-colors hover:bg-primary/90"
                @click="install"
              >
                {{ installButtonLabel }}
              </button>

              <button
                class="btn-press flex h-12 w-full items-center justify-center rounded-xl border border-outline-variant bg-surface-container-lowest px-6 text-base font-semibold text-on-surface transition-colors hover:border-primary/40 hover:text-on-background"
                @click="dismissInstallModal"
              >
                Not now
              </button>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>

  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="isIosInstallModalOpen"
        class="fixed inset-0 z-[211] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
        @click.self="closeIosInstallModal"
      >
        <div
          class="flex w-full max-w-md flex-col gap-4 rounded-[1.25rem] border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-glow"
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="text-2xl font-black tracking-[-0.04em] text-zinc-950 dark:text-white">
                Install on iPhone
              </h3>
              <p class="mt-1 text-sm text-zinc-500">Add NextWatch to your Home Screen.</p>
            </div>
            <button
              class="text-zinc-500 transition-colors hover:text-zinc-950 dark:hover:text-white"
              @click="closeIosInstallModal"
            >
              <svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.75"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          <ol class="flex flex-col gap-3 text-sm text-zinc-700 dark:text-zinc-300">
            <li class="flex items-center gap-3">
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-black text-white dark:bg-white dark:text-black"
                >1</span
              >
              <span class="flex items-center gap-1.5">
                Tap the
                <svg
                  class="inline h-5 w-5 text-zinc-950 dark:text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.75"
                    d="M12 16V4m0 0L8 8m4-4l4 4M6 12v6a2 2 0 002 2h8a2 2 0 002-2v-6"
                  />
                </svg>
                Share button.
              </span>
            </li>
            <li class="flex items-center gap-3">
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-black text-white dark:bg-white dark:text-black"
                >2</span
              >
              <span>Scroll and tap <strong>Add to Home Screen</strong>.</span>
            </li>
            <li class="flex items-center gap-3">
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-950 text-xs font-black text-white dark:bg-white dark:text-black"
                >3</span
              >
              <span>Tap <strong>Add</strong> in the top corner.</span>
            </li>
          </ol>

          <button
            class="btn-press mt-2 flex h-12 w-full items-center justify-center rounded-full bg-zinc-950 px-6 py-3 font-bold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            @click="closeIosInstallModal"
          >
            Got it
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'

const IOS_INSTALL_BUTTON_LABEL = 'Show install steps'
const DEFAULT_INSTALL_BUTTON_LABEL = 'Install app'

const {
  isInstallModalOpen,
  isIos,
  isIosInstallModalOpen,
  maybeAutoOpenInstallModal,
  dismissInstallModal,
  closeIosInstallModal,
  install,
} = usePwaInstall()

const installButtonLabel = computed(() =>
  isIos.value ? IOS_INSTALL_BUTTON_LABEL : DEFAULT_INSTALL_BUTTON_LABEL
)

onMounted(() => {
  maybeAutoOpenInstallModal()
})
</script>
