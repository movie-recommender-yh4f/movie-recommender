<template>
  <ULink :to="to" class="nextwatch-feature-card group">
    <div class="nextwatch-feature-card__stack nextwatch-feature-card__stack--back" aria-hidden="true" />
    <div class="nextwatch-feature-card__stack nextwatch-feature-card__stack--front" aria-hidden="true" />

    <article class="nextwatch-feature-card__frame">
      <div class="nextwatch-feature-card__header">
        <span class="nextwatch-feature-card__eyebrow">{{ eyebrow }}</span>
        <UIcon :name="icon" class="nextwatch-feature-card__icon" />
      </div>

      <div class="nextwatch-feature-card__body">
        <h3 class="nextwatch-feature-card__title">{{ title }}</h3>
        <p class="nextwatch-feature-card__description">{{ description }}</p>
      </div>

      <div class="nextwatch-feature-card__footer">
        <span class="nextwatch-feature-card__chip">{{ chip }}</span>
        <span class="nextwatch-feature-card__cta">
          Open
          <UIcon name="i-lucide-arrow-up-right" class="nextwatch-feature-card__cta-icon" />
        </span>
      </div>
    </article>
  </ULink>
</template>

<script setup lang="ts">
defineProps<{
  chip: string
  description: string
  eyebrow: string
  icon: string
  title: string
  to: string
}>()
</script>
