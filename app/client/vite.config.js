import { defineConfig, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sharedDir = path.resolve(__dirname, '../shared')

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'
  const apiTarget = isDev
    ? "http://localhost:3001"
    : "https://sp-video-editor-poc-backend-4m9o.onrender.com";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': sharedDir,
      },
    },
    // JASSUB constructs its worker via `new Worker(new URL('./worker/worker.js',
    // import.meta.url))`. Pre-bundling it rewrites import.meta.url to the
    // optimize-deps cache dir, which doesn't contain the sibling worker/wasm
    // files — excluding it serves the package straight from node_modules so
    // the relative URL stays correct. But excluding it also stops Vite from
    // discovering (and CJS→ESM converting) its transitive dep `throughput`,
    // which the browser can't load raw — force that one dep back in.
    optimizeDeps: {
      exclude: ['jassub'],
      include: ['jassub > throughput'],
    },
    // jassub's worker uses dynamic imports internally; Vite's default iife
    // worker format can't code-split, which fails the production build.
    worker: {
      format: 'es',
    },
    server: {
      port: 5173,
      fs: {
        allow: [searchForWorkspaceRoot(process.cwd()), sharedDir],
      },
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
