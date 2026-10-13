<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { ManagedFile } from '../lib/adminApi'
import type { Preview } from '../lib/api'
import { ApiError } from '../lib/api'
import { adminSession } from '../lib/adminSession'
import { formatBytes } from '../lib/format'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ file: ManagedFile }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const preview = ref<Preview>()
const error = ref('')
const busy = ref(true)
const downloading = ref(false)
const notice = ref('')
const request = new AbortController()
let previousOverflow = ''
async function load() {
  busy.value = true
  error.value = ''
  try {
    preview.value = await adminSession.api.preview(
      props.file.id,
      'preview',
      request.signal,
    )
  } catch (cause) {
    if (!request.signal.aborted)
      error.value =
        cause instanceof ApiError ? cause.message : '图片暂时无法加载，请重试。'
  } finally {
    busy.value = false
  }
}
async function download() {
  downloading.value = true
  notice.value = ''
  try {
    const result = await adminSession.api.preview(
      props.file.id,
      'download',
      request.signal,
    )
    const link = document.createElement('a')
    link.href = result.url
    link.rel = 'noopener noreferrer'
    link.download = props.file.displayName
    document.body.append(link)
    link.click()
    link.remove()
  } catch (cause) {
    if (!request.signal.aborted)
      notice.value =
        cause instanceof ApiError ? cause.message : '暂时无法下载，请稍后重试。'
  } finally {
    downloading.value = false
  }
}
onMounted(() => {
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  dialog.value?.showModal()
  void load()
})
onBeforeUnmount(() => {
  request.abort()
  dialog.value?.close()
  document.body.style.overflow = previousOverflow
})
</script>

<template>
  <Teleport to="body"
    ><dialog
      ref="dialog"
      class="admin-dialog admin-preview"
      aria-labelledby="admin-preview-title"
      @cancel.prevent="emit('close')"
    >
      <header>
        <div>
          <h2 id="admin-preview-title">{{ file.displayName }}</h2>
          <p>
            {{ file.visibility === 'public' ? '公开' : '私有' }} ·
            {{ formatBytes(file.sizeBytes) }}
          </p>
        </div>
        <button
          class="icon-button"
          type="button"
          aria-label="关闭文件预览"
          autofocus
          @click="emit('close')"
        >
          <AppIcon name="close" />
        </button>
      </header>
      <div class="admin-preview-canvas">
        <span
          v-if="busy"
          class="spinner"
          role="status"
          aria-label="正在加载预览"
        ></span>
        <div v-else-if="error" class="admin-preview-state">
          <p role="alert">{{ error }}</p>
          <button class="button button-light" type="button" @click="load">
            重新加载
          </button>
        </div>
        <img
          v-else-if="preview?.previewable && file.mediaType === 'image'"
          :src="preview.url"
          :alt="file.displayName"
          @error="error = '图片地址可能已过期，请重新加载。'"
        /><video
          v-else-if="preview?.previewable && file.mediaType === 'video'"
          :src="preview.url"
          controls
          preload="metadata"
          @error="error = '视频无法播放，可尝试下载原文件。'"
        />
        <div v-else class="admin-preview-state">
          <AppIcon name="file" :size="42" />
          <p>此格式支持下载后查看。</p>
        </div>
      </div>
      <footer>
        <span role="status">{{ notice }}</span
        ><button
          class="button button-light"
          type="button"
          :disabled="busy || downloading"
          @click="download"
        >
          <AppIcon name="download" :size="16" />{{
            downloading ? '准备中…' : '下载文件'
          }}
        </button>
      </footer>
    </dialog></Teleport
  >
</template>
