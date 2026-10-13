import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/lib/api'
import { uploadErrorMessage } from '../src/lib/uploadErrors'

describe('upload failure messages', () => {
  it.each([
    'Please set the etag of expose-headers in OSS',
    'Failed to upload some parts with error: Error: Please set the etag of expose-headers in OSS part_num: 1',
  ])('explains a successful PUT with an unreadable ETag: %s', (message) => {
    const result = uploadErrorMessage(
      new Error(`${message}\nhttps://oss.example/file?signature=secret`),
    )
    expect(result).toContain('浏览器无法读取 ETag')
    expect(result).toContain('暴露 Headers')
    expect(result).not.toMatch(/secret|oss.example/)
  })
  it('identifies browser network/CORS failures and the exact page origin', () => {
    const failure = {
      name: 'RequestError',
      status: -1,
      message: 'secret signed request',
      request: { Authorization: 'private-token' },
    }
    const message = uploadErrorMessage(failure, 'http://127.0.0.1:5173')
    expect(message).toContain('跨域规则')
    expect(message).toContain('http://127.0.0.1:5173')
    expect(message).not.toMatch(/secret|private-token/)
  })
  it('distinguishes an OSS CORS rejection from an IAM rejection', () => {
    expect(
      uploadErrorMessage({ code: 'AccessForbidden', status: 403 }),
    ).toContain('跨域')
    expect(uploadErrorMessage({ code: 'AccessDenied', status: 403 })).toContain(
      'STS 角色',
    )
  })
  it.each(['SecurityTokenExpired', 'InvalidSecurityToken', 'ExpiredToken'])(
    'explains how to renew %s',
    (code) => {
      expect(uploadErrorMessage({ code, status: 403 })).toContain('获取新凭证')
    },
  )
  it('handles the browser SDK error name when code is missing', () => {
    expect(
      uploadErrorMessage(
        Object.assign(new Error('private raw details'), {
          name: 'ConnectionTimeoutError',
        }),
      ),
    ).toContain('超时')
  })
  it('keeps API authentication errors actionable', () => {
    expect(uploadErrorMessage(new ApiError(401, '请重新验证。'))).toBe(
      '请重新验证。',
    )
  })
  it('keeps local validation messages', () => {
    expect(uploadErrorMessage(new Error('不能上传空文件。'))).toBe(
      '不能上传空文件。',
    )
  })
  it.each(['SignatureDoesNotMatch', 'RequestTimeTooSkewed', 'NoSuchUpload'])(
    'gives a specific action for %s',
    (code) => {
      expect(uploadErrorMessage({ code, status: 403 })).not.toMatch(
        /上传未完成|STS 角色/,
      )
    },
  )
  it('never displays raw SDK messages or credentials for an unknown failure', () => {
    const message = uploadErrorMessage(
      new Error(
        'https://oss.example/file?signature=secret&token=secret temporary-key private-token',
      ),
    )
    expect(message).not.toMatch(
      /secret|temporary-key|private-token|oss.example/,
    )
  })
})
