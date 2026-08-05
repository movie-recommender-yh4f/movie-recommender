import { computed } from 'vue'
import { detectMobilePwaDevice, detectStandalone } from '~/composables/usePwaInstall'

const PWA_UPDATE_AVAILABLE_STATE_KEY = 'pwa-update-available'
const PWA_UPDATE_APPLYING_STATE_KEY = 'pwa-update-applying'

export function usePwaUpdate() {
  const isUpdateAvailable = useState<boolean>(PWA_UPDATE_AVAILABLE_STATE_KEY, () => false)
  const isApplyingUpdate = useState<boolean>(PWA_UPDATE_APPLYING_STATE_KEY, () => false)
  const isMobileDevice = computed(detectMobilePwaDevice)
  const isStandalone = computed(detectStandalone)

  const shouldShowUpdateNotice = computed(
    () => isMobileDevice.value && isStandalone.value && isUpdateAvailable.value
  )

  function markUpdateAvailable() {
    if (!isMobileDevice.value || !isStandalone.value) {
      return
    }

    isUpdateAvailable.value = true
  }

  function applyUpdate() {
    if (!isUpdateAvailable.value || isApplyingUpdate.value) {
      return
    }

    isApplyingUpdate.value = true
    window.location.reload()
  }

  return {
    isApplyingUpdate,
    isUpdateAvailable,
    shouldShowUpdateNotice,
    markUpdateAvailable,
    applyUpdate,
  }
}
