import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
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
 * Teach the service worker the names of the files this build produced.
 *
 * public/sw.js ships two placeholders, a build name and an empty asset list,
 * because the worker cannot know the hashed filenames until rollup has written
 * them. Filling them in here is what makes one visit enough to work offline: a
 * worker only sees requests made after it takes charge, and on a first visit
 * the page has already loaded its own scripts by then, so a worker that waits
 * to be asked caches the HTML and none of the program.
 *
 * The build name also names the cache, so activating a new build drops the old
 * one's files in the same step rather than leaving them to accumulate.
 */
const offlineShell = (): Plugin => ({
  name: 'longhand-offline-shell',
  apply: 'build',
  // After vite has copied public/ into dist, which is where sw.js arrives.
  closeBundle() {
    const dist = resolve(here, 'dist')
    const worker = join(dist, 'sw.js')
    let source: string
    try {
      source = readFileSync(worker, 'utf8')
    } catch {
      return // no worker in this build; nothing to teach
    }

    const walk = (dir: string, prefix: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(dir, entry.name), `${prefix}${entry.name}/`)
          : [`${prefix}${entry.name}`],
      )
    let assets: string[] = []
    try {
      assets = walk(join(dist, 'assets'), '/assets/').sort()
    } catch {
      /* a build with no assets directory */
    }

    // Source maps are for debugging, not for the plane: they are the largest
    // files in the build and no one needs them on a site with no coverage.
    const wanted = assets.filter((path) => !path.endsWith('.map'))
    const build = createHash('sha256').update(wanted.join('\n')).digest('hex').slice(0, 12)

    const patched = source
      .replace("'__LONGHAND_BUILD__'", JSON.stringify(build))
      .replace('const ASSETS = []', `const ASSETS = ${JSON.stringify(wanted, null, 2)}`)
    writeFileSync(worker, patched)
    this.info(`sw.js precaches ${wanted.length} files (build ${build})`)
  },
})

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
  plugins: [react(), cleanUrls(), offlineShell()],
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
