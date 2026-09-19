/**
 * What a reviewer actually wants first: did it pass, and by how much.
 *
 * A calculation sheet buries its verdicts among the working, so the reader has
 * to scan three pages to find out whether anything failed. This pulls every
 * check in a sheet — the standalone ones and the verdict columns inside tables
 * — into one list that can sit at the top of the sheet and at the top of a
 * package.
 *
 * It works off the evaluated lines rather than re-parsing, and results are
 * aligned one-to-one with source lines, so each entry can carry the line the
 * engineer wrote and jump back to it.
 */

import type { Line } from './engine'
import { splitNote } from './engine/source'

export interface CheckSummary {
  /** Source line index: the anchor to jump to, and a stable key. */
  index: number
  /** What the engineer wrote, with any trailing note taken off. */
  label: string
  pass: boolean
  /** "46.2% spare", or a row count for a table column. */
  margin: string | null
  /** The nearest heading above it, so a long sheet stays navigable. */
  section: string | null
  /** A verdict column inside a table rather than a line of its own. */
  fromTable?: boolean
}

export interface SheetChecks {
  checks: CheckSummary[]
  passed: number
  failed: number
  /** True only when there is at least one check and none of them failed. */
  allPass: boolean
}

const EMPTY: SheetChecks = { checks: [], passed: 0, failed: 0, allPass: false }

export function summariseChecks(source: string, lines: Line[]): SheetChecks {
  if (lines.length === 0) return EMPTY
  const sourceLines = source.split('\n')
  const checks: CheckSummary[] = []
  let section: string | null = null

  lines.forEach((line, index) => {
    if (line.kind === 'heading') {
      section = line.text
      return
    }

    if (line.kind === 'check') {
      checks.push({
        index,
        label: splitNote(sourceLines[index] ?? '').body || line.summary,
        pass: line.pass,
        margin: line.margin,
        section,
      })
      return
    }

    /**
     * A table that ends in `ok = st <= f_ck` is a dozen checks written once.
     * Listing every row would drown the summary, so each verdict column
     * contributes one entry saying how many of its rows held.
     */
    if (line.kind === 'table') {
      line.headers.forEach((header, column) => {
        const cells = line.rows.map((row) => row[column]).filter((cell) => cell?.verdict)
        if (cells.length === 0) return
        const failed = cells.filter((cell) => cell.verdict === 'fail').length
        checks.push({
          index,
          label: `${header} (table, ${cells.length} row${cells.length === 1 ? '' : 's'})`,
          pass: failed === 0,
          margin:
            failed === 0
              ? `all ${cells.length} OK`
              : `${failed} of ${cells.length} over the limit`,
          section,
          fromTable: true,
        })
      })
    }
  })

  const failed = checks.filter((check) => !check.pass).length
  return {
    checks,
    passed: checks.length - failed,
    failed,
    allPass: checks.length > 0 && failed === 0,
  }
}

/** One line for the top of a package: "14 checks, 1 not OK". */
export function verdictLine(summary: SheetChecks): string {
  if (summary.checks.length === 0) return 'No checks in this sheet'
  const total = `${summary.checks.length} check${summary.checks.length === 1 ? '' : 's'}`
  return summary.failed === 0 ? `${total}, all OK` : `${total}, ${summary.failed} NOT OK`
}

/**
 * The tightest passing check, which is the number an engineer quotes when
 * asked how close the design is. Only makes sense for the percentage margins
 * the engine writes, so anything else is skipped rather than guessed at.
 */
export function tightest(summary: SheetChecks): CheckSummary | null {
  let best: { check: CheckSummary; percent: number } | null = null
  for (const check of summary.checks) {
    const match = check.margin?.match(/^([\d.]+)%\s+(spare|above the minimum)$/)
    if (!match) continue
    const percent = Number(match[1])
    if (!Number.isFinite(percent)) continue
    if (!best || percent < best.percent) best = { check, percent }
  }
  return best?.check ?? null
}
