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
 * Plausible's script is loaded by the five HTML pages with
 * `autoCapturePageviews: false`. That flag is the whole design: left on, the
 * script reports `location.href`, and on this site a share link's fragment IS
 * the calculation. With it off, the script sends nothing by itself and every
 * event goes through `track()` below, which supplies a `url` built from the
 * origin and the pathname. There is no code path that puts the query or the
 * fragment back.
 *
 * If the script is blocked, absent or still loading, every function here
 * returns without doing anything — which is also what happens on localhost and
 * in the tests.
 */

type Plausible = (name: string, options?: { url?: string; props?: Record<string, string> }) => void

const plausible = (): Plausible | null => {
  const found = (window as unknown as { plausible?: Plausible }).plausible
  return typeof found === 'function' ? found : null
}

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
  'palette used',
  'table imported',
  'sheet signed',
  'exported',
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
  if (typeof window === 'undefined') return false
  if (!plausible()) return false
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return false
  }
  return !optedOut() && !signalsNo()
}

/**
 * The keys a prop may have, and the words a string prop may be.
 *
 * Both are allowlists rather than patterns, and that is the whole point. The
 * first version of this filter accepted any short string of letters, which a
 * test immediately showed to be useless: "Client X foundation" is nineteen
 * letters and spaces and would have sailed through. A pattern describes what
 * content looks like; a list of nine words cannot be talked into carrying a
 * sheet name, a formula or a file name however a future call site is written.
 *
 * Numbers are safe because they are counted things — how many sheets, how many
 * lines — and a number cannot be prose.
 */
const PROP_KEYS = [
  'seen',
  'to',
  'from',
  'paged',
  'long',
  'sheets',
  'lines',
  'passed',
  'failed',
] as const

const PROP_WORDS = [
  'latex',
  'pdf',
  'word',
  'markdown',
  'first',
  'week',
  'month',
  'later',
  'github',
  'email',
  'share',
  'yes',
  'no',
] as const

export function cleanProps(props: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(props)) {
    if (!(PROP_KEYS as readonly string[]).includes(key)) continue
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = String(Math.round(value))
      continue
    }
    if (typeof value === 'boolean') {
      out[key] = value ? 'yes' : 'no'
      continue
    }
    if (typeof value === 'string' && (PROP_WORDS as readonly string[]).includes(value)) {
      out[key] = value
    }
  }
  return out
}

export interface Payload {
  name: string
  url: string
  props: Record<string, string>
}

/**
 * The exact arguments that go to Plausible, built where a test can see them.
 *
 * This is the single most important function in the module. Plausible's script
 * would otherwise report `location.href`, and on this site that would put an
 * entire shared calculation into a third party's logs. Assembling the url from
 * origin and pathname rather than trimming an href means there is no version
 * of this that "forgets" to strip something.
 */
export function payloadFor(
  name: EventName,
  props: Record<string, unknown>,
  location: { origin: string; pathname: string },
): Payload {
  return {
    name,
    url: `${location.origin}${location.pathname}`,
    props: cleanProps(props),
  }
}

export function track(name: EventName, props: Record<string, unknown> = {}): void {
  const send = plausible()
  if (!send || !enabled()) return
  const payload = payloadFor(name, props, window.location)
  try {
    send(payload.name, { url: payload.url, props: payload.props })
  } catch {
    /* a count that fails is never worth an error in someone's calculation */
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
