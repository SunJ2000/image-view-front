import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createPhotoApi } from '../src/lib/api'

const photo = {
  id: 'test-id',
  displayName: '一张照片',
  mimeType: 'image/jpeg',
  mediaType: 'image',
  sizeBytes: 1024,
  createdAt: '2026-10-12T00:00:00Z',
  updatedAt: '2026-10-12T00:00:00Z',
}
const preview = (id = 'test-id') => ({
  fileId: id,
  previewable: true,
  url: 'https://example.com/signed-image',
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  disposition: 'inline',
})
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
afterEach(() => vi.restoreAllMocks())

describe('public photo API', () => {
  it('encodes searches and uses only public endpoints without credentials', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json({ items: [photo], total: 1, page: 2, pageSize: 24 }),
      )
    const api = createPhotoApi('/api/', fetcher)
    await expect(api.list(2, 24, '山 & 水')).resolves.toMatchObject({
      total: 1,
      items: [photo],
    })
    const [url, options] = fetcher.mock.calls[0]!
    const parsed = new URL(String(url), 'https://example.com')
    expect(parsed.pathname).toBe('/api/public/photos')
    expect(parsed.searchParams.get('search')).toBe('山 & 水')
    expect(parsed.searchParams.get('page')).toBe('2')
    expect(options).toMatchObject({
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })
    expect(options?.headers).not.toHaveProperty('Authorization')
  })
  it.each([401, 404, 429, 502, 503])(
    'maps HTTP %i without leaking server details',
    async (status) => {
      const api = createPhotoApi(
        '/api',
        vi
          .fn<typeof fetch>()
          .mockImplementation(async () =>
            json({ message: 'internal server details' }, status),
          ),
      )
      await expect(api.detail('test-id')).rejects.toMatchObject({ status })
      await expect(api.detail('test-id')).rejects.not.toThrow(
        'internal server details',
      )
    },
  )
  it.each([
    '<!doctype html>',
    JSON.stringify({ items: [], total: -1, page: 1, pageSize: 24 }),
    JSON.stringify({
      items: [{ ...photo, mediaType: 'video' }],
      total: 1,
      page: 1,
      pageSize: 24,
    }),
  ])('rejects HTML fallbacks and malformed lists', async (body) => {
    const api = createPhotoApi(
      '/api',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(body)),
    )
    await expect(api.list(1, 24, '')).rejects.toBeInstanceOf(ApiError)
  })
  it('uses an unavailable-gallery message for a missing list endpoint', async () => {
    const api = createPhotoApi(
      '/api',
      vi.fn<typeof fetch>().mockResolvedValue(json({}, 404)),
    )
    await expect(api.list(1, 24, '')).rejects.toThrow('公开图库暂时不可用')
  })
  it('deduplicates preview requests and caches until shortly before expiry', async () => {
    const first = preview()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json(first))
    const api = createPhotoApi('/api', fetcher)
    await Promise.all([
      api.preview('test-id'),
      api.preview('test-id'),
      api.preview('test-id'),
    ])
    expect(fetcher).toHaveBeenCalledTimes(1)
    await api.preview('test-id')
    expect(fetcher).toHaveBeenCalledTimes(1)
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse(first.expiresAt) - 20_000)
    await api.preview('test-id')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('keeps preview and download separate and can force renewal', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => json(preview()))
    const api = createPhotoApi('/api', fetcher)
    await api.preview('test-id')
    await api.preview('test-id', 'download')
    await api.preview('test-id', 'preview', true)
    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/public/photos/test-id/preview-url?mode=preview',
      '/api/public/photos/test-id/preview-url?mode=download',
      '/api/public/photos/test-id/preview-url?mode=preview',
    ])
  })
  it('caps simultaneous preview requests at four and releases waiting requests', async () => {
    const releases: (() => void)[] = []
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (url) =>
        new Promise((resolve) => {
          const id = String(url).split('/')[4]!
          releases.push(() => resolve(json(preview(id))))
        }),
    )
    const api = createPhotoApi('/api', fetcher)
    const operations = Array.from({ length: 6 }, (_, index) =>
      api.preview(`id-${index}`),
    )
    expect(fetcher).toHaveBeenCalledTimes(4)
    releases[0]!()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(5))
    releases[1]!()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(6))
    releases.slice(2).forEach((release) => release())
    await expect(Promise.all(operations)).resolves.toHaveLength(6)
  })
  it('allows a retry when a preview request fails', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({}, 429))
      .mockImplementation(async () => json(preview()))
    const api = createPhotoApi('/api', fetcher)
    await expect(api.preview('test-id')).rejects.toMatchObject({ status: 429 })
    await expect(api.preview('test-id')).resolves.toMatchObject({
      fileId: 'test-id',
    })
  })
  it.each([
    { url: 'javascript:alert(1)' },
    { expiresAt: 'not-a-date' },
    { fileId: 'another-file' },
  ])('rejects malformed previews: %j', async (attributes) => {
    const api = createPhotoApi(
      '/api',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ ...preview(), ...attributes })),
    )
    await expect(api.preview('test-id')).rejects.toBeInstanceOf(ApiError)
  })
  it('propagates cancellation to the list request', async () => {
    const controller = new AbortController()
    let receivedSignal: AbortSignal | undefined
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation((_url, options) => {
        receivedSignal = options?.signal as AbortSignal
        return new Promise((_resolve, reject) =>
          receivedSignal!.addEventListener(
            'abort',
            () => reject(receivedSignal!.reason),
            { once: true },
          ),
        )
      })
    const operation = createPhotoApi('/api', fetcher).list(
      1,
      24,
      '',
      controller.signal,
    )
    controller.abort()
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    expect(receivedSignal?.aborted).toBe(true)
  })
})
