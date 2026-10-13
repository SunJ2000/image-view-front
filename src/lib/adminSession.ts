import { readonly, shallowRef } from 'vue'
import { createAdminApi } from './adminApi'

export function createAdminSession(fetcher: typeof fetch = fetch) {
  let token = ''
  let version = 0
  const authenticated = shallowRef(false)
  function signOut() {
    version++
    token = ''
    authenticated.value = false
  }
  const api = createAdminApi(
    () => token,
    signOut,
    fetcher,
    () => version,
  )
  async function signIn(value: string, signal?: AbortSignal) {
    const candidate = value.trim()
    if (!candidate || /\s/.test(candidate))
      throw new Error('请输入完整的管理令牌，不含 Bearer 前缀。')
    const attempt = ++version
    // Verify with the backend; a non-empty text field is never proof of authentication.
    await createAdminApi(
      () => candidate,
      () => {},
      fetcher,
    ).list({ pageSize: 1 }, signal)
    if (attempt !== version || signal?.aborted)
      throw new DOMException('Login cancelled', 'AbortError')
    token = candidate
    authenticated.value = true
  }
  return { authenticated: readonly(authenticated), signIn, signOut, api }
}

// Intentionally memory-only: no localStorage, sessionStorage, cookies or VITE_* secrets.
export const adminSession = createAdminSession()
