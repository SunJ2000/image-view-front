export interface Photo {
  id: string
  displayName: string
  mimeType: string
  mediaType: 'image'
  sizeBytes: number
  createdAt: string
  updatedAt: string
}

export interface PhotoList {
  items: Photo[]
  total: number
  page: number
  pageSize: number
}

export interface Preview {
  fileId: string
  previewable: boolean
  url: string
  expiresAt: string
  disposition: 'inline' | 'attachment'
}

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message
  if (error instanceof DOMException && error.name === 'TimeoutError')
    return '连接超时，请稍后重试。'
  return '暂时无法连接图库，请检查网络后重试。'
}

function validPhoto(value: unknown): value is Photo {
  if (!value || typeof value !== 'object') return false
  const photo = value as Record<string, unknown>
  return (
    typeof photo.id === 'string' &&
    typeof photo.displayName === 'string' &&
    typeof photo.mimeType === 'string' &&
    photo.mediaType === 'image' &&
    typeof photo.sizeBytes === 'number' &&
    Number.isFinite(photo.sizeBytes) &&
    typeof photo.createdAt === 'string' &&
    typeof photo.updatedAt === 'string'
  )
}

export function createPhotoApi(baseUrl: string, fetcher: typeof fetch = fetch) {
  const base = baseUrl.replace(/\/+$/, '')
  const cache = new Map<string, Preview>()
  const pending = new Map<string, Promise<Preview>>()
  let active = 0
  const waiting: (() => void)[] = []

  async function request(path: string, signal?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(15_000)
    const response = await fetcher(`${base}/public/photos${path}`, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { Accept: 'application/json' },
      credentials: 'omit',
      cache: 'no-store',
    })
    if (!response.ok) {
      const messages: Record<number, string> = {
        400: '请求参数有误，请返回图库重试。',
        401: '公开图库尚未开放，请稍后再来。',
        404: '这张图片暂时无法查看，可能已被撤回。',
        429: '浏览得有点快，请稍等片刻再试。',
        502: '图片服务暂时不可用，请稍后重试。',
        503: '图库正在维护，请稍后再来。',
      }
      throw new ApiError(
        response.status,
        messages[response.status] ?? '图库暂时无法加载，请稍后重试。',
      )
    }
    try {
      return await response.json()
    } catch {
      throw new ApiError(502, '图库暂时无法加载，请稍后重试。')
    }
  }

  return {
    async list(
      page: number,
      pageSize: number,
      search: string,
      signal?: AbortSignal,
    ): Promise<PhotoList> {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      })
      if (search) query.set('search', search)
      let value: PhotoList
      try {
        value = (await request(`?${query}`, signal)) as PhotoList
      } catch (cause) {
        if (cause instanceof ApiError && cause.status === 404)
          throw new ApiError(404, '公开图库暂时不可用，请稍后再来。')
        throw cause
      }
      if (
        !value ||
        !Array.isArray(value.items) ||
        !value.items.every(validPhoto) ||
        !Number.isSafeInteger(value.total) ||
        value.total < 0 ||
        !Number.isInteger(value.page) ||
        !Number.isInteger(value.pageSize)
      )
        throw new ApiError(502, '图库返回的数据暂时无法读取，请稍后重试。')
      return value
    },
    async detail(id: string, signal?: AbortSignal): Promise<Photo> {
      const value = await request(`/${encodeURIComponent(id)}`, signal)
      if (!validPhoto(value)) throw new ApiError(502, '图片信息暂时无法读取。')
      return value
    },
    preview(
      id: string,
      mode: 'preview' | 'download' = 'preview',
      force = false,
    ): Promise<Preview> {
      const key = `${id}:${mode}`
      if (force) cache.delete(key)
      const cached = cache.get(key)
      if (cached && Date.parse(cached.expiresAt) > Date.now() + 30_000)
        return Promise.resolve(cached)
      const existing = pending.get(key)
      if (existing) return existing
      const operation = (async () => {
        if (active >= 4)
          await new Promise<void>((resolve) => waiting.push(resolve))
        else active++
        try {
          const value = (await request(
            `/${encodeURIComponent(id)}/preview-url?mode=${mode}`,
          )) as Preview
          if (
            !value ||
            typeof value.previewable !== 'boolean' ||
            typeof value.url !== 'string' ||
            !/^https?:\/\//i.test(value.url) ||
            !Number.isFinite(Date.parse(value.expiresAt)) ||
            value.fileId !== id ||
            !['inline', 'attachment'].includes(value.disposition)
          )
            throw new ApiError(502, '图片地址暂时无法读取。')
          if (cache.size >= 150) cache.delete(cache.keys().next().value!)
          cache.set(key, value)
          return value
        } finally {
          const next = waiting.shift()
          if (next) next()
          else active--
        }
      })().finally(() => pending.delete(key))
      pending.set(key, operation)
      return operation
    },
  }
}
