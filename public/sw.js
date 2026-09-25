/**
 * Longhand offline.
 *
 * Nothing here talks to a server in the first place: the sheets live in this
 * browser, the maths runs in this tab. The only reason the app needed a
 * network was to fetch itself, which is a silly reason to be unable to check
 * a beam on a site with no coverage.
 *
 * Two rules, and they follow from how the files are named. Anything under
 * /assets/ carries a content hash, so it can never go stale and is served
 * from the cache first — that is what makes a cold start instant. Everything
 * else, the HTML pages above all, is fetched from the network first and only
 * falls back to the cache when there is no network, so a deploy is picked up
 * the next time the machine is online rather than being pinned forever.
 *
 * Nothing a person types is cached here. The Cache API holds the program;
 * localStorage holds their work; the two never meet, and a shared link's
 * fragment is not sent anywhere by either of them.
 */

/**
 * The build's own name, and the list of files it is made of. Both are written
 * in at build time by the offlineShell plugin in vite.config.ts; the values
 * below are what `vite dev` sees, where there is no build to name and the
 * bundle is served unhashed from memory.
 *
 * The list matters more than it looks. A worker only sees a request the page
 * makes after the worker is in charge, and on a first visit the page has
 * already loaded its own scripts by then — so without this list, one visit
 * caches the HTML and none of the program, and the first reload with no
 * network shows nothing. Naming the files here means one visit is enough.
 */
const BUILD = '__LONGHAND_BUILD__'
const ASSETS = []

const CACHE = `longhand-shell-${BUILD}`

/** The pages that have to work offline, fetched when the worker installs. */
const PAGES = ['/', '/app', '/docs', '/privacy', '/verification']

/**
 * Fetch one file into the cache, and do not let a single failure take the
 * whole install down with it: a page or an asset that will not load now is
 * cached the first time it is asked for instead.
 */
const precache = async (cache, path) => {
  try {
    const response = await fetch(new Request(path, { cache: 'reload' }))
    if (response.ok) await cache.put(path, response)
  } catch {
    /* offline at install, or a file that is no longer there */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.all([...PAGES, ...ASSETS].map((path) => precache(cache, path))))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

/**
 * Look in the cache, and do not let a Vary header decide the answer.
 *
 * A dev or preview server answers /assets/… with `Vary: Origin`, and a module
 * script is requested with an Origin where the worker's own precache fetch had
 * none — so a strict match misses a file that is sitting right there and the
 * app fails to start offline. The files under /assets/ carry a content hash in
 * their name: one URL is one file, whatever the headers say.
 */
const cached = (request) => caches.match(request, { ignoreVary: true })

const cacheFirst = async (request) => {
  const hit = await cached(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(CACHE)
    void cache.put(request, response.clone())
  }
  return response
}

const networkFirst = async (request) => {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE)
      void cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const hit = await cached(request)
    if (hit) return hit
    // A navigation with nothing cached for it still gets the app shell, which
    // is the same program: the sheets are in this browser either way.
    if (request.mode === 'navigate') {
      const shell = await cached('/app')
      if (shell) return shell
    }
    throw error
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  // Third parties are never cached and never waited for: the counting script
  // is optional by design, and an offline machine should not be held up by it.
  if (url.origin !== self.location.origin) return

  event.respondWith(url.pathname.startsWith('/assets/') ? cacheFirst(request) : networkFirst(request))
})
