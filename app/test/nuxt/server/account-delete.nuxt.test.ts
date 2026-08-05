import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createApp, createError, defineEventHandler, toNodeListener } from 'h3'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const TEST_USER_ID = '00000000-0000-0000-0000-000000000321'

const { deleteUserMock, getAuthorizedUserMock } = vi.hoisted(() => ({
  deleteUserMock: vi.fn(),
  getAuthorizedUserMock: vi.fn(),
}))

vi.mock('../../../server/utils/auth/authorize-user', () => ({
  getAuthorizedUser: getAuthorizedUserMock,
}))

vi.mock('../../../server/utils/shared/supabase-client', () => ({
  createServiceSupabaseClient: () => ({
    auth: {
      admin: {
        deleteUser: deleteUserMock,
      },
    },
  }),
}))

Object.assign(globalThis, {
  createError,
  defineEventHandler,
})

const { default: deleteAccountHandler } = await import('../../../server/api/account/delete.post')

describe('/api/account/delete', () => {
  const app = createApp()
  app.use('/api/account/delete', deleteAccountHandler)

  let baseUrl = ''
  let server: Server

  beforeAll(async () => {
    server = createServer(toNodeListener(app))
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve())
    })
    const address = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  })

  beforeEach(() => {
    getAuthorizedUserMock.mockResolvedValue({
      user: { id: TEST_USER_ID },
      supabase: {},
    })
    deleteUserMock.mockResolvedValue({ data: { user: null }, error: null })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('deletes the authenticated user only', async () => {
    const response = await fetch(`${baseUrl}/api/account/delete`, {
      method: 'POST',
    })
    const body = await response.json() as { success?: boolean }

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(deleteUserMock).toHaveBeenCalledWith(TEST_USER_ID)
  })

  it('returns 401 when the caller is not authenticated', async () => {
    getAuthorizedUserMock.mockRejectedValueOnce(
      createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    )

    const response = await fetch(`${baseUrl}/api/account/delete`, {
      method: 'POST',
    })

    expect(response.status).toBe(401)
    expect(deleteUserMock).not.toHaveBeenCalled()
  })

  it('returns 500 when supabase admin deletion fails', async () => {
    deleteUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'delete failed' },
    })

    const response = await fetch(`${baseUrl}/api/account/delete`, {
      method: 'POST',
    })
    const body = await response.json() as { statusMessage?: string }

    expect(response.status).toBe(500)
    expect(body.statusMessage).toBe('Unable to delete account.')
  })
})
