<template>
  <StaticPageShell
    :eyebrow="eyebrow"
    :title="pageTitle"
    :description="pageDescription"
  >
    <section
      class="rounded-[1.75rem] border border-outline-variant bg-surface-container-low p-6 shadow-glow sm:p-8"
    >
      <div
        v-if="metadataItems.length > 0"
        class="mb-5 flex flex-wrap items-center gap-2.5 border-b border-outline-variant pb-4"
      >
        <div
          v-for="item in metadataItems"
          :key="item.label"
          class="rounded-full border border-outline-variant bg-surface-container-high px-4 py-2"
        >
          <span class="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-outline">
            {{ item.label }}
          </span>
          <span class="ml-2 text-sm font-medium text-on-surface">{{ item.value }}</span>
        </div>
      </div>

      <div
        class="max-w-[46rem] space-y-5 text-sm leading-7 text-on-surface sm:text-base [&_a]:font-semibold [&_a]:text-primary [&_a]:underline-offset-4 hover:[&_a]:underline [&_blockquote]:rounded-[1.25rem] [&_blockquote]:border-l-2 [&_blockquote]:border-primary/60 [&_blockquote]:bg-surface-container-high [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-on-surface [&_h1]:mt-0 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-[-0.04em] [&_h1]:text-on-background [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-[-0.03em] [&_h2]:text-on-background [&_h2]:first:mt-0 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:tracking-[-0.02em] [&_h3]:text-on-background [&_hr]:my-6 [&_hr]:border-outline-variant [&_li]:ml-1 [&_li]:pl-1 [&_li]:text-on-surface [&_li]:marker:text-primary [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-6 [&_p]:my-0 [&_p]:text-on-surface [&_strong]:text-on-background [&_ul]:my-4 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-6"
      >
        <MDCRenderer v-if="hasMarkdownBody && page" :body="page.body" :data="page.data" />

        <div
          v-else
          class="rounded-[1.25rem] border border-dashed border-outline-variant bg-surface-container-high px-5 py-8 text-center"
        >
          <p class="text-base font-semibold text-on-background">Content coming soon.</p>
          <p class="mt-2 text-sm text-on-surface-variant">
            Fill in this Markdown file whenever you are ready.
          </p>
        </div>
      </div>
    </section>
  </StaticPageShell>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import MDCRenderer from '@nuxtjs/mdc/runtime/components/MDCRenderer.vue'

import { LEGAL_PAGE_MARKDOWN } from '~/constants/legal'

interface Props {
  eyebrow: string
  fallbackTitle: string
  slug: string
}

interface MarkdownMetadataItem {
  label: string
  value: string
}

const props = defineProps<Props>()

const { data: page } = await useAsyncData(`legal-page:${props.slug}`, () =>
  parseMarkdown(LEGAL_PAGE_MARKDOWN[props.slug])
)

if (!page.value) {
  throw new Error(`Unable to load markdown page for slug "${props.slug}"`)
}

const hasMarkdownBody = computed(() => {
  const children = page.value.body?.children
  return Array.isArray(children) && children.length > 0
})

const pageTitle = computed(() => page.value?.data?.title ?? props.fallbackTitle)
const pageDescription = computed(() => page.value?.data?.description)
const metadataItems = computed<MarkdownMetadataItem[]>(() => {
  const lastUpdated = page.value?.data?.lastUpdated

  if (typeof lastUpdated !== 'string' || lastUpdated.length === 0) {
    return []
  }

  return [
    {
      label: 'Last Updated',
      value: lastUpdated,
    },
  ]
})
</script>
