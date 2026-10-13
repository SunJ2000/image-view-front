import { createPhotoApi } from './api'

export const isDemo =
  import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true'
export const photosApi = createPhotoApi('/api')

// Keep sample data and image sources out of production builds entirely.
if (import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true') {
  const demo = import('./samplePhotos')
  photosApi.list = async (...args) => (await demo).sampleApi.list(...args)
  photosApi.detail = async (...args) => (await demo).sampleApi.detail(...args)
  photosApi.preview = async (...args) => (await demo).sampleApi.preview(...args)
}
