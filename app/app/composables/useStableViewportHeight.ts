import { onMounted, onUnmounted } from 'vue'

const APP_HEIGHT_CSS_VARIABLE = '--app-height'
export const APP_HEIGHT_CSS_VALUE = 'var(--app-height, 100dvh)'

const syncViewportHeight = () => {
  if (!import.meta.client) {
    return
  }

  document.documentElement.style.setProperty(APP_HEIGHT_CSS_VARIABLE, `${window.innerHeight}px`)
}

const scheduleViewportHeightSync = () => {
  syncViewportHeight()
  window.requestAnimationFrame(syncViewportHeight)
}

export function useStableViewportHeight() {
  let visualViewport: VisualViewport | null = null

  onMounted(() => {
    scheduleViewportHeightSync()

    window.addEventListener('resize', scheduleViewportHeightSync)
    window.addEventListener('orientationchange', scheduleViewportHeightSync)
    window.addEventListener('pageshow', scheduleViewportHeightSync)

    visualViewport = window.visualViewport
    visualViewport?.addEventListener('resize', scheduleViewportHeightSync)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', scheduleViewportHeightSync)
    window.removeEventListener('orientationchange', scheduleViewportHeightSync)
    window.removeEventListener('pageshow', scheduleViewportHeightSync)

    visualViewport?.removeEventListener('resize', scheduleViewportHeightSync)
    visualViewport = null
  })

  return {
    appHeightCssValue: APP_HEIGHT_CSS_VALUE,
  }
}
