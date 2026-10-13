import { ApiError } from './api'

// SDK exceptions can contain signed URLs and temporary credentials. Never render
// their raw message, stack, request or response in the page.
export function uploadErrorMessage(cause: unknown, origin = ''): string {
  if (cause instanceof ApiError) return cause.message
  if (
    cause instanceof Error &&
    /^(不能上传|单个文件|文件名|上传地址|文件直传|上传连接|上传超时|上传模式)/.test(
      cause.message,
    )
  )
    return cause.message

  const error =
    cause && typeof cause === 'object' ? (cause as Record<string, unknown>) : {}
  const code = typeof error.code === 'string' ? error.code : error.name
  const status =
    typeof error.status === 'number' ? error.status : error.statusCode
  const pageOrigin = /^https?:\/\/[^\s/]+$/.test(origin) ? `（${origin}）` : ''
  // The browser SDK throws a plain Error after a successful PUT if CORS hides
  // ETag. HTTP 200 alone does not mean the multipart upload can be completed.
  if (
    typeof error.message === 'string' &&
    /Please set the etag of expose-headers in OSS/i.test(error.message)
  )
    return '分片已传输，但浏览器无法读取 ETag。请在 OSS 跨域规则的“暴露 Headers”中添加 ETag，并确认允许 Headers 包含 x-oss-user-agent（可设为 *），保存后重试。'
  if (
    ['ConnectionTimeoutError', 'TimeoutError', 'ResponseTimeoutError'].includes(
      String(code),
    ) ||
    status === -2
  )
    return '连接 OSS 超时，请检查网络后重试。'
  if (
    ['RequestError', 'NetworkError', 'ResponseError'].includes(String(code)) ||
    status === -1 ||
    status === 0
  )
    return `无法连接 OSS，请检查网络，并确认 Bucket 跨域规则允许当前页面${pageOrigin}及上传方法、请求头。`
  if (code === 'AccessForbidden')
    return `OSS 拒绝跨域请求，请检查 Bucket 跨域规则是否允许当前页面${pageOrigin}及上传方法、请求头。`
  if (
    ['AccessDenied', 'Forbidden', 'InvalidAccessKeyId'].includes(String(code))
  )
    return 'OSS 拒绝上传，请检查临时上传凭证和 STS 角色对 staging 路径的写入权限。'
  if (
    ['SecurityTokenExpired', 'InvalidSecurityToken', 'ExpiredToken'].includes(
      String(code),
    )
  )
    return '临时上传凭证已过期或无效，点击重试以获取新凭证。'
  if (code === 'SignatureDoesNotMatch')
    return 'OSS 上传签名校验失败，请检查上传区域、请求头和签名配置。'
  if (code === 'RequestTimeTooSkewed')
    return '本机时间与 OSS 时间相差过大，请同步系统时间后重试。'
  if (code === 'NoSuchUpload')
    return '原分片上传已失效，请清除这个任务后重新选择文件上传。'
  if (status === 403)
    return 'OSS 拒绝上传，请检查临时上传凭证和 STS 角色对 staging 路径的写入权限。'
  if (
    cause instanceof Error &&
    /Failed to fetch dynamically imported module|Importing a module script failed|OSSClient is not a constructor|Calling `require`/.test(
      cause.message,
    )
  )
    return '上传组件加载失败，请刷新页面后重试。'
  return '上传未完成，请重试；若持续失败，请检查文件存储配置。'
}
