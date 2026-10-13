import type OSS from 'ali-oss'
import type { AdminApi, SignedUpload, StsUpload } from './adminApi'

export const maxUploadBytes = 5 * 1024 ** 3
export interface UploadContext {
  id?: string
  phase: 'init' | 'transfer' | 'complete'
  checkpoint?: OSS.Checkpoint
}
export function validateUpload(file: File) {
  if (!file.size) throw new Error('不能上传空文件。')
  if (file.size > maxUploadBytes) throw new Error('单个文件不能超过 5 GB。')
  if (
    !file.name.trim() ||
    file.name.length > 255 ||
    /[\x00-\x1f\x7f/\\]/.test(file.name)
  )
    throw new Error('文件名过长或包含不支持的字符。')
}
export function uploadMime(file: File) {
  return file.type.trim().toLowerCase() || 'application/octet-stream'
}

export function putSigned(
  file: File,
  upload: SignedUpload,
  signal: AbortSignal,
  progress: (ratio: number) => void,
  xhrFactory = () => new XMLHttpRequest(),
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Upload cancelled', 'AbortError'))
      return
    }
    if (!/^https?:\/\//i.test(upload.url)) {
      reject(new Error('上传地址无效。'))
      return
    }
    const xhr = xhrFactory()
    const abort = () => xhr.abort()
    const done = (error?: Error) => {
      signal.removeEventListener('abort', abort)
      error ? reject(error) : resolve()
    }
    xhr.open('PUT', upload.url)
    xhr.timeout = 30 * 60_000
    // Only OSS signature headers cross this boundary. Never forward the administrator token.
    for (const [name, value] of Object.entries(upload.headers)) {
      if (['content-type', 'x-oss-object-acl'].includes(name.toLowerCase()))
        xhr.setRequestHeader(name, value)
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) progress(event.loaded / event.total)
    }
    xhr.onload = () =>
      done(
        xhr.status >= 200 && xhr.status < 300
          ? undefined
          : new Error('文件直传失败，请重试；可检查 OSS 跨域配置。'),
      )
    xhr.onerror = () =>
      done(new Error('上传连接失败，请检查网络和 OSS 跨域配置。'))
    xhr.ontimeout = () => done(new Error('上传超时，请重试。'))
    xhr.onabort = () => done(new DOMException('Upload cancelled', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    xhr.send(file)
  })
}

async function putSts(
  file: File,
  upload: StsUpload,
  api: AdminApi,
  context: UploadContext,
  signal: AbortSignal,
  progress: (ratio: number) => void,
) {
  const { default: OSSClient } = await import('ali-oss')
  signal.throwIfAborted()
  const client = new OSSClient({
    region: upload.region,
    endpoint: upload.endpoint,
    bucket: upload.bucket,
    accessKeyId: upload.accessKeyId,
    accessKeySecret: upload.accessKeySecret,
    stsToken: upload.stsToken,
    secure: true,
    authorizationV4: true,
    refreshSTSTokenInterval: 600_000,
    refreshSTSToken: async () => {
      const renewed = (await api.credentials(context.id!, signal)).upload
      if (renewed.mode !== 'sts')
        throw new Error('上传模式发生变化，请重新上传。')
      return {
        accessKeyId: renewed.accessKeyId,
        accessKeySecret: renewed.accessKeySecret,
        stsToken: renewed.stsToken,
      }
    },
  })
  const abort = () => client.cancel()
  signal.addEventListener('abort', abort, { once: true })
  try {
    await client.multipartUpload(upload.objectKey, file, {
      mime: uploadMime(file),
      headers: upload.headers,
      parallel: 3,
      partSize: 8 * 1024 * 1024,
      ...(context.checkpoint ? { checkpoint: context.checkpoint } : {}),
      progress: (ratio: number, checkpoint: OSS.Checkpoint) => {
        context.checkpoint = checkpoint
        progress(ratio)
      },
    })
    signal.throwIfAborted()
  } finally {
    signal.removeEventListener('abort', abort)
  }
}

export async function uploadManagedFile(
  file: File,
  api: AdminApi,
  context: UploadContext,
  signal: AbortSignal,
  progress: (ratio: number) => void,
  transfer = putSigned,
) {
  validateUpload(file)
  signal.throwIfAborted()
  if (context.phase !== 'complete') {
    const session = context.id
      ? await api.credentials(context.id, signal)
      : await api.init(file.name.trim(), file.size, uploadMime(file), signal)
    context.id = session.file.id
    context.phase = 'transfer'
    signal.throwIfAborted()
    if (session.upload.mode === 'signed-put')
      await transfer(file, session.upload, signal, progress)
    else await putSts(file, session.upload, api, context, signal, progress)
    context.phase = 'complete'
  }
  signal.throwIfAborted()
  return api.complete(context.id!, signal)
}
