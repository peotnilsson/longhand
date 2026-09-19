/**
 * What changed between two versions of a sheet.
 *
 * "What changed since revision B" is the question a checking engineer asks
 * first and no calculation tool answers. It is cheap to answer here because a
 * sheet is text: a line diff, the same one a code review uses, over something
 * an engineer already reads line by line.
 *
 * Plain Myers-style longest common subsequence. Sheets are hundreds of lines,
 * not hundreds of thousands, so the simple quadratic table is the right amount
 * of machinery — it is exact, it is twenty lines, and it never surprises.
 */

export type Change =
  | { kind: 'same'; text: string; before: number; after: number }
  | { kind: 'added'; text: string; after: number }
  | { kind: 'removed'; text: string; before: number }

export interface DiffSummary {
  changes: Change[]
  added: number
  removed: number
  /** True when the two versions are the same text. */
  identical: boolean
}

export function diffLines(before: string, after: string): DiffSummary {
  const a = before.split('\n')
  const b = after.split('\n')

  // lengths[i][j] = length of the longest common subsequence of a[i:] and b[j:]
  const lengths: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  )
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1])
    }
  }

  const changes: Change[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      changes.push({ kind: 'same', text: a[i], before: i + 1, after: j + 1 })
      i += 1
      j += 1
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      changes.push({ kind: 'removed', text: a[i], before: i + 1 })
      i += 1
    } else {
      changes.push({ kind: 'added', text: b[j], after: j + 1 })
      j += 1
    }
  }
  while (i < a.length) {
    changes.push({ kind: 'removed', text: a[i], before: i + 1 })
    i += 1
  }
  while (j < b.length) {
    changes.push({ kind: 'added', text: b[j], after: j + 1 })
    j += 1
  }

  const added = changes.filter((change) => change.kind === 'added').length
  const removed = changes.filter((change) => change.kind === 'removed').length
  return { changes, added, removed, identical: added === 0 && removed === 0 }
}

/**
 * Unchanged runs collapsed, so a two-line change in a two-hundred-line sheet
 * reads as a two-line change. Three lines of context either side, which is
 * enough to see which check or which heading a change sits under.
 */
export function withContext(summary: DiffSummary, context = 3): Change[] {
  const { changes } = summary
  const keep = new Set<number>()
  changes.forEach((change, index) => {
    if (change.kind === 'same') return
    for (let at = index - context; at <= index + context; at += 1) {
      if (at >= 0 && at < changes.length) keep.add(at)
    }
  })

  const out: Change[] = []
  let skipped = 0
  changes.forEach((change, index) => {
    if (keep.has(index)) {
      if (skipped > 0) {
        out.push({ kind: 'same', text: `… ${skipped} unchanged line${skipped === 1 ? '' : 's'}`, before: -1, after: -1 })
        skipped = 0
      }
      out.push(change)
    } else {
      skipped += 1
    }
  })
  if (skipped > 0 && out.length > 0) {
    out.push({ kind: 'same', text: `… ${skipped} unchanged line${skipped === 1 ? '' : 's'}`, before: -1, after: -1 })
  }
  return out
}

/** "3 lines added, 1 removed" — the headline for a revision list. */
export function describeDiff(summary: DiffSummary): string {
  if (summary.identical) return 'No change'
  const parts: string[] = []
  if (summary.added) parts.push(`${summary.added} line${summary.added === 1 ? '' : 's'} added`)
  if (summary.removed) {
    parts.push(`${summary.removed} line${summary.removed === 1 ? '' : 's'} removed`)
  }
  return parts.join(', ')
}
