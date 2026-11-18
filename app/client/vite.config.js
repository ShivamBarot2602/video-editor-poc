import { defineConfig, loadEnv, searchForWorkspaceRoot } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sharedDir = path.resolve(__dirname, '../shared')

export default defineConfig(({ mode }) => {
  const isDev = mode === 'development'
  // Backend the dev/preview server proxies /api to. Configurable via
  // BACKEND_URL (.env / .env.local / shell) so a temporary backend can be
  // tested without touching this file — the same variable name Vercel
  // deployments use in middleware.js. The client itself always calls
  // relative /api — keeping every environment same-origin (no CORS, cookies
  // just work). Deployed builds route /api via middleware.js / vercel.json.
  const env = loadEnv(mode, __dirname, '')
  const apiTarget = env.BACKEND_URL
    || (isDev
      ? 'http://localhost:3001'
      : 'https://video-editor-poc.onrender.com')

  const apiProxy = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
    },
  }

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
      proxy: apiProxy,
      middlewareMode: false,
    },
    // `vite preview` (serving a production build locally) has its own proxy
    // config — without this, /api would 404 in preview builds.
    preview: {
      proxy: apiProxy,
    },
    appType: 'spa',
  }
})
