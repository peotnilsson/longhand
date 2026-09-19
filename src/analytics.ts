/**
 * Counting, without collecting anything.
 *
 * The promise on the landing page is that nothing you type leaves the browser,
 * and that promise is worth more than any measurement. So this module never
 * sees sheet content: it sends a fixed event name, an origin-plus-path URL it
 * builds itself, and at most a handful of short enumerated labels. There is no
 * cookie, no identifier, no session token and nothing that could be joined back
 * to a person.
 *
 * Two deliberate decisions behind that:
 *
 * 1. No third-party script tag. An analytics script sends `location.href`,
 *    which on this site would include a share link's hash — and a share link's
 *    hash *is* the calculation. Posting a payload we construct ourselves is the
 *    only way to be certain that never happens, so `pageUrl()` below drops the
 *    query and the hash and there is no code path that puts them back.
 *
 * 2. Off unless a domain is configured. With no VITE_ANALYTICS_DOMAIN, every
 *    function here returns without making a request, which is what happens on
 *    localhost, in the tests and in any fork.
 */

const DOMAIN: string = import.meta.env?.VITE_ANALYTICS_DOMAIN ?? ''
const ENDPOINT: string =
  import.meta.env?.VITE_ANALYTICS_HOST ?? 'https://plausible.io/api/event'

const OPT_OUT_KEY = 'longhand:no-analytics'
const FIRST_SEEN_KEY = 'longhand:first-seen'
const COUNTED_KEY = 'longhand:counted'

/** Names that may be sent. Anything else is a bug, and a test says so. */
export const EVENTS = [
  'pageview',
  'sheet created',
  'sheet substantial',
  'package printed',
  'sheet printed',
  'share created',
  'share opened',
  'example opened',
  'figure added',
  'revision restored',
  'recalculated',
  'feedback opened',
  'verification run',
] as const

export type EventName = (typeof EVENTS)[number]

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode, blocked storage: counting is never worth an error */
  }
}

/** The user's own switch, which wins over everything else here. */
export function optedOut(): boolean {
  return read(OPT_OUT_KEY) === 'yes'
}

export function setOptedOut(value: boolean): void {
  try {
    if (value) localStorage.setItem(OPT_OUT_KEY, 'yes')
    else localStorage.removeItem(OPT_OUT_KEY)
  } catch {
    /* nothing to do */
  }
}

/** Do-Not-Track and Global Privacy Control, both honoured without argument. */
function signalsNo(): boolean {
  if (typeof navigator === 'undefined') return false
  const dnt =
    (navigator as any).doNotTrack ??
    (globalThis as any).doNotTrack ??
    (window as any).external?.msTrackingProtectionEnabled
  return dnt === '1' || dnt === 'yes' || (navigator as any).globalPrivacyControl === true
}

export function enabled(): boolean {
  if (!DOMAIN) return false
  if (typeof window === 'undefined') return false
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return false
  }
  return !optedOut() && !signalsNo()
}

/**
 * Origin and path, nothing else. A share link lives entirely in the hash and
 * `?example=beam` is in the query, so both are dropped here rather than
 * filtered later.
 */
function pageUrl(): string {
  return `${window.location.origin}${window.location.pathname}`
}

/**
 * Only short enumerated labels survive. Passing a sheet name, a formula or a
 * file name into a prop would be the one way this module could leak content,
 * so the door is shut here rather than at each call site.
 */
export function cleanProps(props: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(props)) {
    if (!/^[a-z][a-z0-9_]{0,23}$/.test(key)) continue
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = String(value)
      continue
    }
    if (typeof value === 'boolean') {
      out[key] = value ? 'yes' : 'no'
      continue
    }
    if (typeof value === 'string' && /^[a-z0-9 +._-]{1,24}$/i.test(value)) {
      out[key] = value
      continue
    }
  }
  return out
}

export function track(name: EventName, props: Record<string, unknown> = {}): void {
  if (!enabled()) return
  const body = JSON.stringify({
    name,
    domain: DOMAIN,
    url: pageUrl(),
    // The referrer is whole-origin only: which site sent them, never which page.
    referrer: document.referrer ? new URL(document.referrer).origin : '',
    props: cleanProps(props),
  })
  try {
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
      mode: 'no-cors',
    }).catch(() => {
      /* a blocked or failed count is not worth a console message */
    })
  } catch {
    /* nothing to do */
  }
}

/**
 * How long since this browser first opened Longhand, as a bucket.
 *
 * This is the whole answer to "do people come back?" — the day-7 and day-30
 * questions the December decision rests on — and it needs no identifier at all:
 * a date in this browser's own storage, reported as one of four words.
 */
export type Bucket = 'first' | 'week' | 'month' | 'later'

/** The bucketing on its own, so it can be tested without a browser. */
export function bucketFor(firstSeen: number, now: number): Bucket {
  const days = Math.floor((now - firstSeen) / 86_400_000)
  if (days < 1) return 'first'
  if (days < 7) return 'week'
  if (days < 30) return 'month'
  return 'later'
}

export function returnBucket(now = Date.now()): Bucket {
  const stored = Number(read(FIRST_SEEN_KEY))
  if (!Number.isFinite(stored) || stored <= 0) {
    write(FIRST_SEEN_KEY, String(now))
    return 'first'
  }
  return bucketFor(stored, now)
}

/** Fire an event at most once ever, for things like "this sheet got long". */
export function trackOnce(key: string, name: EventName, props: Record<string, unknown> = {}): void {
  if (!enabled()) return
  const seen = (read(COUNTED_KEY) ?? '').split(',').filter(Boolean)
  if (seen.includes(key)) return
  // Bounded: this list is a guard against double-counting, not a history.
  write(COUNTED_KEY, [...seen.slice(-199), key].join(','))
  track(name, props)
}

let started = false

/** One pageview per page load, carrying only the return bucket. */
export function start(): void {
  if (started) return
  started = true
  if (!enabled()) return
  track('pageview', { seen: returnBucket() })
}

/** Where a "what's missing?" note goes when there is no server to send it to. */
export const ISSUES_URL = 'https://github.com/peotnilsson/longhand/issues'
export const FEEDBACK_EMAIL = 'peotnilsson@gmail.com'

export function issueUrl(text: string): string {
  const title = text.trim().split('\n')[0].slice(0, 70) || 'Feedback'
  const body = `${text.trim()}\n\n---\nSent from the app.`
  return `${ISSUES_URL}/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
}

export function mailtoUrl(text: string): string {
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(
    'Longhand — what is missing',
  )}&body=${encodeURIComponent(text.trim())}`
}
