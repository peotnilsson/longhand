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
const CACHE = 'longhand-shell'

/** The pages that have to work offline, fetched when the worker installs. */
const PAGES = ['/', '/app', '/docs', '/privacy', '/verification']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PAGES))
      // A page that will not fetch at install time is not worth failing the
      // install over — it will be cached the first time it is visited.
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

const cacheFirst = async (request) => {
  const cached = await caches.match(request)
  if (cached) return cached
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
    const cached = await caches.match(request)
    if (cached) return cached
    // A navigation with nothing cached for it still gets the app shell, which
    // is the same program: the sheets are in this browser either way.
    if (request.mode === 'navigate') {
      const shell = await caches.match('/app')
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
