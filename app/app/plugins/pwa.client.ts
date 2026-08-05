import type { BeforeInstallPromptEvent } from '~/composables/usePwaInstall'

const APP_INSTALLED_EVENT = 'appinstalled'
const LOAD_EVENT = 'load'
const SERVICE_WORKER_PATH = '/sw.js'
const SERVICE_WORKER_SUPPORTED = 'serviceWorker' in navigator

export default defineNuxtPlugin(() => {
  const deferredPrompt = useState<BeforeInstallPromptEvent | null>('pwa-install-prompt', () => null)
  const { handleAppInstalled, maybeAutoOpenInstallModal } = usePwaInstall()
  const { markUpdateAvailable } = usePwaUpdate()
  let hasPendingUpdate = false

  function monitorServiceWorkerUpdates(registration: ServiceWorkerRegistration) {
    registration.addEventListener('updatefound', () => {
      const installingWorker = registration.installing

      if (!installingWorker) {
        return
      }

      installingWorker.addEventListener('statechange', () => {
        const hasExistingController = Boolean(navigator.serviceWorker.controller)
        const isInstalledState = installingWorker.state === 'installed'

        if (!hasExistingController || !isInstalledState) {
          return
        }

        hasPendingUpdate = true
      })
    })
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    // Prevent the mini-infobar so we can trigger the prompt from our own UI.
    event.preventDefault()
    deferredPrompt.value = event as BeforeInstallPromptEvent
    maybeAutoOpenInstallModal()
  })

  window.addEventListener(APP_INSTALLED_EVENT, () => {
    handleAppInstalled()
  })

  if (SERVICE_WORKER_SUPPORTED) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hasPendingUpdate) {
        return
      }

      hasPendingUpdate = false
      markUpdateAvailable()
    })

    window.addEventListener(LOAD_EVENT, () => {
      navigator.serviceWorker
        .register(SERVICE_WORKER_PATH)
        .then((registration) => {
          monitorServiceWorkerUpdates(registration)
          return registration.update()
        })
        .catch(() => {
          // Registration failures are non-fatal; the app still works without the SW.
        })
    })
  }
})
