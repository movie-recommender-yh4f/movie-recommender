<template>
  <StaticPageShell
    eyebrow="About NextWatch"
    title="Built by movie fans, for movie fans"
    description="NextWatch is an open-source project built for Youth Hacking 4 Freedom 2026. It combines your watch history, ratings, and AI-powered recommendations to help you spend less time searching and more time watching."
  >
    <p class="max-w-3xl text-sm italic leading-7 text-on-surface-variant sm:text-base">
      Built by two students who wanted a movie recommendation app they'd actually enjoy using.
    </p>
    <section class="grid gap-4 md:grid-cols-2">
      <article
        class="rounded-[1.75rem] border border-outline-variant bg-surface-container-low p-6 shadow-glow"
      >
        <p class="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-primary">
          What NextWatch Is
        </p>
        <h2 class="mt-3 text-2xl font-semibold tracking-[-0.03em] text-on-background">
          Built to solve a simple problem
        </h2>
        <p class="mt-4 text-sm leading-7 text-on-surface sm:text-base">
          We wanted an easier way to keep track of the movies we watched and discover new ones we'd
          actually enjoy. NextWatch started as a competition project and grew into an open-source
          app focused on fast, personal movie discovery.
        </p>
      </article>

      <article
        class="rounded-[1.75rem] border border-outline-variant bg-surface-container-low p-6 shadow-glow"
      >
        <p class="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-primary">
          Open Source
        </p>
        <h2 class="mt-3 text-2xl font-semibold tracking-[-0.03em] text-on-background">
          Built by students, open to everyone
        </h2>
        <p class="mt-4 text-sm leading-7 text-on-surface sm:text-base">
          We wanted an easier way to keep track of the movies we watched and discover new ones we'd
          actually enjoy. NextWatch was built for Youth Hacking 4 Freedom 2026 to make movie
          discovery simpler, faster, and more personal.
        </p>
      </article>
    </section>

    <section
      class="rounded-[1.75rem] border border-outline-variant bg-surface-container-low p-6 shadow-glow sm:p-8"
    >
      <p class="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-primary">Features</p>
      <h2 class="mt-3 text-2xl font-semibold tracking-[-0.03em] text-on-background">
        What the app already does
      </h2>

      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <div
          v-for="feature in ABOUT_FEATURES"
          :key="feature.title"
          class="rounded-[1.25rem] border border-outline-variant bg-surface-container-high px-5 py-5"
        >
          <h3 class="text-base font-semibold text-on-background">{{ feature.title }}</h3>
          <p class="mt-2 text-sm leading-7 text-on-surface-variant">
            {{ feature.description }}
          </p>
        </div>
      </div>
    </section>

    <section
      class="rounded-[1.75rem] border border-primary/30 bg-surface-container-low p-6 shadow-glow sm:p-8"
    >
      <div
        class="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-high px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-on-surface-variant"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
        TMDB Attribution
      </div>

      <p class="mt-5 text-xl font-semibold tracking-[-0.03em] text-on-background">
        {{ TMDB_ATTRIBUTION_STATEMENT }}
      </p>
      <p class="mt-4 max-w-3xl text-sm leading-7 text-on-surface sm:text-base">
        Movie metadata, posters, backdrops, trailers, cast, crew, and related movie information
        shown in NextWatch may be provided by TMDB.
      </p>

      <div class="mt-6">
        <NuxtLink
          :to="TMDB_ROUTE"
          class="inline-flex items-center justify-center rounded-full border border-outline-variant px-4 py-2 text-sm font-semibold text-on-surface transition-colors hover:border-primary/40 hover:text-on-background"
        >
          Read the TMDB data source page
        </NuxtLink>
      </div>
    </section>

    <section class="grid gap-4 md:grid-cols-2">
      <article
        class="rounded-[1.75rem] border border-outline-variant bg-surface-container-low p-6 shadow-glow"
      >
        <p class="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-primary">Privacy</p>
        <h2 class="mt-3 text-2xl font-semibold tracking-[-0.03em] text-on-background">
          How we handle your data
        </h2>
        <p class="mt-4 text-sm leading-7 text-on-surface sm:text-base">
          NextWatch uses your account, watch history, saved movies, ratings, and preferences only to
          provide the app features and improve your recommendations.
        </p>
        <NuxtLink
          :to="PRIVACY_ROUTE"
          class="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-on-primary transition-colors hover:bg-primary/90"
        >
          Read Privacy Policy
        </NuxtLink>
      </article>

      <article
        class="rounded-[1.75rem] border border-outline-variant bg-surface-container-low p-6 shadow-glow"
      >
        <p class="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-primary">Terms</p>
        <h2 class="mt-3 text-2xl font-semibold tracking-[-0.03em] text-on-background">
          Rules for using NextWatch
        </h2>
        <p class="mt-4 text-sm leading-7 text-on-surface sm:text-base">
          The Terms explain what you can expect from NextWatch, what is allowed when using the app,
          and how third-party services and movie data are handled.
        </p>
        <NuxtLink
          :to="TERMS_ROUTE"
          class="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-on-primary transition-colors hover:bg-primary/90"
        >
          Read Terms of Service
        </NuxtLink>
      </article>
    </section>

    <section
      class="rounded-[1.75rem] border border-outline-variant bg-surface-container-low p-6 shadow-glow sm:p-8"
    >
      <p class="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-primary">
        Technologies Used
      </p>

      <div class="mt-6 grid gap-4 md:grid-cols-2">
        <div
          v-for="technology in ABOUT_TECHNOLOGIES"
          :key="technology.name"
          class="rounded-[1.25rem] border border-outline-variant bg-surface-container-high px-5 py-5"
        >
          <h3 class="text-base font-semibold text-on-background">{{ technology.name }}</h3>
          <p class="mt-2 text-sm leading-7 text-on-surface-variant">
            {{ technology.detail }}
          </p>
        </div>
      </div>
    </section>

    <section
      class="rounded-[1.75rem] border border-outline-variant bg-surface-container-low p-2 shadow-glow"
    >
      <div class="px-4 pb-2 pt-4">
        <p class="text-[0.7rem] font-semibold uppercase tracking-[0.26em] text-primary">
          Contact & GitHub
        </p>
      </div>

      <div
        v-for="link in ABOUT_ACTION_LINKS"
        :key="link.href"
        class="border-t border-outline-variant first:border-t-0"
      >
        <NuxtLink
          :to="link.href"
          :target="link.isExternal ? '_blank' : undefined"
          :rel="link.isExternal ? 'noreferrer' : undefined"
          class="group flex min-h-16 items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-surface-container-high"
        >
          <span class="min-w-0">
            <span class="block font-semibold text-on-background">{{ link.label }}</span>
            <span class="mt-1 block text-sm leading-6 text-on-surface-variant">
              {{ link.supportingText }}
            </span>
          </span>
          <span class="shrink-0 text-outline transition-colors group-hover:text-on-surface">
            &rarr;
          </span>
        </NuxtLink>
      </div>
    </section>
  </StaticPageShell>
</template>

<script setup lang="ts">
import {
  ABOUT_ACTION_LINKS,
  ABOUT_FEATURES,
  ABOUT_TECHNOLOGIES,
  PRIVACY_ROUTE,
  TERMS_ROUTE,
  TMDB_ATTRIBUTION_STATEMENT,
  TMDB_ROUTE,
} from '~/constants/legal'

useHead({
  title: 'About | NextWatch',
})
</script>
