import { describe, expect, it, vi } from 'vitest'
import { createAdminSession } from '../src/lib/adminSession'
import { createAdminApi } from '../src/lib/adminApi'

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
const empty = () => json({ items: [], total: 0, page: 1, pageSize: 1 })
const deferred = () => {
  let resolve!: (value: Response) => void
  const promise = new Promise<Response>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('administrator authentication', () => {
  it('verifies with the backend before entering, then sends the credential only to same-origin admin endpoints', async () => {
    const gate = deferred()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(gate.promise)
      .mockImplementation(async () => empty())
    const session = createAdminSession(fetcher)
    const login = session.signIn('  local-test-token  ')
    expect(session.authenticated.value).toBe(false)
    expect(fetcher.mock.calls[0]).toEqual([
      '/api/files?page=1&pageSize=1&status=ready',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer local-test-token',
        },
        credentials: 'omit',
        cache: 'no-store',
      }),
    ])
    gate.resolve(empty())
    await login
    expect(session.authenticated.value).toBe(true)
    await session.api.list({
      search: '海 & 山',
      visibility: 'private',
      mediaType: 'image',
    })
    const [url, options] = fetcher.mock.calls[1]!
    expect(
      new URL(String(url), 'https://local.test').searchParams.get('search'),
    ).toBe('海 & 山')
    expect(options?.headers).toHaveProperty(
      'Authorization',
      'Bearer local-test-token',
    )
    session.signOut()
    expect(session.authenticated.value).toBe(false)
    await expect(session.api.list()).rejects.toMatchObject({ status: 401 })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it.each(['', '  ', 'Bearer secret', 'invalid\nvalue'])(
    'rejects malformed input before contacting the server: %j',
    async (value) => {
      const fetcher = vi.fn<typeof fetch>()
      const session = createAdminSession(fetcher)
      await expect(session.signIn(value)).rejects.toThrow()
      expect(fetcher).not.toHaveBeenCalled()
      expect(session.authenticated.value).toBe(false)
    },
  )
  it.each([401, 429, 503])(
    'does not accept a non-empty token when the backend returns %i',
    async (status) => {
      const session = createAdminSession(
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(json({ message: 'internal secret' }, status)),
      )
      await expect(session.signIn('local-test-token')).rejects.toMatchObject({
        status,
      })
      expect(session.authenticated.value).toBe(false)
    },
  )
  it('does not accept a proxy HTML page or malformed successful response as login', async () => {
    for (const response of [
      new Response('<html>gateway</html>'),
      json({ items: [], total: -1 }),
    ]) {
      const session = createAdminSession(
        vi.fn<typeof fetch>().mockResolvedValue(response),
      )
      await expect(session.signIn('local-test-token')).rejects.toMatchObject({
        status: 502,
      })
      expect(session.authenticated.value).toBe(false)
    }
  })
  it('invalidates a session when any management request returns 401', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(empty())
      .mockResolvedValueOnce(json({}, 401))
    const session = createAdminSession(fetcher)
    await session.signIn('local-test-token')
    await expect(session.api.remove('test-id')).rejects.toMatchObject({
      status: 401,
    })
    expect(session.authenticated.value).toBe(false)
    await expect(session.api.list()).rejects.toMatchObject({ status: 401 })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('cannot restore authentication from a response arriving after logout', async () => {
    const gate = deferred()
    const session = createAdminSession(
      vi.fn<typeof fetch>().mockReturnValue(gate.promise),
    )
    const login = session.signIn('local-test-token')
    session.signOut()
    gate.resolve(empty())
    await expect(login).rejects.toMatchObject({ name: 'AbortError' })
    expect(session.authenticated.value).toBe(false)
  })
  it.each(['new-test-token', 'old-test-token'])(
    'discards stale 401 responses without clearing a newer session using %s',
    async (newToken) => {
      const gate = deferred()
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(empty())
        .mockReturnValueOnce(gate.promise)
        .mockResolvedValueOnce(empty())
        .mockResolvedValueOnce(empty())
      const session = createAdminSession(fetcher)
      await session.signIn('old-test-token')
      const oldRequest = session.api.list()
      session.signOut()
      await session.signIn(newToken)
      gate.resolve(json({}, 401))
      await expect(oldRequest).rejects.toMatchObject({ name: 'AbortError' })
      expect(session.authenticated.value).toBe(true)
      await session.api.list()
      expect(fetcher.mock.calls[3]?.[1]?.headers).toHaveProperty(
        'Authorization',
        `Bearer ${newToken}`,
      )
    },
  )
  it('a new page session starts unauthenticated', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(empty())
    await createAdminSession(fetcher).signIn('local-test-token')
    expect(createAdminSession(fetcher).authenticated.value).toBe(false)
  })
})

describe('management requests', () => {
  it('uses backend methods and JSON contracts for updates and uploads', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json({}))
    const api = createAdminApi(() => 'local-test-token', undefined, fetcher)
    await api.rename('id/with space', '新名称')
    await api.visibility('id', 'public')
    await api.remove('id')
    await api.preview('id', 'download')
    await api.init('photo.png', 123, 'image/png')
    await api.credentials('id')
    await api.complete('id')
    expect(
      fetcher.mock.calls.map(([url, options]) => [
        url,
        options?.method,
        options?.body,
      ]),
    ).toEqual([
      [
        '/api/files/id%2Fwith%20space',
        'PATCH',
        JSON.stringify({ displayName: '新名称' }),
      ],
      [
        '/api/files/id/visibility',
        'PATCH',
        JSON.stringify({ visibility: 'public' }),
      ],
      ['/api/files/id', 'DELETE', undefined],
      ['/api/files/id/preview-url?mode=download', 'GET', undefined],
      [
        '/api/uploads/init',
        'POST',
        JSON.stringify({
          fileName: 'photo.png',
          sizeBytes: 123,
          mimeType: 'image/png',
        }),
      ],
      ['/api/uploads/id/credentials', 'POST', '{}'],
      ['/api/uploads/id/complete', 'POST', '{}'],
    ])
  })
  it('does not reveal server messages in the UI', async () => {
    const api = createAdminApi(
      () => 'local-test-token',
      undefined,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          json({ message: 'credential-internal-details' }, 502),
        ),
    )
    await expect(api.list()).rejects.not.toThrow('credential-internal-details')
  })
})
