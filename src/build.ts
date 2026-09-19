/**
 * Which build produced a calculation.
 *
 * A calculation that goes into a submission has to be reproducible: somebody
 * picks the sheet up two years later, asks why a number is what it is, and the
 * only honest answer involves knowing which version of the tool worked it out.
 * So every printed page carries this, and it costs one line of footer.
 *
 * The values are substituted at build time by vite.config.ts. In `vite dev`
 * they are still defined, and the commit reads "dev".
 */

declare const __BUILD_COMMIT__: string
declare const __BUILD_DATE__: string

const safe = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.length > 0 ? value : fallback

export const BUILD = {
  commit: safe(typeof __BUILD_COMMIT__ === 'undefined' ? undefined : __BUILD_COMMIT__, 'dev'),
  date: safe(typeof __BUILD_DATE__ === 'undefined' ? undefined : __BUILD_DATE__, 'unreleased'),
}

/** "Longhand build a1b2c3d · 2026-09-19" */
export const buildStamp = (): string => `Longhand build ${BUILD.commit} · ${BUILD.date}`

/**
 * The sentence that has to be on a printed calculation.
 *
 * It is not legal boilerplate for its own sake: this tool does the arithmetic
 * you wrote and shows its working, and whether that arithmetic is the right
 * check is a judgement it cannot make. Saying so on the page is the difference
 * between a calculation aid and something that looks like it is vouching for
 * the result.
 */
export const DISCLAIMER =
  'Produced with Longhand, a calculation aid. It performs the arithmetic written by the author and does not verify compliance with any code of practice. The author and checker named above remain responsible for the calculation.'
