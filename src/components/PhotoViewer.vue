<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Photo } from '../lib/api'
import { errorMessage } from '../lib/api'
import { photosApi, isDemo } from '../lib/photos'
import { formatBytes, formatDate } from '../lib/format'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ id: string; items: Photo[] }>()
const emit = defineEmits<{ close: []; navigate: [id: string] }>()
const dialog = ref<HTMLDialogElement>()
const image = ref<HTMLImageElement>()
const photo = ref<Photo>()
const url = ref('')
const loading = ref(true)
const error = ref('')
const previewable = ref(true)
const imageReady = ref(false)
const zoom = ref(1)
const downloading = ref(false)
const notice = ref('')
const dimensions = ref('')
const current = computed(() =>
  props.items.findIndex((item) => item.id === props.id),
)
const previous = computed(() =>
  current.value > 0 ? props.items[current.value - 1] : undefined,
)
const next = computed(() =>
  current.value >= 0 ? props.items[current.value + 1] : undefined,
)
let request: AbortController | undefined
let generation = 0
let imageRefreshed = false
let noticeTimer: ReturnType<typeof setTimeout> | undefined
let oldOverflow = ''
let oldTitle = ''
let previousFocus: HTMLElement | null = null

function showNotice(message: string) {
  notice.value = message
  clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = ''
  }, 3500)
}

async function load(force = false) {
  request?.abort()
  request = new AbortController()
  const signal = request.signal
  const run = ++generation
  loading.value = true
  error.value = ''
  photo.value = undefined
  url.value = ''
  imageReady.value = false
  dimensions.value = ''
  zoom.value = 1
  try {
    // Always recheck public visibility, even when this photo was in the gallery cache.
    const detail = await photosApi.detail(props.id, signal)
    if (run !== generation) return
    photo.value = detail
    document.title = `${detail.displayName} · 照影`
    const preview = await photosApi.preview(props.id, 'preview', force)
    if (run !== generation) return
    previewable.value = preview.previewable
    url.value = preview.url
  } catch (cause) {
    if (run === generation && !signal.aborted) error.value = errorMessage(cause)
  } finally {
    if (run === generation) loading.value = false
  }
}

function imageLoaded() {
  imageReady.value = true
  if (image.value)
    dimensions.value = `${image.value.naturalWidth} × ${image.value.naturalHeight}`
}

function retry() {
  imageRefreshed = false
  void load(true)
}

function imageFailed() {
  if (!imageRefreshed) {
    imageRefreshed = true
    void load(true)
  } else error.value = '图片暂时无法显示，请重新加载。'
}

async function download() {
  const id = props.id
  downloading.value = true
  try {
    // Download URLs always come from a fresh public authorization check.
    const result = await photosApi.preview(id, 'download', true)
    if (id !== props.id) return
    const link = document.createElement('a')
    link.href = result.url
    link.rel = 'noopener noreferrer'
    if (isDemo) link.target = '_blank'
    link.download = photo.value?.displayName || 'photo'
    document.body.append(link)
    link.click()
    link.remove()
  } catch (cause) {
    if (id === props.id) showNotice(errorMessage(cause))
  } finally {
    downloading.value = false
  }
}

async function share() {
  try {
    await navigator.clipboard.writeText(window.location.href)
    showNotice('图片链接已复制')
  } catch {
    showNotice('请复制浏览器地址栏中的链接')
  }
}

function keyboard(event: KeyboardEvent) {
  if (event.ctrlKey || event.altKey || event.metaKey) return
  if (event.key === 'ArrowLeft' && previous.value) {
    event.preventDefault()
    emit('navigate', previous.value.id)
  }
  if (event.key === 'ArrowRight' && next.value) {
    event.preventDefault()
    emit('navigate', next.value.id)
  }
}

watch(
  () => props.id,
  () => {
    imageRefreshed = false
    notice.value = ''
    void load()
  },
  { immediate: true },
)
onMounted(async () => {
  oldOverflow = document.body.style.overflow
  oldTitle = '照影 · 公开影像集'
  previousFocus = document.activeElement as HTMLElement | null
  document.body.style.overflow = 'hidden'
  await nextTick()
  dialog.value?.showModal()
})
onBeforeUnmount(() => {
  generation++
  request?.abort()
  clearTimeout(noticeTimer)
  document.body.style.overflow = oldOverflow
  document.title = oldTitle
  dialog.value?.close()
  previousFocus?.focus()
})
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      class="viewer"
      aria-labelledby="viewer-title"
      @cancel.prevent="emit('close')"
      @keydown="keyboard"
    >
      <header class="viewer-header">
        <div class="viewer-heading">
          <span class="viewer-mark">照影<span> / </span>IMAGE VIEW</span
          ><span class="viewer-divider"></span>
          <h2 id="viewer-title">{{ photo?.displayName || '图片预览' }}</h2>
        </div>
        <button
          class="icon-button viewer-close"
          type="button"
          aria-label="关闭预览"
          title="关闭 (Esc)"
          autofocus
          @click="emit('close')"
        >
          <AppIcon name="close" />
        </button>
      </header>
      <div class="viewer-body">
        <div class="viewer-canvas" :class="{ 'is-zoomed': zoom > 1 }">
          <div v-if="loading" class="viewer-state" role="status">
            <span class="spinner"></span>
            <p>正在打开这一帧…</p>
          </div>
          <div v-else-if="error" class="viewer-state" role="alert">
            <AppIcon name="image" :size="42" />
            <h3>暂时无法查看</h3>
            <p>{{ error }}</p>
            <button class="button button-light" type="button" @click="retry">
              <AppIcon name="refresh" :size="16" /> 重新加载
            </button>
          </div>
          <div v-else-if="!previewable" class="viewer-state">
            <AppIcon name="image" :size="42" />
            <h3>下载后查看这张图片</h3>
            <p>浏览器暂不支持此格式的在线预览。</p>
            <button
              class="button button-light"
              :disabled="downloading"
              type="button"
              @click="download"
            >
              <AppIcon name="download" :size="16" /> 下载图片
            </button>
          </div>
          <template v-else>
            <span
              v-if="!imageReady"
              class="spinner canvas-spinner"
              aria-label="图片加载中"
            ></span>
            <div
              class="viewer-image-stage"
              :style="{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }"
            >
              <img
                ref="image"
                :key="url"
                :src="url"
                :alt="photo?.displayName"
                class="viewer-image"
                :style="{
                  opacity: imageReady ? 1 : 0,
                }"
                @load="imageLoaded"
                @error="imageFailed"
                @dblclick="zoom = zoom === 1 ? 2 : 1"
              />
            </div>
          </template>
        </div>
        <button
          v-if="previous"
          class="viewer-nav viewer-prev icon-button"
          aria-label="上一张图片"
          type="button"
          @click="emit('navigate', previous.id)"
        >
          <AppIcon name="left" :size="24" />
        </button>
        <button
          v-if="next"
          class="viewer-nav viewer-next icon-button"
          aria-label="下一张图片"
          type="button"
          @click="emit('navigate', next.id)"
        >
          <AppIcon name="right" :size="24" />
        </button>
      </div>
      <footer class="viewer-footer">
        <div class="viewer-meta">
          <span>{{ photo ? formatDate(photo.createdAt) : '—' }}</span
          ><span v-if="photo?.category">{{ photo.category }}</span
          ><span v-if="photo">{{ formatBytes(photo.sizeBytes) }}</span
          ><span v-if="dimensions">{{ dimensions }}</span
          ><span v-if="current >= 0" class="viewer-position"
            >{{ current + 1 }} / {{ items.length }} <small>本页</small></span
          >
        </div>
        <div class="viewer-controls">
          <div v-if="previewable && !error && imageReady" class="zoom-controls">
            <button
              class="icon-button"
              type="button"
              aria-label="缩小图片"
              :disabled="zoom <= 1"
              @click="zoom = Math.max(1, zoom - 0.5)"
            >
              <AppIcon name="minus" :size="16" /></button
            ><button
              class="zoom-reset"
              type="button"
              title="重置缩放"
              @click="zoom = 1"
            >
              {{ Math.round(zoom * 100) }}%</button
            ><button
              class="icon-button"
              type="button"
              aria-label="放大图片"
              :disabled="zoom >= 3"
              @click="zoom = Math.min(3, zoom + 0.5)"
            >
              <AppIcon name="plus" :size="16" />
            </button>
          </div>
          <button
            class="icon-button"
            aria-label="复制图片链接"
            title="复制图片链接"
            type="button"
            @click="share"
          >
            <AppIcon name="share" :size="18" />
          </button>
          <button
            class="button button-light viewer-download"
            :disabled="!photo || !!error || loading || downloading"
            type="button"
            @click="download"
          >
            <AppIcon name="download" :size="17" />{{
              downloading ? '准备中…' : '下载原图'
            }}
          </button>
        </div>
      </footer>
      <div v-if="notice" class="viewer-notice" role="status">{{ notice }}</div>
    </dialog>
  </Teleport>
</template>
