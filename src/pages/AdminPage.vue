<script setup lang="ts">
import { computed, markRaw, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from '../components/AppIcon.vue'
import AdminActionDialog from '../components/AdminActionDialog.vue'
import AdminFilePreview from '../components/AdminFilePreview.vue'
import { adminSession } from '../lib/adminSession'
import { ApiError } from '../lib/api'
import type { ManagedFile } from '../lib/adminApi'
import { formatBytes, formatDate } from '../lib/format'
import { uploadErrorMessage } from '../lib/uploadErrors'
import {
  uploadManagedFile,
  validateUpload,
  type UploadContext,
} from '../lib/upload'
import '../admin.css'

const api = adminSession.api
const items = ref<ManagedFile[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 15
const status = ref<'ready' | 'pending' | 'deleting'>('ready')
const mediaType = ref<'' | ManagedFile['mediaType']>('')
const visibility = ref<'' | ManagedFile['visibility']>('')
const searchInput = ref('')
const search = ref('')
const busy = ref(true)
const error = ref('')
const toast = ref('')
const fileInput = ref<HTMLInputElement>()
const dragActive = ref(false)
const previewFile = ref<ManagedFile>()
const action = ref<{
  file: ManagedFile
  kind: 'rename' | 'delete' | 'publish' | 'private'
}>()
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const stateLabels = {
  ready: '已入库',
  pending: '待上传',
  deleting: '删除中',
  deleted: '已删除',
}
const typeLabels = { image: '图片', video: '视频', other: '文件' }
interface UploadItem {
  uid: number
  file: File
  state: 'queued' | 'uploading' | 'done' | 'error' | 'cancelled'
  progress: number
  error: string
  context: UploadContext
}
const queue = ref<UploadItem[]>([])
const unfinished = computed(
  () =>
    queue.value.filter(
      (task) => task.state === 'queued' || task.state === 'uploading',
    ).length,
)
let nextUid = 0
let listRequest: AbortController | undefined
let currentUpload: { uid: number; request: AbortController } | undefined
let listGeneration = 0
let pumping = false
let disposed = false
let toastTimer: ReturnType<typeof setTimeout> | undefined

function notify(message: string) {
  toast.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = ''
  }, 4500)
}
async function load() {
  listRequest?.abort()
  listRequest = new AbortController()
  const signal = listRequest.signal
  const run = ++listGeneration
  busy.value = true
  error.value = ''
  try {
    const result = await api.list(
      {
        page: page.value,
        pageSize,
        status: status.value,
        mediaType: mediaType.value,
        visibility: visibility.value,
        search: search.value,
      },
      signal,
    )
    if (disposed || run !== listGeneration) return
    items.value = result.items
    total.value = result.total
    if (page.value > pages.value) page.value = pages.value
  } catch (cause) {
    if (!signal.aborted && !disposed && run === listGeneration)
      error.value =
        cause instanceof ApiError ? cause.message : '文件列表加载失败，请重试。'
  } finally {
    if (run === listGeneration) busy.value = false
  }
}
function applySearch() {
  search.value = searchInput.value.trim()
  if (page.value !== 1) page.value = 1
}
function clearFilters() {
  searchInput.value = ''
  search.value = ''
  mediaType.value = ''
  visibility.value = ''
  status.value = 'ready'
  page.value = 1
}
function completeAction(message: string) {
  action.value = undefined
  notify(message)
  void load()
}

async function pump() {
  if (pumping || disposed) return
  pumping = true
  try {
    let task: UploadItem | undefined
    while (
      !disposed &&
      (task = queue.value.find((item) => item.state === 'queued'))
    ) {
      const selected = task
      selected.state = 'uploading'
      selected.error = ''
      const request = new AbortController()
      currentUpload = { uid: selected.uid, request }
      try {
        await uploadManagedFile(
          selected.file,
          api,
          selected.context,
          request.signal,
          (ratio) => {
            if (!disposed)
              selected.progress = Math.min(99, Math.round(ratio * 100))
          },
        )
        if (disposed) break
        selected.state = 'done'
        selected.progress = 100
        notify(`${selected.file.name} 已上传，默认私有`)
        void load()
      } catch (cause) {
        if (disposed) break
        selected.state = request.signal.aborted ? 'cancelled' : 'error'
        selected.error = request.signal.aborted
          ? '已停止。服务端可能仍在保存，刷新列表可确认。'
          : uploadErrorMessage(cause, window.location.origin)
      } finally {
        currentUpload = undefined
      }
    }
  } finally {
    pumping = false
  }
}
function addFiles(files: FileList | File[] | null) {
  if (!files) return
  for (const file of Array.from(files)) {
    const task: UploadItem = {
      uid: ++nextUid,
      file: markRaw(file),
      state: 'queued',
      progress: 0,
      error: '',
      context: { phase: 'init' },
    }
    try {
      validateUpload(file)
    } catch (cause) {
      task.state = 'error'
      task.error =
        cause instanceof Error ? cause.message : '文件不符合上传要求。'
    }
    queue.value.push(task)
  }
  void pump()
}
function selectedFiles(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles(input.files)
  input.value = ''
}
function dropFiles(event: DragEvent) {
  dragActive.value = false
  addFiles(event.dataTransfer?.files || null)
}
function cancelUpload(task: UploadItem) {
  if (currentUpload?.uid === task.uid) currentUpload.request.abort()
  else task.state = 'cancelled'
}
function retryUpload(task: UploadItem) {
  task.state = 'queued'
  task.error = ''
  void pump()
}
function clearFinished() {
  queue.value = queue.value.filter(
    (task) => task.state === 'queued' || task.state === 'uploading',
  )
}

watch([status, mediaType, visibility, search], () => {
  if (page.value !== 1) page.value = 1
  else void load()
})
watch(page, () => void load())
void load()
onBeforeUnmount(() => {
  disposed = true
  listGeneration++
  listRequest?.abort()
  currentUpload?.request.abort()
  clearTimeout(toastTimer)
})
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <RouterLink to="/" class="brand"
        ><span class="brand-symbol"
          ><span></span><span></span><span></span><span></span></span
        ><span class="brand-name"
          >拾光<span class="brand-slash">/</span
          ><span class="brand-en">STUDIO</span></span
        ></RouterLink
      >
      <div class="sidebar-section-label">工作空间</div>
      <nav aria-label="管理导航">
        <RouterLink to="/admin" class="sidebar-link selected"
          ><AppIcon name="grid" :size="18" /> 文件管理
          <AppIcon name="right" :size="14" /></RouterLink
        ><button type="button" class="sidebar-link" @click="fileInput?.click()">
          <AppIcon name="upload" :size="18" /> 上传文件</button
        ><RouterLink to="/" target="_blank" class="sidebar-link"
          ><AppIcon name="upRight" :size="18" /> 公开图库</RouterLink
        >
      </nav>
      <div class="sidebar-bottom">
        <span class="sidebar-avatar">管</span>
        <div><strong>管理员</strong><span>当前页面已验证</span></div>
        <button
          type="button"
          class="icon-button"
          aria-label="退出管理平台"
          title="退出管理平台"
          @click="adminSession.signOut"
        >
          <AppIcon name="logout" :size="18" />
        </button>
      </div>
    </aside>
    <div class="admin-content">
      <header class="admin-topbar">
        <span>工作空间 <span>/</span> 文件管理</span
        ><RouterLink to="/" target="_blank"
          >查看公开图库 <AppIcon name="upRight" :size="15" /></RouterLink
        ><button
          class="mobile-logout text-button"
          type="button"
          @click="adminSession.signOut"
        >
          退出
        </button>
      </header>
      <main class="admin-main">
        <div class="admin-page-heading">
          <div>
            <span class="admin-eyebrow">YOUR PERSONAL COLLECTION</span>
            <h1>整理每一帧。</h1>
            <p>收藏、整理、分享，让好时光被看见。</p>
          </div>
          <button
            class="button button-dark"
            type="button"
            @click="fileInput?.click()"
          >
            <AppIcon name="plus" :size="18" /> 上传文件
          </button>
        </div>
        <input
          ref="fileInput"
          class="sr-only"
          type="file"
          multiple
          tabindex="-1"
          aria-label="选择上传文件"
          @change="selectedFiles"
        />
        <div
          class="upload-dropzone"
          :class="{ dragging: dragActive }"
          @dragover.prevent="dragActive = true"
          @dragleave.self="dragActive = false"
          @drop.prevent="dropFiles"
        >
          <span class="dropzone-icon"
            ><AppIcon name="upload" :size="25"
          /></span>
          <div>
            <h2>把新的片刻，放进这里</h2>
            <p>
              拖放文件到这里，或<button
                type="button"
                class="text-button"
                @click="fileInput?.click()"
              >
                选择文件</button
              >。单个文件最大 5 GB，上传后默认私有。
            </p>
          </div>
          <span class="dropzone-tag">DIRECT UPLOAD</span>
        </div>
        <section v-if="queue.length" class="upload-queue" aria-label="上传任务">
          <div class="upload-queue-heading">
            <h2>
              上传任务
              <span>{{
                unfinished ? `${unfinished} 项进行中` : '已处理'
              }}</span>
            </h2>
            <button class="text-button" type="button" @click="clearFinished">
              清除已结束任务
            </button>
          </div>
          <p class="queue-hint">
            刷新页面或退出会停止当前上传。未完成的记录可在“待上传”中清理。
          </p>
          <div v-for="task in queue" :key="task.uid" class="upload-task">
            <AppIcon
              :name="task.state === 'done' ? 'check' : 'file'"
              :size="19"
            />
            <div class="upload-task-main">
              <div>
                <strong>{{ task.file.name }}</strong
                ><span>{{
                  task.state === 'done'
                    ? '已入库 · 私有'
                    : task.state === 'queued'
                      ? '等待上传'
                      : task.state === 'uploading'
                        ? task.context.phase === 'complete'
                          ? '校验入库中…'
                          : `上传中 ${task.progress}%`
                        : task.state === 'cancelled'
                          ? '已停止'
                          : '上传未完成'
                }}</span>
              </div>
              <div v-if="task.state === 'uploading'" class="upload-progress">
                <span :style="{ width: `${task.progress}%` }"></span>
              </div>
              <p v-if="task.error" class="upload-task-error">
                {{ task.error }}
              </p>
            </div>
            <button
              v-if="task.state === 'queued' || task.state === 'uploading'"
              class="text-button"
              type="button"
              @click="cancelUpload(task)"
            >
              {{
                task.context.phase === 'complete' ? '停止等待' : '取消'
              }}</button
            ><button
              v-else-if="task.state === 'error' || task.state === 'cancelled'"
              class="text-button"
              type="button"
              @click="retryUpload(task)"
            >
              重试
            </button>
          </div>
        </section>
        <section class="admin-files" aria-labelledby="admin-files-title">
          <div class="admin-files-heading">
            <div>
              <h2 id="admin-files-title">文件库</h2>
              <span>{{ busy ? '加载中' : `当前筛选 ${total} 个文件` }}</span>
            </div>
            <button
              class="icon-button"
              :disabled="busy"
              type="button"
              aria-label="刷新文件列表"
              title="刷新"
              @click="load"
            >
              <AppIcon name="refresh" :size="17" />
            </button>
          </div>
          <div class="admin-filter-row">
            <div class="status-tabs" aria-label="文件状态">
              <button
                v-for="(label, key) in {
                  ready: '已入库',
                  pending: '待上传',
                  deleting: '删除中',
                }"
                :key="key"
                type="button"
                :class="{ selected: status === key }"
                :aria-pressed="status === key"
                @click="status = key"
              >
                {{ label }}
              </button>
            </div>
            <form
              class="admin-search"
              role="search"
              @submit.prevent="applySearch"
            >
              <AppIcon name="search" :size="16" /><input
                v-model="searchInput"
                type="search"
                maxlength="100"
                placeholder="搜索文件名称…"
                aria-label="搜索管理文件"
              /><button type="submit" aria-label="搜索文件">
                <AppIcon name="arrow" :size="15" />
              </button>
            </form>
            <select
              v-model="mediaType"
              class="admin-select"
              aria-label="文件类型"
            >
              <option value="">全部类型</option>
              <option value="image">图片</option>
              <option value="video">视频</option>
              <option value="other">其他文件</option></select
            ><select
              v-model="visibility"
              class="admin-select"
              aria-label="可见性"
            >
              <option value="">全部可见性</option>
              <option value="private">私有</option>
              <option value="public">公开</option>
            </select>
          </div>
          <div v-if="error" class="admin-list-state" role="alert">
            <AppIcon name="image" :size="35" />
            <h3>文件列表暂时无法加载</h3>
            <p>{{ error }}</p>
            <button class="button button-dark" type="button" @click="load">
              重新加载
            </button>
          </div>
          <div v-else-if="busy" class="admin-list-state" role="status">
            <span class="spinner"></span>
            <p>正在整理文件列表…</p>
          </div>
          <div v-else-if="!items.length" class="admin-list-state">
            <span class="admin-empty-icon"
              ><AppIcon name="image" :size="32"
            /></span>
            <h3>这里还没有文件</h3>
            <p>
              {{
                search || visibility || mediaType
                  ? '试试调整筛选条件，找回你要的片刻。'
                  : status === 'ready'
                    ? '上传第一份文件，开始收藏你的影像。'
                    : status === 'pending'
                      ? '暂无待上传记录。'
                      : '暂无正在删除的文件。'
              }}
            </p>
            <button
              v-if="search || visibility || mediaType"
              class="button admin-button-secondary"
              type="button"
              @click="clearFilters"
            >
              清除筛选</button
            ><button
              v-else-if="status === 'ready'"
              class="button button-dark"
              type="button"
              @click="fileInput?.click()"
            >
              选择文件 <AppIcon name="plus" :size="16" />
            </button>
          </div>
          <div v-else class="admin-table-scroll">
            <p class="admin-table-hint">左右滑动表格，查看可见性和文件操作。</p>
            <table class="admin-table">
              <thead>
                <tr>
                  <th scope="col">文件名称</th>
                  <th scope="col">类型 / 大小</th>
                  <th scope="col">可见性</th>
                  <th scope="col">创建时间</th>
                  <th scope="col" class="actions-heading">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="file in items" :key="file.id">
                  <td>
                    <div class="admin-file-cell">
                      <button
                        type="button"
                        class="file-type-icon"
                        :class="file.mediaType"
                        :disabled="file.status !== 'ready'"
                        :aria-label="`预览 ${file.displayName}`"
                        @click="previewFile = file"
                      >
                        <AppIcon
                          :name="
                            file.mediaType === 'image'
                              ? 'image'
                              : file.mediaType === 'video'
                                ? 'video'
                                : 'file'
                          "
                          :size="23"
                        />
                      </button>
                      <div>
                        <button
                          v-if="file.status === 'ready'"
                          class="file-name-button"
                          type="button"
                          @click="previewFile = file"
                        >
                          {{ file.displayName }}</button
                        ><strong v-else>{{ file.displayName }}</strong
                        ><span
                          >{{ file.originalName
                          }}<template v-if="file.status !== 'ready'">
                            · {{ stateLabels[file.status] }}</template
                          ></span
                        >
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="admin-type-label">{{
                      typeLabels[file.mediaType]
                    }}</span
                    ><span class="admin-size-label">{{
                      formatBytes(file.sizeBytes)
                    }}</span>
                  </td>
                  <td>
                    <button
                      class="visibility-pill"
                      :class="file.visibility"
                      type="button"
                      :disabled="
                        file.status !== 'ready' || file.mediaType !== 'image'
                      "
                      :title="
                        file.mediaType !== 'image'
                          ? '仅已入库图片支持公开'
                          : file.visibility === 'public'
                            ? '点击撤回公开'
                            : '点击公开图片'
                      "
                      @click="
                        action = {
                          file,
                          kind:
                            file.visibility === 'public'
                              ? 'private'
                              : 'publish',
                        }
                      "
                    >
                      <span></span
                      >{{ file.visibility === 'public' ? '公开' : '私有'
                      }}<AppIcon
                        v-if="
                          file.status === 'ready' && file.mediaType === 'image'
                        "
                        name="right"
                        :size="11"
                      />
                    </button>
                  </td>
                  <td class="admin-date-cell">
                    {{ formatDate(file.createdAt) }}
                  </td>
                  <td>
                    <div class="admin-row-actions">
                      <button
                        class="icon-button"
                        type="button"
                        :disabled="
                          file.status !== 'ready' && file.status !== 'pending'
                        "
                        :aria-label="`重命名 ${file.displayName}`"
                        title="重命名"
                        @click="action = { file, kind: 'rename' }"
                      >
                        <AppIcon name="edit" :size="16" /></button
                      ><button
                        class="icon-button delete-action"
                        type="button"
                        :aria-label="`删除 ${file.displayName}`"
                        :title="
                          file.status === 'deleting' ? '重试删除' : '删除文件'
                        "
                        @click="action = { file, kind: 'delete' }"
                      >
                        <AppIcon name="trash" :size="16" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="!busy && !error && total" class="admin-pagination">
            <span>共 {{ total }} 项 · 第 {{ page }} / {{ pages }} 页</span>
            <div>
              <button
                class="icon-button"
                type="button"
                :disabled="page <= 1"
                aria-label="管理列表上一页"
                @click="page--"
              >
                <AppIcon name="left" :size="17" /></button
              ><button
                class="icon-button"
                type="button"
                :disabled="page >= pages"
                aria-label="管理列表下一页"
                @click="page++"
              >
                <AppIcon name="right" :size="17" />
              </button>
            </div>
          </div>
        </section>
        <p class="admin-bottom-note">
          <AppIcon name="lock" :size="13" />
          文件默认私有。公开后，访客才能在图库中看到。
        </p>
      </main>
      <footer class="admin-footer">
        拾光 STUDIO <span>把片刻留住，把日常收藏。</span>
      </footer>
    </div>
    <div v-if="toast" class="admin-toast" role="status">
      <AppIcon name="check" :size="16" />{{ toast }}
    </div>
    <AdminActionDialog
      v-if="action"
      :file="action.file"
      :kind="action.kind"
      @close="action = undefined"
      @done="completeAction"
    />
    <AdminFilePreview
      v-if="previewFile"
      :file="previewFile"
      @close="previewFile = undefined"
    />
  </div>
</template>
