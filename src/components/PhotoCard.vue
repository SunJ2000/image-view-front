<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { Photo } from '../lib/api'
import { errorMessage } from '../lib/api'
import { photosApi } from '../lib/photos'
import { formatDate } from '../lib/format'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ photo: Photo; index: number }>()
const route = useRoute()
const card = ref<HTMLElement>()
const url = ref('')
const loading = ref(true)
const error = ref('')
const downloadable = ref(false)
let observer: IntersectionObserver | undefined
let disposed = false
let refreshed = false
const destination = computed(() => ({
  name: 'photo',
  params: { id: props.photo.id },
  query: route.query,
  state: { fromGallery: true },
}))

async function load(force = false) {
  loading.value = true
  error.value = ''
  if (force) url.value = ''
  try {
    const preview = await photosApi.preview(props.photo.id, 'preview', force)
    if (disposed) return
    downloadable.value = !preview.previewable
    url.value = preview.previewable ? preview.url : ''
    if (!preview.previewable) loading.value = false
  } catch (cause) {
    if (!disposed) {
      error.value = errorMessage(cause)
      loading.value = false
    }
  }
}

function imageFailed() {
  if (!refreshed) {
    refreshed = true
    void load(true)
  } else {
    loading.value = false
    error.value = '图片暂时无法显示'
  }
}

function retry() {
  refreshed = false
  void load(true)
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer?.disconnect()
        void load()
      }
    },
    { rootMargin: '240px' },
  )
  if (card.value) observer.observe(card.value)
})
onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
})
</script>

<template>
  <article
    ref="card"
    class="photo-card"
    :style="{ '--card-index': index % 12 }"
  >
    <div class="photo-frame" :class="{ 'is-loading': loading }">
      <RouterLink
        :to="destination"
        class="photo-link"
        :aria-label="`查看图片：${photo.displayName}`"
      >
        <img
          v-if="url && !error"
          :src="url"
          :alt="photo.displayName"
          decoding="async"
          :class="{ loaded: !loading }"
          @load="loading = false"
          @error="imageFailed"
        />
        <span v-if="!error && !downloadable" class="photo-overlay"
          ><span>查看大图 <AppIcon name="upRight" :size="18" /></span
        ></span>
        <span v-if="downloadable" class="photo-fallback"
          ><AppIcon name="image" :size="34" /><span>此格式支持下载查看</span
          ><span class="text-small">点击查看详情</span></span
        >
      </RouterLink>
      <div v-if="error" class="photo-fallback photo-error">
        <AppIcon name="image" :size="30" /><span>{{ error }}</span>
        <button class="text-button" type="button" @click="retry">
          <AppIcon name="refresh" :size="14" /> 重新加载
        </button>
        <RouterLink :to="destination" class="text-button"
          >查看详情 <AppIcon name="arrow" :size="14"
        /></RouterLink>
      </div>
    </div>
    <div class="photo-caption">
      <RouterLink
        :to="destination"
        class="photo-name"
        :title="photo.displayName"
        >{{ photo.displayName }}</RouterLink
      >
      <span class="photo-number">{{ String(index + 1).padStart(2, '0') }}</span>
      <span class="photo-date">{{ formatDate(photo.createdAt) }}</span>
    </div>
  </article>
</template>
