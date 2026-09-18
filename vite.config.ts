import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Three pages: the landing page at /, the tool at /app, the reference at /docs.
 *
 * Vercel serves app.html for /app when cleanUrls is on (see vercel.json). This
 * plugin does the same for `vite dev` and `vite preview`, so what is tested
 * locally is what is deployed — the alternative is a set of links that only
 * work in production.
 */
const cleanUrls = (): Plugin => {
  const rewrite = (request: { url?: string }, _response: unknown, next: () => void) => {
    const [path, query] = (request.url ?? '/').split('?')
    if (path === '/app' || path === '/docs') {
      request.url = `${path}.html${query ? `?${query}` : ''}`
    }
    next()
  }
  return {
    name: 'longhand-clean-urls',
    configureServer: (server) => {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer: (server) => {
      server.middlewares.use(rewrite)
    },
  }
}

export default defineConfig({
  plugins: [react(), cleanUrls()],
  build: {
    rollupOptions: {
      input: {
        landing: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app.html'),
        docs: resolve(__dirname, 'docs.html'),
      },
    },
  },
})
