import { computed, ref } from 'vue'

const IOS_PHONE_USER_AGENT_PATTERN = /iphone|ipod/i
const ANDROID_MOBILE_USER_AGENT_PATTERN = /android/i
const MOBILE_USER_AGENT_HINT = 'mobile'
const TRUE_STORAGE_VALUE = 'true'
const INSTALL_PROMPT_DISMISSED_STORAGE_KEY = 'pwa-install-prompt-dismissed'
const INSTALL_MODAL_OPEN_STATE_KEY = 'pwa-install-modal-open'
const IOS_INSTALL_MODAL_OPEN_STATE_KEY = 'pwa-ios-install-modal-open'
const INSTALL_PROMPT_DISMISSED_STATE_KEY = 'pwa-install-prompt-dismissed-state'

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}

function detectIos(): boolean {
  if (!import.meta.client) {
    return false
  }

  const ua = navigator.userAgent || ''
  const isIosDevice = /iphone|ipad|ipod/i.test(ua)
  // iPadOS 13+ reports as a Mac, so detect it via touch support.
  const isIpadOs = /macintosh/i.test(ua) && navigator.maxTouchPoints > 1

  return isIosDevice || isIpadOs
}

export function detectMobilePwaDevice(): boolean {
  if (!import.meta.client) {
    return false
  }

  const userAgent = navigator.userAgent || ''
  const isIosPhone = IOS_PHONE_USER_AGENT_PATTERN.test(userAgent)
  const isAndroidMobile =
    ANDROID_MOBILE_USER_AGENT_PATTERN.test(userAgent) &&
    userAgent.toLowerCase().includes(MOBILE_USER_AGENT_HINT)

  return isIosPhone || isAndroidMobile
}

export function detectStandalone(): boolean {
  if (!import.meta.client) {
    return false
  }

  const matchesStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true

  return matchesStandalone || iosStandalone
}

function readPersistedInstallPromptDismissed(): boolean {
  if (!import.meta.client) {
    return false
  }

  try {
    return window.localStorage.getItem(INSTALL_PROMPT_DISMISSED_STORAGE_KEY) === TRUE_STORAGE_VALUE
  } catch {
    return false
  }
}

function persistInstallPromptDismissed(isDismissed: boolean) {
  if (!import.meta.client) {
    return
  }

  try {
    if (isDismissed) {
      window.localStorage.setItem(INSTALL_PROMPT_DISMISSED_STORAGE_KEY, TRUE_STORAGE_VALUE)
      return
    }

    window.localStorage.removeItem(INSTALL_PROMPT_DISMISSED_STORAGE_KEY)
  } catch {}
}

export function usePwaInstall() {
  const deferredPrompt = useState<BeforeInstallPromptEvent | null>('pwa-install-prompt', () => null)
  const isInstallModalOpen = useState<boolean>(INSTALL_MODAL_OPEN_STATE_KEY, () => false)
  const isIosInstallModalOpen = useState<boolean>(IOS_INSTALL_MODAL_OPEN_STATE_KEY, () => false)
  const isInstallPromptDismissed = useState<boolean>(INSTALL_PROMPT_DISMISSED_STATE_KEY, () => false)
  const showIosModal = ref(false)

  const isIos = computed(detectIos)
  const isMobileDevice = computed(detectMobilePwaDevice)
  const isStandalone = computed(detectStandalone)
  const canInstall = computed(
    () => Boolean(deferredPrompt.value) && isMobileDevice.value && !isStandalone.value
  )
  const canAutoPromptInstall = computed(
    () => isMobileDevice.value && !isStandalone.value && (isIos.value || canInstall.value)
  )
  const showInstallOption = computed(
    () => (canInstall.value || (isIos.value && isMobileDevice.value)) && !isStandalone.value
  )

  function syncInstallPromptDismissedState() {
    isInstallPromptDismissed.value = readPersistedInstallPromptDismissed()
  }

  function markInstallPromptDismissed() {
    isInstallPromptDismissed.value = true
    persistInstallPromptDismissed(true)
  }

  function maybeAutoOpenInstallModal() {
    syncInstallPromptDismissedState()

    if (!canAutoPromptInstall.value || isInstallPromptDismissed.value) {
      return
    }

    isInstallModalOpen.value = true
  }

  function openInstallModal() {
    if (!canAutoPromptInstall.value) {
      return
    }

    isInstallModalOpen.value = true
  }

  function dismissInstallModal() {
    isInstallModalOpen.value = false
    markInstallPromptDismissed()
  }

  function closeIosInstallModal() {
    isIosInstallModalOpen.value = false
  }

  async function install() {
    if (isStandalone.value || !isMobileDevice.value) {
      return
    }

    markInstallPromptDismissed()
    isInstallModalOpen.value = false

    if (isIos.value) {
      isIosInstallModalOpen.value = true
      return
    }

    const prompt = deferredPrompt.value

    if (!prompt) {
      return
    }

    try {
      await prompt.prompt()
      await prompt.userChoice
    } finally {
      // The prompt can only be used once; clear it regardless of the outcome.
      deferredPrompt.value = null
    }
  }

  function handleAppInstalled() {
    deferredPrompt.value = null
    isInstallModalOpen.value = false
    isIosInstallModalOpen.value = false
    showIosModal.value = false
    markInstallPromptDismissed()
  }

  return {
    isIos,
    isMobileDevice,
    isStandalone,
    canInstall,
    canAutoPromptInstall,
    isInstallModalOpen,
    isIosInstallModalOpen,
    maybeAutoOpenInstallModal,
    openInstallModal,
    dismissInstallModal,
    closeIosInstallModal,
    handleAppInstalled,
    showInstallOption,
    showIosModal,
    syncInstallPromptDismissedState,
    install,
  }
}
