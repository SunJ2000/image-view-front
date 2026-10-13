import { ApiError, type Photo, type Preview } from './api'

const entries = [
  ['山的另一边', 'photo-1464822759023-fed622ff2c3b'],
  ['等一场日落', 'photo-1475924156734-496f6cac6ec1'],
  ['森林来信', 'photo-1448375240586-882707db888b'],
  ['城市的呼吸', 'photo-1449824913935-59a10b8d2000'],
  ['蓝色慢调', 'photo-1507525428034-b723cf961d3e'],
  ['把时间交给山野', 'photo-1469474968028-56623f02e42e'],
  ['沿着光走', 'photo-1470071459604-3b5ec3a7fe05'],
  ['湖面没有答案', 'photo-1470770841072-f978cf4d019e'],
  ['日常的留白', 'photo-1484154218962-a197022b5858'],
  ['雪落无声', 'photo-1454496522488-7a8e488e8606'],
  ['风经过的地方', 'photo-1441974231531-c6227db76b6e'],
  ['远方也是此刻', 'photo-1500534623283-312aade485b7'],
] as const

const samples: Photo[] = entries.map(([displayName], index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  displayName,
  mimeType: 'image/jpeg',
  mediaType: 'image',
  sizeBytes: (index + 2) * 624_512,
  createdAt: `2026-10-${String(12 - index).padStart(2, '0')}T08:00:00.000Z`,
  updatedAt: `2026-10-${String(12 - index).padStart(2, '0')}T08:00:00.000Z`,
}))

function getPhoto(id: string) {
  const photo = samples.find((item) => item.id === id)
  if (!photo) throw new ApiError(404, '这张示例图片不存在。')
  return photo
}

export const sampleApi = {
  async list(
    page: number,
    pageSize: number,
    search: string,
    _signal?: AbortSignal,
  ) {
    const items = samples.filter((photo) => photo.displayName.includes(search))
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
      page,
      pageSize,
    }
  },
  async detail(id: string, _signal?: AbortSignal) {
    return getPhoto(id)
  },
  async preview(
    id: string,
    mode: 'preview' | 'download' = 'preview',
    _force = false,
  ): Promise<Preview> {
    const photo = getPhoto(id)
    const image = entries[samples.indexOf(photo)]![1]
    return {
      fileId: id,
      previewable: true,
      url: `https://images.unsplash.com/${image}?auto=format&fit=max&w=${mode === 'download' ? 2400 : 1400}&q=85`,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      disposition: mode === 'download' ? 'attachment' : 'inline',
    }
  },
}
