import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  base: '/image-view/',
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target:
          loadEnv(mode, process.cwd(), '').API_PROXY_TARGET ||
          'http://106.14.136.223',
        changeOrigin: true,
      },
    },
  },
}))
