import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AdminApi,
  ManagedFile,
  SignedUpload,
  StsUpload,
  UploadSession,
} from '../src/lib/adminApi'
import {
  maxUploadBytes,
  putSigned,
  uploadManagedFile,
  validateUpload,
  type UploadContext,
} from '../src/lib/upload'

const sdk = vi.hoisted(() => ({
  options: undefined as any,
  multipart: vi.fn(),
  cancel: vi.fn(),
}))
vi.mock('ali-oss', () => ({
  default: class {
    constructor(options: unknown) {
      sdk.options = options
    }
    multipartUpload(...args: unknown[]) {
      return sdk.multipart(...args)
    }
    cancel() {
      sdk.cancel()
    }
  },
}))

const file = new File(['test-image'], 'photo.jpg', { type: 'image/jpeg' })
const record = {
  id: 'test-id',
  status: 'pending',
  visibility: 'private',
  objectKey: 'files/permanent.jpg',
} as unknown as ManagedFile
const signed: SignedUpload = {
  mode: 'signed-put',
  method: 'PUT',
  url: 'https://oss.local/staging/test-id.jpg?signature=test',
  headers: { 'Content-Type': 'image/jpeg', 'x-oss-object-acl': 'private' },
  expiresAt: '2099-01-01T00:00:00Z',
}
const sts: StsUpload = {
  mode: 'sts',
  accessKeyId: 'temporary-id',
  accessKeySecret: 'temporary-key',
  stsToken: 'temporary-token',
  region: 'oss-cn-shanghai',
  endpoint: 'https://oss-cn-shanghai.aliyuncs.com',
  bucket: 'test',
  objectKey: 'staging/test-id.jpg',
  expiresAt: '2099-01-01T00:00:00Z',
  headers: { 'x-oss-object-acl': 'private' },
}
function stubApi(upload: SignedUpload | StsUpload = signed) {
  const session: UploadSession = {
    file: record,
    upload,
    maxFileSizeBytes: maxUploadBytes,
  }
  return {
    init: vi.fn().mockResolvedValue(session),
    credentials: vi.fn().mockResolvedValue(session),
    complete: vi.fn().mockResolvedValue({ ...record, status: 'ready' }),
  } as unknown as AdminApi
}
const context = (): UploadContext => ({ phase: 'init' })
beforeEach(() => {
  sdk.options = undefined
  sdk.multipart.mockReset()
  sdk.cancel.mockReset()
})

describe('signed OSS transfers', () => {
  function fakeXhr() {
    return {
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn(),
      abort: vi.fn(),
      upload: { onprogress: undefined as any },
      status: 200,
      timeout: 0,
      onload: undefined as any,
      onerror: undefined as any,
      ontimeout: undefined as any,
      onabort: undefined as any,
    }
  }
  it('sends raw bytes with only signed OSS headers, never an administrator Authorization header', async () => {
    const xhr = fakeXhr()
    const progress = vi.fn()
    const upload = {
      ...signed,
      headers: {
        ...signed.headers,
        Authorization: 'must-never-forward',
        Cookie: 'must-never-forward',
      },
    }
    const promise = putSigned(
      file,
      upload,
      new AbortController().signal,
      progress,
      () => xhr as unknown as XMLHttpRequest,
    )
    expect(xhr.open).toHaveBeenCalledWith('PUT', signed.url)
    expect(xhr.setRequestHeader.mock.calls).toEqual([
      ['Content-Type', 'image/jpeg'],
      ['x-oss-object-acl', 'private'],
    ])
    expect(xhr.send).toHaveBeenCalledWith(file)
    xhr.upload.onprogress({ lengthComputable: true, loaded: 5, total: 10 })
    expect(progress).toHaveBeenCalledWith(0.5)
    xhr.onload()
    await expect(promise).resolves.toBeUndefined()
  })
  it('rejects failed PUT responses without confirming the file', async () => {
    const xhr = fakeXhr()
    xhr.status = 403
    const promise = putSigned(
      file,
      signed,
      new AbortController().signal,
      vi.fn(),
      () => xhr as unknown as XMLHttpRequest,
    )
    xhr.onload()
    await expect(promise).rejects.toThrow('文件直传失败')
  })
  it('cancels an in-flight transfer when the user stops', async () => {
    const xhr = fakeXhr()
    xhr.abort.mockImplementation(() => xhr.onabort())
    const abort = new AbortController()
    const promise = putSigned(
      file,
      signed,
      abort.signal,
      vi.fn(),
      () => xhr as unknown as XMLHttpRequest,
    )
    abort.abort()
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(xhr.abort).toHaveBeenCalledOnce()
  })
  it('does not start a transfer with an already aborted signal', async () => {
    const factory = vi.fn()
    const abort = new AbortController()
    abort.abort()
    await expect(
      putSigned(file, signed, abort.signal, vi.fn(), factory),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(factory).not.toHaveBeenCalled()
  })
})

describe('upload lifecycle', () => {
  it('rejects invalid files before creating server records', async () => {
    const api = stubApi()
    for (const invalid of [
      new File([], 'empty.jpg'),
      new File(['x'], '../unsafe.jpg'),
      { name: 'large.jpg', size: maxUploadBytes + 1 } as File,
    ]) {
      await expect(
        uploadManagedFile(
          invalid,
          api,
          context(),
          new AbortController().signal,
          vi.fn(),
          vi.fn(),
        ),
      ).rejects.toThrow()
    }
    expect(api.init).not.toHaveBeenCalled()
    expect(api.complete).not.toHaveBeenCalled()
    expect(() => validateUpload(file)).not.toThrow()
  })
  it('confirms only after a successful transfer and keeps the file private', async () => {
    const api = stubApi()
    const state = context()
    const transfer = vi.fn().mockResolvedValue(undefined)
    const result = await uploadManagedFile(
      file,
      api,
      state,
      new AbortController().signal,
      vi.fn(),
      transfer,
    )
    expect(api.init).toHaveBeenCalledWith(
      'photo.jpg',
      file.size,
      'image/jpeg',
      expect.any(AbortSignal),
    )
    expect(api.complete).toHaveBeenCalledWith(
      'test-id',
      expect.any(AbortSignal),
    )
    expect(result).toMatchObject({ status: 'ready', visibility: 'private' })
    expect(transfer.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(api.complete).mock.invocationCallOrder[0]!,
    )
  })
  it('renews credentials for the same record after a transfer failure', async () => {
    const api = stubApi()
    const state = context()
    const transfer = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined)
    await expect(
      uploadManagedFile(
        file,
        api,
        state,
        new AbortController().signal,
        vi.fn(),
        transfer,
      ),
    ).rejects.toThrow('offline')
    expect(api.complete).not.toHaveBeenCalled()
    await uploadManagedFile(
      file,
      api,
      state,
      new AbortController().signal,
      vi.fn(),
      transfer,
    )
    expect(api.init).toHaveBeenCalledOnce()
    expect(api.credentials).toHaveBeenCalledWith(
      'test-id',
      expect.any(AbortSignal),
    )
    expect(api.complete).toHaveBeenCalledOnce()
  })
  it('retries completion without transferring again if only finalization failed', async () => {
    const api = stubApi()
    const state = context()
    const transfer = vi.fn().mockResolvedValue(undefined)
    vi.mocked(api.complete).mockRejectedValueOnce(new Error('timeout'))
    await expect(
      uploadManagedFile(
        file,
        api,
        state,
        new AbortController().signal,
        vi.fn(),
        transfer,
      ),
    ).rejects.toThrow('timeout')
    expect(state.phase).toBe('complete')
    await uploadManagedFile(
      file,
      api,
      state,
      new AbortController().signal,
      vi.fn(),
      transfer,
    )
    expect(transfer).toHaveBeenCalledOnce()
    expect(api.credentials).not.toHaveBeenCalled()
    expect(api.complete).toHaveBeenCalledTimes(2)
  })
  it('stops before completion if a transfer is cancelled', async () => {
    const api = stubApi()
    const abort = new AbortController()
    const transfer = vi.fn().mockImplementation(async () => {
      abort.abort()
    })
    await expect(
      uploadManagedFile(file, api, context(), abort.signal, vi.fn(), transfer),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(api.complete).not.toHaveBeenCalled()
  })
  it('uploads STS data to the staging key, preserves checkpoints and renews temporary keys', async () => {
    const api = stubApi(sts)
    const state = context()
    const progress = vi.fn()
    const checkpoint = { uploadId: 'multipart-test', name: sts.objectKey }
    sdk.multipart
      .mockImplementationOnce(async (_key, _file, options) => {
        options.progress(0.5, checkpoint)
        throw new Error('connection lost')
      })
      .mockResolvedValueOnce({})
    await expect(
      uploadManagedFile(
        file,
        api,
        state,
        new AbortController().signal,
        progress,
      ),
    ).rejects.toThrow('connection lost')
    expect(state.checkpoint).toEqual(checkpoint)
    expect(progress).toHaveBeenCalledWith(0.5)
    expect(api.complete).not.toHaveBeenCalled()
    await uploadManagedFile(
      file,
      api,
      state,
      new AbortController().signal,
      progress,
    )
    expect(sdk.multipart.mock.calls[1]).toEqual([
      sts.objectKey,
      file,
      expect.objectContaining({
        checkpoint,
        parallel: 3,
        partSize: 8 * 1024 * 1024,
        headers: { 'x-oss-object-acl': 'private' },
      }),
    ])
    expect(sdk.options).toMatchObject({
      accessKeyId: 'temporary-id',
      stsToken: 'temporary-token',
      secure: true,
      authorizationV4: true,
    })
    expect(sdk.options).not.toHaveProperty('Authorization')
    expect(await sdk.options.refreshSTSToken()).toEqual({
      accessKeyId: sts.accessKeyId,
      accessKeySecret: sts.accessKeySecret,
      stsToken: sts.stsToken,
    })
    expect(api.credentials).toHaveBeenCalledWith(
      'test-id',
      expect.any(AbortSignal),
    )
  })
  it('cancels the multipart SDK when the page session is stopped', async () => {
    const api = stubApi(sts)
    const abort = new AbortController()
    sdk.multipart.mockImplementationOnce(async () => {
      abort.abort()
    })
    await expect(
      uploadManagedFile(file, api, context(), abort.signal, vi.fn()),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(sdk.cancel).toHaveBeenCalledOnce()
    expect(api.complete).not.toHaveBeenCalled()
  })
})
