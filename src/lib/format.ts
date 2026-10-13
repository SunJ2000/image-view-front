export function formatDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '日期未知'
    : new Intl.DateTimeFormat('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
        .format(date)
        .replaceAll('/', '.')
}

export function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function parsePage(value: unknown) {
  const number = Number(value)
  return Number.isInteger(number) && number >= 1 && number <= 1_000_000
    ? number
    : 1
}
