<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../components/AppIcon.vue'
import PhotoCard from '../components/PhotoCard.vue'
import PhotoViewer from '../components/PhotoViewer.vue'
import { errorMessage, type Photo } from '../lib/api'
import { photosApi, isDemo } from '../lib/photos'
import { parsePage } from '../lib/format'

const route = useRoute()
const router = useRouter()
const pageSize = 24
const page = computed(() => parsePage(route.query.page))
const search = computed(() =>
  typeof route.query.search === 'string'
    ? route.query.search.slice(0, 100).trim()
    : '',
)
const searchInput = ref(search.value)
const items = ref<Photo[]>([])
const total = ref(0)
const loading = ref(true)
const error = ref('')
const compact = ref(false)
const about = ref<HTMLElement>()
const photoId = computed(() =>
  route.name === 'photo' ? String(route.params.id) : '',
)
const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / pageSize)),
)
const pageNumbers = computed(() =>
  Array.from(
    new Set([1, page.value - 1, page.value, page.value + 1, totalPages.value]),
  )
    .filter((n) => n >= 1 && n <= totalPages.value)
    .sort((a, b) => a - b),
)
let request: AbortController | undefined
let generation = 0

async function load() {
  request?.abort()
  request = new AbortController()
  const signal = request.signal
  const run = ++generation
  loading.value = true
  error.value = ''
  items.value = []
  total.value = 0
  try {
    const result = await photosApi.list(
      page.value,
      pageSize,
      search.value,
      signal,
    )
    if (run !== generation) return
    total.value = result.total
    if (page.value > totalPages.value) {
      await router.replace({
        name: 'gallery',
        query: {
          ...route.query,
          page: totalPages.value > 1 ? totalPages.value : undefined,
        },
      })
      return
    }
    items.value = result.items
  } catch (cause) {
    if (!signal.aborted && run === generation) error.value = errorMessage(cause)
  } finally {
    if (run === generation) loading.value = false
  }
}

function submitSearch() {
  const value = searchInput.value.trim()
  if (value === search.value && page.value === 1) return
  void router.push({ name: 'gallery', query: value ? { search: value } : {} })
}
function clearSearch() {
  searchInput.value = ''
  void router.push({ name: 'gallery' })
}
function changePage(value: number) {
  void router.push({
    name: 'gallery',
    query: { ...route.query, page: value > 1 ? value : undefined },
  })
  document
    .getElementById('gallery')
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function closeViewer() {
  if (window.history.state.fromGallery) router.back()
  else void router.replace({ name: 'gallery', query: route.query })
}
function navigatePhoto(id: string) {
  void router.replace({
    name: 'photo',
    params: { id },
    query: route.query,
    state: { fromGallery: Boolean(window.history.state.fromGallery) },
  })
}

watch(
  [page, search],
  () => {
    searchInput.value = search.value
    void load()
  },
  { immediate: true },
)
onBeforeUnmount(() => {
  generation++
  request?.abort()
})
</script>

<template>
  <div class="site-shell">
    <a class="skip-link" href="#gallery">跳转到图库</a>
    <header class="site-header">
      <RouterLink to="/" class="brand" aria-label="照影，返回影像集"
        ><span class="brand-symbol"
          ><span></span><span></span><span></span><span></span></span
        ><span class="brand-name"
          >照影<span class="brand-slash">/</span
          ><span class="brand-en">IMAGE VIEW</span></span
        ></RouterLink
      >
      <nav aria-label="主导航">
        <RouterLink :to="{ name: 'gallery' }" class="nav-link active"
          >影像集 <span class="nav-dot"></span></RouterLink
        ><button
          class="nav-link"
          type="button"
          @click="about?.scrollIntoView({ behavior: 'smooth' })"
        >
          说明 <AppIcon name="upRight" :size="15" />
        </button>
      </nav>
      <span v-if="isDemo" class="demo-badge">示例预览</span
      ><span v-else class="header-note"
        ><span class="status-dot"></span> 公开影像</span
      >
    </header>

    <main>
      <section class="hero-section" aria-labelledby="hero-title">
        <div class="hero-eyebrow">
          <span class="eyebrow-line"></span>照影小志<span
            class="hero-edition"
            >卷一</span
          >
        </div>
        <div class="hero-main">
          <h1 id="hero-title">
            所见成卷，<br /><span class="hero-accent"
              >照见<span class="accent-period">此间。</span
              ><svg
                class="accent-underline"
                viewBox="0 0 250 12"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M3 8C68 1 158 1 245 6"
                  stroke="currentColor"
                  stroke-width="3"
                  stroke-linecap="round"
                /></svg
            ></span>
          </h1>
          <div class="hero-description">
            <span class="hero-spark"><AppIcon name="sun" :size="38" /></span>
            <p>收远近山川，记朝夕所见。</p>
            <span class="hero-caption">新卷在前。</span
            ><a href="#gallery" class="explore-link"
              >入卷阅览 <span><AppIcon name="arrow" :size="18" /></span
            ></a>
          </div>
        </div>
        <div class="hero-bottom">
          <span>一卷所见</span
          ><span>新卷在前 <AppIcon name="plus" :size="14" /></span>
        </div>
      </section>

      <section
        id="gallery"
        class="gallery-section"
        aria-labelledby="gallery-title"
        :aria-busy="loading"
      >
        <div class="gallery-toolbar">
          <div class="gallery-label">
            <span class="section-dot"></span>
            <h2 id="gallery-title">{{ search ? '搜索结果' : '全部影像' }}</h2>
            <span class="count-badge">{{
              loading || error ? '—' : total
            }}</span>
          </div>
          <div class="gallery-tools">
            <form
              class="search-form"
              role="search"
              @submit.prevent="submitSearch"
            >
              <AppIcon name="search" :size="17" /><label
                class="sr-only"
                for="photo-search"
                >搜索图片名称</label
              ><input
                id="photo-search"
                v-model="searchInput"
                type="search"
                maxlength="100"
                placeholder="寻找一张照片…"
                autocomplete="off"
              /><button
                class="search-submit"
                type="submit"
                aria-label="搜索图片"
              >
                <AppIcon name="arrow" :size="16" />
              </button>
            </form>
            <span class="toolbar-divider"></span>
            <div class="view-switch" aria-label="图库排列密度">
              <button
                class="icon-button"
                :class="{ selected: !compact }"
                :aria-pressed="!compact"
                type="button"
                aria-label="舒展排列"
                title="舒展排列"
                @click="compact = false"
              >
                <AppIcon name="grid" :size="17" /></button
              ><button
                class="icon-button"
                :class="{ selected: compact }"
                :aria-pressed="compact"
                type="button"
                aria-label="紧凑排列"
                title="紧凑排列"
                @click="compact = true"
              >
                <AppIcon name="compact" :size="17" />
              </button>
            </div>
          </div>
        </div>
        <div class="gallery-subline">
          <span v-if="search"
            >关于「{{ search }}」的 {{ loading ? '…' : total }} 张影像
            <button type="button" class="text-button" @click="clearSearch">
              清除搜索 <AppIcon name="close" :size="12" /></button></span
          ><span v-else>依时而列。</span
          ><span>新卷在前 <span class="small-arrow">↓</span></span>
        </div>

        <div
          v-if="loading"
          class="photo-grid"
          :class="{ compact }"
          role="status"
          aria-label="正在加载图片"
        >
          <div v-for="n in 6" :key="n" class="skeleton-card">
            <div class="skeleton-image"></div>
            <div class="skeleton-line"></div>
          </div>
        </div>
        <div v-else-if="error" class="gallery-state" role="alert">
          <span class="state-icon"><AppIcon name="image" :size="30" /></span
          ><span class="state-eyebrow">暂不可阅</span>
          <h3>此卷暂未展开</h3>
          <p>{{ error }}</p>
          <button class="button button-dark" type="button" @click="load">
            <AppIcon name="refresh" :size="16" /> 重新加载
          </button>
        </div>
        <div v-else-if="!items.length" class="gallery-state">
          <span class="state-icon"
            ><AppIcon :name="search ? 'search' : 'sun'" :size="32" /></span
          ><span class="state-eyebrow">{{
            search ? '未有相合' : '卷中暂无'
          }}</span>
          <h3>{{ search ? '未找到相合影像' : '卷中暂无影像' }}</h3>
          <p>
            {{
              search
                ? '换个字词，再试一次。'
                : '待管理员发布影像后，此处可见。'
            }}
          </p>
          <button
            v-if="search"
            class="button button-dark"
            type="button"
            @click="clearSearch"
          >
            浏览全部影像 <AppIcon name="arrow" :size="16" />
          </button>
        </div>
        <div v-else class="photo-grid" :class="{ compact }">
          <PhotoCard
            v-for="(photo, index) in items"
            :key="photo.id"
            :photo="photo"
            :index="(page - 1) * pageSize + index"
          />
        </div>

        <nav
          v-if="!loading && !error && totalPages > 1"
          class="pagination"
          aria-label="图库分页"
        >
          <button
            type="button"
            class="page-direction"
            :disabled="page <= 1"
            @click="changePage(page - 1)"
          >
            <AppIcon name="left" :size="16" /><span>上一页</span>
          </button>
          <div class="page-numbers">
            <template v-for="(number, index) in pageNumbers" :key="number"
              ><span
                v-if="index > 0 && number - pageNumbers[index - 1]! > 1"
                class="page-ellipsis"
                >…</span
              ><button
                class="page-number"
                :class="{ current: number === page }"
                :aria-current="number === page ? 'page' : undefined"
                :aria-label="`第 ${number} 页`"
                type="button"
                @click="changePage(number)"
              >
                {{ number }}
              </button></template
            >
          </div>
          <button
            class="page-direction"
            type="button"
            :disabled="page >= totalPages"
            @click="changePage(page + 1)"
          >
            <span>下一页</span><AppIcon name="right" :size="16" />
          </button>
        </nav>
        <div v-else-if="!loading && !error && items.length" class="gallery-end">
          <span></span>
          <p>已至卷末。</p>
          <AppIcon name="sun" :size="16" /><span></span>
        </div>
      </section>
    </main>

    <footer ref="about" id="about" class="site-footer">
      <div class="footer-main">
        <div>
          <span class="footer-label">照影小记</span>
          <p>所见成卷<span>。</span></p>
        </div>
        <div class="footer-about">
          <span class="footer-about-title">小记</span>
          <p>
            公开影像，依时陈列。<br />内容由管理员维护。
          </p>
        </div>
        <a href="#" class="back-to-top" aria-label="返回顶部"
          ><AppIcon name="upRight" :size="22"
        /></a>
      </div>
      <div class="footer-bottom">
        <span>© {{ new Date().getFullYear() }} 照影 IMAGE VIEW</span
        ><span
          ><RouterLink to="/admin">管理平台</RouterLink
          ><span class="footer-dot"></span>所见成卷</span
        >
      </div>
    </footer>
  </div>
  <PhotoViewer
    v-if="photoId"
    :id="photoId"
    :items="items"
    @close="closeViewer"
    @navigate="navigatePhoto"
  />
</template>
