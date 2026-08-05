<template>
  <div ref="glowRef" class="nextwatch-mouse-glow" aria-hidden="true" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const glowRef = ref<HTMLDivElement | null>(null)

let container: HTMLElement | null = null

const setGlowState = (x: number, y: number, opacity: string) => {
  if (!glowRef.value) {
    return
  }

  glowRef.value.style.setProperty('--glow-x', `${x}px`)
  glowRef.value.style.setProperty('--glow-y', `${y}px`)
  glowRef.value.style.setProperty('--glow-opacity', opacity)
}

const handlePointerMove = (event: MouseEvent) => {
  if (!container) {
    return
  }

  const bounds = container.getBoundingClientRect()

  setGlowState(event.clientX - bounds.left, event.clientY - bounds.top, '1')
}

const handlePointerLeave = () => {
  setGlowState(0, 0, '0')
}

onMounted(() => {
  container = glowRef.value?.closest('.nextwatch-landing') as HTMLElement | null

  if (!container) {
    return
  }

  container.addEventListener('mousemove', handlePointerMove)
  container.addEventListener('mouseleave', handlePointerLeave)
})

onBeforeUnmount(() => {
  if (!container) {
    return
  }

  container.removeEventListener('mousemove', handlePointerMove)
  container.removeEventListener('mouseleave', handlePointerLeave)
})
</script>
