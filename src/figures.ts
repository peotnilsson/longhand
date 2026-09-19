/**
 * Getting a sketch into a sheet without filling the browser's storage.
 *
 * A calculation without its section sketch is half a calculation, but a phone
 * photograph is four megabytes and localStorage gives the whole app about five.
 * So every image is redrawn at a size a printed A4 page can actually use, and
 * the caller is told how big the result is so it can refuse a sheet that would
 * push the store over its limit.
 */

/** 1400px across is more than A4 at 300dpi needs for a 120mm-wide figure. */
const MAX_EDGE = 1400

/** Past this, one figure is a meaningful fraction of everything the browser will keep. */
export const LARGE_FIGURE = 700_000

export interface PreparedImage {
  dataUrl: string
  bytes: number
  width: number
  height: number
  /** True when the image was redrawn smaller rather than kept as it came. */
  resized: boolean
}

const readAsDataUrl = (file: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('That file could not be read.'))
    reader.readAsDataURL(file)
  })

const load = (dataUrl: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('That file is not an image this browser can open.'))
    image.src = dataUrl
  })

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    throw new Error('A figure has to be an image — a PNG, JPEG, WebP or SVG.')
  }

  const original = await readAsDataUrl(file)

  // An SVG is already small and already vector: redrawing it through a canvas
  // would turn a crisp line drawing into pixels for no gain.
  if (file.type === 'image/svg+xml') {
    return { dataUrl: original, bytes: original.length, width: 0, height: 0, resized: false }
  }

  const image = await load(original)
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight))
  const width = Math.max(1, Math.round(image.naturalWidth * scale))
  const height = Math.max(1, Math.round(image.naturalHeight * scale))

  if (scale === 1 && original.length < LARGE_FIGURE) {
    return { dataUrl: original, bytes: original.length, width, height, resized: false }
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) return { dataUrl: original, bytes: original.length, width, height, resized: false }
  context.drawImage(image, 0, 0, width, height)

  // A PNG stays a PNG: line drawings and screenshots are what people paste in,
  // and JPEG puts a halo around every line in them.
  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const dataUrl = canvas.toDataURL(type, 0.85)
  const smaller = dataUrl.length < original.length ? dataUrl : original

  return { dataUrl: smaller, bytes: smaller.length, width, height, resized: smaller !== original }
}

/** An id from a file name, so the source line reads like something a person wrote. */
export function figureId(filename: string, taken: string[]): string {
  const base =
    filename
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(\d)/, 'fig_$1')
      .slice(0, 28) || 'figure'

  if (!taken.includes(base)) return base
  for (let suffix = 2; suffix < 100; suffix += 1) {
    if (!taken.includes(`${base}_${suffix}`)) return `${base}_${suffix}`
  }
  return `${base}_${Date.now().toString(36)}`
}

/** Roughly how much of the browser's storage the figures in a sheet take. */
export const figuresSize = (figures: Record<string, string> | undefined): number =>
  Object.values(figures ?? {}).reduce((total, dataUrl) => total + dataUrl.length, 0)

export const humanSize = (bytes: number): string =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} kB`
