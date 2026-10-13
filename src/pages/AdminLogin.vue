<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import { adminSession } from '../lib/adminSession'
import { ApiError } from '../lib/api'
import '../admin.css'

const router = useRouter()
const token = ref('')
const visible = ref(false)
const busy = ref(false)
const error = ref('')
const request = new AbortController()
async function login() {
  error.value = ''
  if (!token.value.trim() || /\s/.test(token.value.trim())) {
    error.value = '请输入完整的管理令牌，不含 Bearer 前缀。'
    return
  }
  busy.value = true
  try {
    await adminSession.signIn(token.value, request.signal)
    token.value = ''
    await router.replace({ name: 'admin' })
  } catch (cause) {
    if (!request.signal.aborted)
      error.value =
        cause instanceof ApiError
          ? cause.message
          : '暂时无法连接管理服务，请稍后重试。'
  } finally {
    busy.value = false
  }
}
onBeforeUnmount(() => {
  token.value = ''
  request.abort()
})
</script>

<template>
  <main class="admin-login">
    <section class="login-story">
      <RouterLink to="/" class="brand"
        ><span class="brand-symbol"
          ><span></span><span></span><span></span><span></span></span
        ><span class="brand-name"
          >照影 <span class="brand-slash">/</span
          ><span class="brand-en">STUDIO</span></span
        ></RouterLink
      >
      <div class="login-story-main">
        <span class="admin-eyebrow">藏影录</span>
        <h1>藏影<br /><span>成卷。</span></h1>
        <p>收存所见，随时可阅。</p>
        <div class="login-orbit" aria-hidden="true">
          <span></span><AppIcon name="sun" :size="68" />
        </div>
      </div>
      <span class="login-story-footer">照影 / ADMIN CONSOLE</span>
    </section>
    <section class="login-form-panel" aria-labelledby="login-title">
      <RouterLink to="/" class="login-back"
        ><AppIcon name="left" :size="15" /> 返回公开图库</RouterLink
      >
      <form class="login-form" @submit.prevent="login">
        <span class="admin-eyebrow">入卷</span>
        <h2 id="login-title">进入藏影录</h2>
        <p class="login-intro">输入令牌以继续。</p>
        <label for="admin-token" class="field-label">管理令牌</label>
        <div class="token-field">
          <input
            id="admin-token"
            v-model="token"
            :type="visible ? 'text' : 'password'"
            :disabled="busy"
            required
            autocomplete="off"
            autocapitalize="none"
            :spellcheck="false"
            placeholder="输入你的管理员 Token"
            aria-describedby="token-help"
          /><button
            type="button"
            :disabled="busy"
            :aria-pressed="visible"
            @click="visible = !visible"
          >
            {{ visible ? '隐藏' : '显示' }}
          </button>
        </div>
        <p id="token-help" class="field-hint">
          使用服务器配置中的 ADMIN_API_TOKEN，仅在当前页面中保存。
        </p>
        <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
        <button
          class="button button-dark login-submit"
          type="submit"
          :disabled="busy || !token.trim()"
        >
          <span v-if="busy" class="spinner"></span
          >{{ busy ? '正在验证…' : '验证并进入'
          }}<AppIcon v-if="!busy" name="arrow" :size="18" />
        </button>
        <div class="login-session-note">
          <AppIcon name="lock" :size="17" /><span
            >令牌仅保存在当前页面。</span
          >
        </div>
      </form>
      <span class="login-panel-footer">照影 · 管理入口</span>
    </section>
  </main>
</template>
