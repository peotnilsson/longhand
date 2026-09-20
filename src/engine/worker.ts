import { evaluateSheet, type SheetOptions } from './sheet'

/**
 * The sheet, evaluated off the main thread.
 *
 * Everything here runs in a Web Worker, which is the only honest answer to a
 * long sheet: `useDeferredValue` keeps React from *rendering* stale work, but
 * the evaluation itself still runs on the thread that handles keystrokes, and
 * on a 300-line sheet with tolerances that is most of a second. Moving it out
 * means typing stays at full speed no matter how long the sheet is, and the
 * results arrive when they arrive — which is what the "stale" dimming has
 * always said would happen anyway.
 *
 * The engine's incremental cache comes along for free: this module is loaded
 * once per worker, so the cache lives here and an edit still only recomputes
 * from the first changed line down.
 *
 * Only the newest request matters. A keystroke that arrives while an older
 * sheet is still being worked out makes that older answer worthless, so each
 * request carries a number and the main thread ignores anything stale.
 */
export interface EvaluateRequest {
  id: number
  source: string
  options: SheetOptions
}

export interface EvaluateResponse {
  id: number
  /** Lines are plain data — the engine already relies on that for its cold-run check. */
  lines: ReturnType<typeof evaluateSheet>
  /** How long the evaluation itself took, for the recalculation panel. */
  milliseconds: number
}

self.onmessage = (event: MessageEvent<EvaluateRequest>) => {
  const { id, source, options } = event.data
  const started = Date.now()
  const lines = evaluateSheet(source, options)
  const response: EvaluateResponse = { id, lines, milliseconds: Date.now() - started }
  ;(self as unknown as Worker).postMessage(response)
}
