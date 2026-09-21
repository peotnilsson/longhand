import { buildGraph, type Line } from './engine'

/**
 * Every symbol in a sheet, with what it holds and what it is tied to.
 *
 * `buildGraph` has been in the engine since the beginning and nothing has ever
 * shown it. On a sheet of twenty lines you can hold the dependencies in your
 * head; on a sheet of two hundred, "what would change if I changed this" is a
 * question you cannot answer by reading, and it is the question you have to
 * answer before altering anything in a calculation somebody else will check.
 */
export interface Symbol {
  name: string
  /** What the line printed: "= 250 kN*m", or "f() defined". */
  value: string
  /** Its equation number, for pointing at it. */
  equation?: number
  /** The source line it was defined on, counting from 1. */
  line: number
  /** Names it was built from, directly. */
  dependsOn: string[]
  /** Names built from it, directly. */
  usedBy: string[]
  /** True when nothing downstream uses it — often a typo, sometimes deliberate. */
  unused: boolean
  /** A measured input: written with a ± of its own. */
  measured: boolean
}

export function inspect(source: string, lines: Line[]): Symbol[] {
  const graph = buildGraph(source)

  // Reverse the graph once: for each name, who names it.
  const usedBy: Record<string, string[]> = {}
  for (const [name, references] of Object.entries(graph)) {
    for (const reference of references) {
      ;(usedBy[reference] ??= []).push(name)
    }
  }

  const symbols: Symbol[] = []
  lines.forEach((line, index) => {
    if (line.kind !== 'calc' && line.kind !== 'definition') return
    if (!line.name) return
    symbols.push({
      name: line.name,
      value: line.summary,
      equation: line.kind === 'calc' ? line.equation : undefined,
      line: index + 1,
      dependsOn: (graph[line.name] ?? []).filter((name) => name in graph || true),
      usedBy: usedBy[line.name] ?? [],
      unused: (usedBy[line.name] ?? []).length === 0,
      measured: line.kind === 'calc' && line.tolerance !== undefined && line.name in graph === false,
    })
  })

  return symbols
}

/**
 * Everything that would have to be redone if this symbol changed.
 *
 * Breadth-first through the reverse graph, which is the honest answer to "what
 * does this affect" — the direct users, then theirs, and so on to the checks
 * at the bottom of the sheet.
 */
export function downstream(symbols: Symbol[], from: string): string[] {
  const by = new Map(symbols.map((symbol) => [symbol.name, symbol]))
  const seen = new Set<string>()
  const queue = [...(by.get(from)?.usedBy ?? [])]

  while (queue.length > 0) {
    const name = queue.shift()!
    if (seen.has(name)) continue
    seen.add(name)
    for (const next of by.get(name)?.usedBy ?? []) {
      if (!seen.has(next)) queue.push(next)
    }
  }

  return [...seen]
}

/**
 * A sheet as Markdown, for pasting into a report appendix.
 *
 * The formulas go out as their printed summary rather than as TeX: somebody
 * pasting a calculation into a report wants to read it there, and a wall of
 * backslashes in a document nobody will render is worse than plain text.
 */
export function toMarkdown(title: string, lines: Line[]): string {
  const out: string[] = [`# ${title}`, '']

  for (const line of lines) {
    switch (line.kind) {
      case 'heading':
        out.push('', `${'#'.repeat(Math.min(6, line.level + 1))} ${line.text}`, '')
        break
      case 'prose':
      case 'note':
        out.push(line.text, '')
        break
      case 'calc':
      case 'definition':
        out.push(
          `- \`${line.name ?? ''}\` ${line.summary}${
            line.kind === 'calc' && line.equation ? `  *(eq. ${line.equation})*` : ''
          }`,
        )
        if (line.note) out.push(`  - ${line.note}`)
        if (line.query) out.push(`  - **Query:** ${line.query}`)
        break
      case 'check':
        out.push(`- **${line.pass ? 'OK' : 'NOT OK'}** — ${line.summary}`)
        if (line.query) out.push(`  - **Query:** ${line.query}`)
        break
      case 'figure':
        out.push('', `*Figure ${line.number}${line.caption ? ` — ${line.caption}` : ''}*`, '')
        break
      case 'table': {
        out.push('')
        out.push(`| ${line.headers.join(' | ')} |`)
        out.push(`| ${line.headers.map(() => '---').join(' | ')} |`)
        for (const row of line.rows) {
          out.push(`| ${row.map((cell) => (cell.margin ? `${cell.text} (${cell.margin})` : cell.text)).join(' | ')} |`)
        }
        out.push('')
        break
      }
      case 'error':
        out.push(`- ⚠️ \`${line.source}\` — ${line.message}`)
        break
      default:
        break
    }
  }

  return `${out.join('\n').replace(/\n{3,}/g, '\n\n')}\n`
}

/**
 * A pasted spreadsheet range, turned into a table block.
 *
 * Excel and Google Sheets both put tab-separated text on the clipboard, and
 * retyping twenty rows of section properties is the single most tedious thing
 * about starting a sheet. Blank columns are dropped and the header row is
 * taken as written, so what comes out is a block the engineer can edit rather
 * than a black box.
 */
export function tableFromPaste(text: string, name = ''): string | null {
  const rows = text
    .replace(/\r/g, '')
    .split('\n')
    .map((row) => row.split(/\t|;|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((cell) => cell.trim().replace(/^"|"$/g, '')))
    .filter((row) => row.some((cell) => cell !== ''))

  if (rows.length < 2) return null
  const width = Math.max(...rows.map((row) => row.length))
  if (width < 2) return null

  const pad = (row: string[]) => [...row, ...Array(width - row.length).fill('')]
  const widths = Array.from({ length: width }, (_column, index) =>
    Math.max(...rows.map((row) => (pad(row)[index] ?? '').length)),
  )

  const line = (row: string[]) =>
    `  ${pad(row)
      .map((cell, index) => cell.padEnd(widths[index]))
      .join(' | ')
      .trimEnd()}`

  return [`table${name ? ` ${name}` : ''}`, ...rows.map(line), 'end', ''].join('\n')
}
