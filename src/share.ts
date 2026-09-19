/**
 * A calculation as a link.
 *
 * The whole sheet is compressed and written into the URL's *hash*, which is
 * the point: a hash is never sent to the server, so a shared calculation
 * travels between two people without touching anything of ours. No account, no
 * database, nothing to keep running, and nothing to leak — the link is the
 * storage.
 *
 * The cost is that the link carries every byte of the sheet, so it is long. A
 * typical one-page calculation compresses to a few hundred characters; the
 * caller is told when a sheet has grown past the point where mail clients and
 * chat apps start wrapping or truncating it.
 */

export interface SharedSheet {
  name: string
  source: string
  /**
   * Figures travel with the sheet, since a calculation without its sketch is
   * half a calculation. Keyed by the id in the `figure` line; the caption is
   * already in the source.
   */
  figures?: Record<string, string>
  /**
   * Other sheets this one imports, by name.
   *
   * Without them the reader gets a sheet whose first line fails and whose
   * every number is undefined — technically the sheet that was shared, and
   * useless. A share has to be something that runs.
   */
  libraries?: Record<string, string>
}

/** Beyond this, some mail clients wrap the link and it stops working when clicked. */
export const LONG_LINK = 12_000

const PREFIX = 's='

/** base64url, so the payload survives being pasted into anything. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const hasCompression = (): boolean => typeof (globalThis as any).CompressionStream === 'function'

async function deflate(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new (globalThis as any).CompressionStream('deflate-raw')
  const compressed = new Blob([new TextEncoder().encode(text) as BlobPart])
    .stream()
    .pipeThrough(stream)
  return new Uint8Array(await new Response(compressed).arrayBuffer())
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new (globalThis as any).DecompressionStream('deflate-raw')
  const expanded = new Blob([bytes as BlobPart]).stream().pipeThrough(stream)
  return new Response(expanded).text()
}

/**
 * The payload is one codec character then the data, so an old link keeps
 * working when a better codec arrives: "1" is deflate-raw, "0" is the plain
 * encoding used where CompressionStream is missing.
 */
export async function encodeSheet(sheet: SharedSheet): Promise<string> {
  const json = JSON.stringify({
    n: sheet.name,
    s: sheet.source,
    f: sheet.figures,
    l: sheet.libraries,
  })
  if (hasCompression()) {
    try {
      return `1${toBase64Url(await deflate(json))}`
    } catch {
      /* fall through to the uncompressed form */
    }
  }
  return `0${toBase64Url(new TextEncoder().encode(json))}`
}

export async function decodeSheet(payload: string): Promise<SharedSheet | null> {
  try {
    const codec = payload[0]
    const bytes = fromBase64Url(payload.slice(1))
    const json =
      codec === '1' ? await inflate(bytes) : new TextDecoder().decode(bytes)
    const parsed = JSON.parse(json)
    if (typeof parsed?.s !== 'string') return null
    // A link is something a stranger sent: an entry whose value is not an
    // image data URL would otherwise go straight into an <img src>.
    const figures =
      parsed.f && typeof parsed.f === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.f as Record<string, unknown>).filter(
              ([id, value]) =>
                /^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(id) &&
                typeof value === 'string' &&
                value.startsWith('data:image/'),
            ) as [string, string][],
          )
        : undefined
    const libraries =
      parsed.l && typeof parsed.l === 'object'
        ? (Object.fromEntries(
            Object.entries(parsed.l as Record<string, unknown>).filter(
              ([, value]) => typeof value === 'string',
            ),
          ) as Record<string, string>)
        : undefined

    return {
      name: typeof parsed.n === 'string' && parsed.n.trim() ? parsed.n.slice(0, 80) : 'Shared sheet',
      source: parsed.s,
      figures: figures && Object.keys(figures).length ? figures : undefined,
      libraries: libraries && Object.keys(libraries).length ? libraries : undefined,
    }
  } catch {
    return null
  }
}

/** The full link to hand someone, built against whatever origin we are on. */
export async function shareLink(sheet: SharedSheet, origin?: string): Promise<string> {
  const base = origin ?? `${window.location.origin}/app`
  return `${base}#${PREFIX}${await encodeSheet(sheet)}`
}

/** The payload in a location hash, or null when there is not one. */
export function payloadFromHash(hash: string): string | null {
  const text = hash.startsWith('#') ? hash.slice(1) : hash
  if (!text.startsWith(PREFIX)) return null
  const payload = text.slice(PREFIX.length)
  return payload.length > 0 ? payload : null
}

/** Read a shared sheet out of the current address, if the address holds one. */
export async function sheetFromLocation(
  location: { hash: string } = window.location,
): Promise<SharedSheet | null> {
  const payload = payloadFromHash(location.hash)
  return payload ? decodeSheet(payload) : null
}

/** The sheets a source imports by name, so a share can carry them with it. */
export function importedNames(source: string): string[] {
  const names: string[] = []
  for (const line of source.split('\n')) {
    const match = line.trim().match(/^import\s+"([^"]+)"/)
    if (match) names.push(match[1])
  }
  return [...new Set(names)]
}
