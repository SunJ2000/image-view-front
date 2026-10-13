import { ApiError, type Preview } from './api'

export interface ManagedFile {
  id: string
  originalName: string
  displayName: string
  mimeType: string
  mediaType: 'image' | 'video' | 'other'
  sizeBytes: number
  status: 'pending' | 'ready' | 'deleting' | 'deleted'
  visibility: 'private' | 'public'
  createdAt: string
  updatedAt: string
  pendingExpiresAt: string | null
}
export interface FileFilters {
  page?: number
  pageSize?: number
  search?: string
  mediaType?: '' | ManagedFile['mediaType']
  visibility?: '' | ManagedFile['visibility']
  status?: 'pending' | 'ready' | 'deleting'
}
export interface ManagedList {
  items: ManagedFile[]
  total: number
  page: number
  pageSize: number
}
export interface StsUpload {
  mode: 'sts'
  accessKeyId: string
  accessKeySecret: string
  stsToken: string
  region: string
  endpoint: string
  bucket: string
  objectKey: string
  expiresAt: string
  headers: { 'x-oss-object-acl': 'private' }
}
export interface SignedUpload {
  mode: 'signed-put'
  method: 'PUT'
  url: string
  headers: { 'Content-Type': string; 'x-oss-object-acl': 'private' }
  expiresAt: string
}
export interface UploadSession {
  file: ManagedFile
  upload: StsUpload | SignedUpload
  maxFileSizeBytes: number
}

export function createAdminApi(
  getToken: () => string,
  onUnauthorized = () => {},
  fetcher: typeof fetch = fetch,
  getSessionVersion = () => 0,
) {
  async function request<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    signal?: AbortSignal,
    timeoutMs = 20_000,
  ): Promise<T> {
    const token = getToken()
    const version = getSessionVersion()
    if (!token) throw new ApiError(401, '请先验证管理员身份。')
    const timeout = AbortSignal.timeout(timeoutMs)
    const response = await fetcher(`/api${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      credentials: 'omit',
      cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    // An old request must never restore data after logout or affect a new session.
    if (token !== getToken() || version !== getSessionVersion())
      throw new DOMException('Session changed', 'AbortError')
    if (!response.ok) {
      if (response.status === 401) onUnauthorized()
      const messages: Record<number, string> = {
        400: '内容或参数不符合要求，请检查后重试。',
        401: '管理令牌无效或已失效，请重新验证。',
        404: '文件已不存在，请刷新列表。',
        409: '文件状态已变化，或当前文件无法执行此操作，请刷新后重试。',
        429: '操作较频繁，请稍等一分钟后重试。',
        502: '文件存储服务暂时不可用，请稍后重试。',
        503: '文件服务尚未就绪，请稍后重试。',
      }
      throw new ApiError(
        response.status,
        messages[response.status] || '操作未成功，请稍后重试。',
      )
    }
    let result: T
    try {
      result = (await response.json()) as T
    } catch {
      throw new ApiError(502, '服务返回的数据无法读取，请稍后重试。')
    }
    if (token !== getToken() || version !== getSessionVersion())
      throw new DOMException('Session changed', 'AbortError')
    return result
  }
  return {
    async list(filters: FileFilters = {}, signal?: AbortSignal) {
      const query = new URLSearchParams({
        page: String(filters.page || 1),
        pageSize: String(filters.pageSize || 20),
        status: filters.status || 'ready',
      })
      for (const key of ['search', 'visibility', 'mediaType'] as const)
        if (filters[key]) query.set(key, filters[key]!)
      const result = await request<ManagedList>(
        `/files?${query}`,
        'GET',
        undefined,
        signal,
      )
      if (
        !result ||
        !Array.isArray(result.items) ||
        !Number.isSafeInteger(result.total) ||
        result.total < 0
      )
        throw new ApiError(502, '文件列表暂时无法读取。')
      return result
    },
    rename: (id: string, displayName: string, signal?: AbortSignal) =>
      request<ManagedFile>(
        `/files/${encodeURIComponent(id)}`,
        'PATCH',
        { displayName },
        signal,
      ),
    visibility: (
      id: string,
      visibility: 'private' | 'public',
      signal?: AbortSignal,
    ) =>
      request<ManagedFile>(
        `/files/${encodeURIComponent(id)}/visibility`,
        'PATCH',
        { visibility },
        signal,
      ),
    remove: (id: string, signal?: AbortSignal) =>
      request<{ id: string; status: string }>(
        `/files/${encodeURIComponent(id)}`,
        'DELETE',
        undefined,
        signal,
        600_000,
      ),
    preview: (
      id: string,
      mode: 'preview' | 'download' = 'preview',
      signal?: AbortSignal,
    ) =>
      request<Preview>(
        `/files/${encodeURIComponent(id)}/preview-url?mode=${mode}`,
        'GET',
        undefined,
        signal,
      ),
    init: (
      fileName: string,
      sizeBytes: number,
      mimeType: string,
      signal?: AbortSignal,
    ) =>
      request<UploadSession>(
        '/uploads/init',
        'POST',
        { fileName, sizeBytes, mimeType },
        signal,
      ),
    credentials: (id: string, signal?: AbortSignal) =>
      request<UploadSession>(
        `/uploads/${encodeURIComponent(id)}/credentials`,
        'POST',
        {},
        signal,
      ),
    complete: (id: string, signal?: AbortSignal) =>
      request<ManagedFile>(
        `/uploads/${encodeURIComponent(id)}/complete`,
        'POST',
        {},
        signal,
        600_000,
      ),
  }
}
export type AdminApi = ReturnType<typeof createAdminApi>
