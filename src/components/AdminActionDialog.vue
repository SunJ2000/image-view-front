<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { ManagedFile } from '../lib/adminApi'
import { adminSession } from '../lib/adminSession'
import { ApiError } from '../lib/api'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  file: ManagedFile
  kind: 'rename' | 'delete' | 'publish' | 'private'
}>()
const emit = defineEmits<{ close: []; done: [message: string] }>()
const dialog = ref<HTMLDialogElement>()
const name = ref(props.file.displayName)
const busy = ref(false)
const error = ref('')
const request = new AbortController()
let previousOverflow = ''
const titles = {
  rename: '重命名文件',
  delete: '删除这个文件？',
  publish: '公开这张图片？',
  private: '撤回公开？',
}
const title = computed(() => titles[props.kind])
const descriptions = {
  rename: '修改展示名称，不会修改原始文件。',
  delete: '将删除存储中的文件，操作无法撤销。',
  publish: '公开后，任何访客都能在图库中浏览和下载这张图片。',
  private: '图片将从公开图库移除。已签发的预览链接可能继续有效至过期。',
}
async function submit() {
  error.value = ''
  if (
    props.kind === 'rename' &&
    (!name.value.trim() || /[\x00-\x1f\x7f/\\]/.test(name.value))
  ) {
    error.value = '请输入有效名称，不能包含路径或控制字符。'
    return
  }
  busy.value = true
  try {
    const api = adminSession.api
    if (props.kind === 'rename')
      await api.rename(props.file.id, name.value.trim(), request.signal)
    else if (props.kind === 'delete')
      await api.remove(props.file.id, request.signal)
    else
      await api.visibility(
        props.file.id,
        props.kind === 'publish' ? 'public' : 'private',
        request.signal,
      )
    emit(
      'done',
      {
        rename: '文件名称已更新',
        delete: '文件已删除',
        publish: '图片已公开，可在图库中查看',
        private: '图片已设为私有',
      }[props.kind],
    )
  } catch (cause) {
    if (!request.signal.aborted)
      error.value =
        cause instanceof ApiError ? cause.message : '操作暂未完成，请稍后重试。'
  } finally {
    busy.value = false
  }
}
onMounted(() => {
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  dialog.value?.showModal()
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
      class="admin-dialog"
      aria-labelledby="action-title"
      @cancel.prevent="!busy && emit('close')"
    >
      <form @submit.prevent="submit">
        <div class="admin-dialog-heading">
          <span class="dialog-symbol" :class="{ danger: kind === 'delete' }"
            ><AppIcon
              :name="
                kind === 'delete'
                  ? 'trash'
                  : kind === 'rename'
                    ? 'edit'
                    : 'image'
              "
              :size="22" /></span
          ><button
            type="button"
            class="icon-button"
            :disabled="busy"
            aria-label="关闭操作窗口"
            @click="emit('close')"
          >
            <AppIcon name="close" />
          </button>
        </div>
        <h2 id="action-title">{{ title }}</h2>
        <p class="dialog-description">{{ descriptions[kind] }}</p>
        <div class="dialog-file-name">{{ file.displayName }}</div>
        <template v-if="kind === 'rename'"
          ><label class="field-label" for="new-file-name">展示名称</label
          ><input
            id="new-file-name"
            v-model="name"
            class="admin-input"
            :disabled="busy"
            required
            maxlength="255"
            autofocus
        /></template>
        <p v-if="error" class="admin-error" role="alert">{{ error }}</p>
        <div class="dialog-actions">
          <button
            type="button"
            class="button admin-button-secondary"
            :disabled="busy"
            @click="emit('close')"
          >
            取消</button
          ><button
            type="submit"
            class="button"
            :class="kind === 'delete' ? 'button-danger' : 'button-dark'"
            :disabled="busy"
          >
            {{
              busy
                ? '正在处理…'
                : kind === 'delete'
                  ? '确认删除'
                  : kind === 'publish'
                    ? '确认公开'
                    : kind === 'private'
                      ? '设为私有'
                      : '保存名称'
            }}
          </button>
        </div>
      </form>
    </dialog></Teleport
  >
</template>
