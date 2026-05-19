import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'
  const apiTarget = isDev
    ? "http://localhost:3001"
    : process.env.VITE_API_TARGET ||
      "https://sp-video-editor-poc-backend.onrender.com";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
      },
      middlewareMode: false,
    },
    appType: 'spa',
  }
})
