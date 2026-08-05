<template>
  <div
    class="h-full min-h-0 overflow-y-auto bg-background px-4 pb-24 pt-6 text-on-background sm:px-6 lg:px-8"
  >
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-6 sm:gap-7">
      <section class="flex flex-col gap-4 border-l-2 border-primary pl-4">
        <p
          v-if="eyebrow"
          class="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-primary"
        >
          {{ eyebrow }}
        </p>
        <div class="space-y-2.5">
          <h1
            class="text-3xl font-semibold uppercase tracking-[-0.04em] text-on-background sm:text-3xl"
          >
            {{ title }}
          </h1>
          <p
            v-if="description"
            class="max-w-3xl text-sm leading-7 text-on-surface-variant sm:text-base"
          >
            {{ description }}
          </p>
        </div>
      </section>

      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  description?: string
  eyebrow?: string
  title: string
}

defineProps<Props>()
</script>
