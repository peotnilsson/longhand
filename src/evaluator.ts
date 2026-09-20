import { useEffect, useRef, useState } from 'react'
import { evaluateSheet, type Line, type SheetOptions } from './engine'
import type { EvaluateRequest, EvaluateResponse } from './engine/worker'

/**
 * Evaluate a sheet without blocking the person typing it.
 *
 * The work goes to a worker when the browser has one, and stays on this
 * thread when it does not — a fallback that matters more than it looks:
 * tests, the print path and any locked-down browser all take it, and a
 * calculation tool that silently shows nothing because a worker failed to
 * start would be worse than a slow one.
 *
 * The first answer is computed synchronously on purpose. A sheet that renders
 * blank for a frame and then fills in reads as a bug, and for the sheet
 * lengths most people have the synchronous pass is a few milliseconds.
 */

let worker: Worker | null = null
let unavailable = false

function evaluator(): Worker | null {
  if (unavailable) return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./engine/worker.ts', import.meta.url), { type: 'module' })
    worker.addEventListener('error', () => {
      unavailable = true
      worker = null
    })
    return worker
  } catch {
    unavailable = true
    return null
  }
}

export interface Evaluation {
  lines: Line[]
  /** True while the worker is still catching up with what is on screen. */
  computing: boolean
}

export function useEvaluation(source: string, options: SheetOptions): Evaluation {
  const settings = JSON.stringify([
    options.precision,
    options.mode,
    Object.keys(options.libraries ?? {}).sort(),
    Object.values(options.libraries ?? {}),
  ])

  const [state, setState] = useState<{ source: string; settings: string; lines: Line[] }>(() => ({
    source,
    settings,
    lines: evaluateSheet(source, options),
  }))
  const sent = useRef(0)
  const shown = useRef(0)

  useEffect(() => {
    if (state.source === source && state.settings === settings) return

    const engine = evaluator()
    if (!engine) {
      setState({ source, settings, lines: evaluateSheet(source, options) })
      return
    }

    const id = (sent.current += 1)
    const onMessage = (event: MessageEvent<EvaluateResponse>) => {
      // An answer to a sheet that has since been typed over is worthless, and
      // showing it would make the results flicker backwards.
      if (event.data.id !== id || event.data.id < shown.current) return
      shown.current = event.data.id
      setState({ source, settings, lines: event.data.lines })
    }

    engine.addEventListener('message', onMessage)
    const request: EvaluateRequest = { id, source, options }
    engine.postMessage(request)

    return () => engine.removeEventListener('message', onMessage)
    // `options` is rebuilt every render; `settings` is its stable identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, settings])

  return { lines: state.lines, computing: state.source !== source || state.settings !== settings }
}
