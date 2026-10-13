<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })
const paths: Record<string, string> = {
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4M12 15v2',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  file: 'M14 2H4v20h16V8l-6-6Zm0 0v6h6M8 13h8M8 17h6',
  video: 'M3 5h13v14H3zM16 10l5-3v10l-5-3',
  edit: 'm4 16-1 5 5-1L20 8l-4-4L4 16Zm10-10 4 4',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  logout: 'M9 3H4v18h5M10 12h11m-4-4 4 4-4 4',
  check: 'm5 12 4 4L19 6',
  search: 'm21 21-4.4-4.4M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  upRight: 'M6 18 18 6M6 6h12v12',
  close: 'm6 6 12 12M6 18 18 6',
  left: 'm14 6-6 6 6 6',
  right: 'm10 6 6 6-6 6',
  download: 'M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4',
  share:
    'M10 13a5 5 0 0 0 7 .2l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.2l-3 3a5 5 0 0 0 7 7l2-2',
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  refresh:
    'M20 7v5h-5M4 17v-5h5M5.2 8a7 7 0 0 1 11.5-3L20 8M4 16l3.3 3A7 7 0 0 0 18.8 16',
  image: 'M3 3h18v18H3zM3 16l6-6 5 5 3-3 4 4M16 7h.01',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  compact:
    'M3 3h4v4H3zM10 3h4v4h-4zM17 3h4v4h-4zM3 10h4v4H3zM10 10h4v4h-4zM17 10h4v4h-4zM3 17h4v4H3zM10 17h4v4h-4zM17 17h4v4h-4z',
  minus: 'M5 12h14',
  plus: 'M5 12h14M12 5v14',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
}
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.image" />
  </svg>
</template>
