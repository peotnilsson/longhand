import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const here = import.meta.dirname

/**
 * Five pages: the landing page at /, the tool at /app, the reference at /docs,
 * the verification suite at /verification and the privacy note at /privacy.
 *
 * Vercel serves app.html for /app when cleanUrls is on (see vercel.json). This
 * plugin does the same for `vite dev` and `vite preview`, so what is tested
 * locally is what is deployed — the alternative is a set of links that only
 * work in production.
 */
const PAGES = ['app', 'docs', 'verification', 'privacy']

const cleanUrls = (): Plugin => {
  const rewrite = (request: { url?: string }, _response: unknown, next: () => void) => {
    const [path, query] = (request.url ?? '/').split('?')
    if (PAGES.includes(path.slice(1))) {
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

/**
 * Which build produced this calculation.
 *
 * A printed sheet says so in its footer, because a firm that files a
 * calculation has to be able to come back in two years and reproduce it. Vercel
 * hands the commit over in the environment; a local build asks git; a checkout
 * without git history says "dev" rather than inventing something.
 */
function buildCommit(): string {
  const fromCi = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA
  if (fromCi) return fromCi.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { cwd: here, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  plugins: [react(), cleanUrls()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(buildCommit()),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: {
    rollupOptions: {
      input: {
        landing: resolve(here, 'index.html'),
        app: resolve(here, 'app.html'),
        docs: resolve(here, 'docs.html'),
        verification: resolve(here, 'verification.html'),
        privacy: resolve(here, 'privacy.html'),
      },
    },
  },
})
