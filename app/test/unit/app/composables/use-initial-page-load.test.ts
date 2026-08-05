import { describe, expect, it, vi } from 'vitest'

import { useInitialPageLoad } from '../../../../app/composables/useInitialPageLoad'

describe('useInitialPageLoad', () => {
  it('starts pending and resolves after a successful initial load', async () => {
    const initialPageLoad = useInitialPageLoad()
    const loader = vi.fn().mockResolvedValue(undefined)

    expect(initialPageLoad.isInitialLoadPending.value).toBe(true)

    await initialPageLoad.runInitialLoad(loader)

    expect(loader).toHaveBeenCalledOnce()
    expect(initialPageLoad.isInitialLoadPending.value).toBe(false)
  })

  it('still resolves the pending state when the initial load fails', async () => {
    const initialPageLoad = useInitialPageLoad()
    const loaderError = new Error('initial load failed')
    const loader = vi.fn().mockRejectedValue(loaderError)

    await expect(initialPageLoad.runInitialLoad(loader)).rejects.toThrow(loaderError)
    expect(initialPageLoad.isInitialLoadPending.value).toBe(false)
  })
})
