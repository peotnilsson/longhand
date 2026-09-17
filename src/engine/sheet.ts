import type { MathNode } from 'mathjs'
import {
  math,
  formatValue,
  formatLike,
  formatNumber,
  isUnitValue,
  displayUnit,
  toNumberIn,
} from './units'
import { symbolToTex, toTex, valueToTex, sameTex } from './tex'
import {
  collectSymbols,
  propagate,
  splitTolerance,
  type Contribution,
  type ToleranceMode,
} from './uncertainty'

export type { ToleranceMode }

export interface ToleranceView {
  /** "± 0.4 MPa" */
  text: string
  contributions: { name: string; share: number; amount: string }[]
}

export interface TableCell {
  text: string
  verdict?: 'pass' | 'fail'
}

export interface PlotData {
  yLabel: string
  xLabel: string
  points: { x: number; y: number }[]
}

export type Line =
  | { kind: 'blank' }
  | { kind: 'heading'; text: string; level: number }
  | { kind: 'prose'; text: string }
  | { kind: 'note'; text: string }
  | { kind: 'calc'; tex: string; summary: string; tolerance?: ToleranceView }
  | { kind: 'definition'; tex: string; summary: string }
  | { kind: 'check'; tex: string; pass: boolean; margin: string | null; summary: string }
  | { kind: 'table'; headers: string[]; rows: TableCell[][]; summary: string }
  | { kind: 'plot'; data: PlotData; summary: string }
  | { kind: 'error'; source: string; message: string }

interface Definition {
  name: string
  node: MathNode
}

interface Context {
  scope: Record<string, unknown>
  sigmas: Record<string, unknown>
  definitions: Definition[]
}

export interface SheetOptions {
  precision?: number
  mode?: ToleranceMode
  /** Other sheets available to `import "name"`. */
  libraries?: Record<string, string>
}

const COMPARISONS = new Set(['<=', '>=', '<', '>', '==', '!='])
const COMPARISON_TEX: Record<string, string> = {
  '<=': '\\le',
  '>=': '\\ge',
  '<': '<',
  '>': '>',
  '==': '=',
  '!=': '\\ne',
}

const cloneContext = (context: Context): Context => ({
  scope: { ...context.scope },
  sigmas: { ...context.sigmas },
  definitions: [...context.definitions],
})

// ---------------------------------------------------------------- dependencies

/** name -> names it references. Used for error messages and for the UI. */
export function buildGraph(source: string): Record<string, string[]> {
  const graph: Record<string, string[]> = {}
  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue
    try {
      const node = math.parse(line.split('->')[0])
      const type = (node as any).type
      if (type === 'AssignmentNode' || type === 'FunctionAssignmentNode') {
        const name = (node as any).name ?? (node as any).object?.name
        if (name) graph[name] = collectSymbols((node as any).value ?? (node as any).expr)
      }
    } catch {
      /* unparseable lines contribute nothing */
    }
  }
  return graph
}

/** Every name the sheet assigns, so we can tell a typo from a forward reference. */
function definedNames(source: string): Set<string> {
  const names = new Set<string>()
  for (const raw of source.split('\n')) {
    const match = raw.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(|=)/)
    if (match) names.add(match[1])
  }
  return names
}

function explain(error: unknown, defined: Set<string>): string {
  const message = error instanceof Error ? error.message : String(error)
  const undefinedSymbol = message.match(/Undefined symbol ([A-Za-z_][A-Za-z0-9_]*)/)
  if (undefinedSymbol && defined.has(undefinedSymbol[1])) {
    return `${undefinedSymbol[1]} is used here but defined further down. Move it above this line — or, if each defines the other, that is a circular reference.`
  }
  return message
}

// ---------------------------------------------------------------- tolerance view

function toleranceView(
  sigma: unknown,
  contributions: Contribution[],
  value: unknown,
  precision: number,
): ToleranceView {
  return {
    text: `± ${formatLike(sigma, value, precision)}`,
    contributions: contributions
      .filter((contribution) => contribution.share >= 0.005)
      .map((contribution) => ({
        name: contribution.name,
        share: contribution.share,
        amount: formatLike(contribution.amount, value, precision),
      })),
  }
}

// ---------------------------------------------------------------- single lines

function evaluateStatement(
  line: string,
  context: Context,
  options: Required<Pick<SheetOptions, 'precision' | 'mode'>>,
  defined: Set<string>,
): Line {
  const { precision, mode } = options

  // Optional display unit:  sigma = M_Ed/W  -> MPa
  let body = line
  let displayUnit: string | null = null
  const arrow = line.lastIndexOf('->')
  if (arrow !== -1) {
    body = line.slice(0, arrow).trim()
    displayUnit = line.slice(arrow + 2).trim()
  }

  // Optional uncertainty:  b = 300 mm ± 2 mm
  let sigmaSource: string | null = null
  const assignment = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/)
  if (assignment) {
    const split = splitTolerance(assignment[2])
    if (split) {
      body = `${assignment[1]} = ${split.value}`
      sigmaSource = split.sigma
    }
  }

  try {
    const node = math.parse(body)
    const type = (node as any).type

    // ---- function definition:  A(d) = pi*d^2/4
    if (type === 'FunctionAssignmentNode') {
      node.evaluate(context.scope)
      context.definitions.push({ name: (node as any).name, node })
      return {
        kind: 'definition',
        tex: toTex(node, context.scope),
        summary: `${(node as any).name}() defined`,
      }
    }

    // ---- check:  sigma <= f_ck
    if (type === 'OperatorNode' && COMPARISONS.has((node as any).op)) {
      const [leftNode, rightNode] = (node as any).args
      const left = leftNode.evaluate(context.scope)
      const right = rightNode.evaluate(context.scope)
      const pass = Boolean(node.evaluate(context.scope))
      const operator = COMPARISON_TEX[(node as any).op]

      const symbolic = `${toTex(leftNode, context.scope)} ${operator} ${toTex(rightNode, context.scope)}`
      const values = `${valueToTex(formatValue(left, precision), context.scope)} ${operator} ${valueToTex(formatLike(right, left, precision), context.scope)}`

      let margin: string | null = null
      try {
        const ratio = Math.abs(math.number(math.divide(left as any, right as any) as any))
        const op = (node as any).op
        if (op === '<=' || op === '<') {
          const percent = (1 - ratio) * 100
          margin =
            percent >= 0
              ? `${percent.toFixed(1)}% spare`
              : `${Math.abs(percent).toFixed(1)}% over the limit`
        }
        if (op === '>=' || op === '>') {
          const percent = (ratio - 1) * 100
          margin =
            percent >= 0
              ? `${percent.toFixed(1)}% above the minimum`
              : `${Math.abs(percent).toFixed(1)}% short`
        }
      } catch {
        /* incommensurable sides: no meaningful margin */
      }

      const tex = sameTex(symbolic, values) ? symbolic : `${symbolic} = ${values}`
      const verdict = pass ? 'OK' : 'NOT OK'
      return {
        kind: 'check',
        tex,
        pass,
        margin,
        summary: margin ? `${verdict} — ${margin}` : verdict,
      }
    }

    // ---- assignment or bare expression
    let value = node.evaluate(context.scope)
    if (displayUnit) {
      if (!isUnitValue(value)) throw new Error(`Cannot convert a plain number to ${displayUnit}`)
      value = (value as any).to(displayUnit)
    }

    const isAssignment = type === 'AssignmentNode'
    const name: string | null = isAssignment ? (node as any).object.name : null
    if (isAssignment) {
      context.scope[name!] = value
      context.definitions.push({ name: name!, node })
    }

    const rhs: MathNode = isAssignment ? (node as any).value : node

    // uncertainty: explicit on this line, or propagated from uncertain inputs
    let tolerance: ToleranceView | undefined
    if (sigmaSource) {
      const sigma = math.parse(sigmaSource).evaluate(context.scope)
      if (name) context.sigmas[name] = sigma
      tolerance = toleranceView(sigma, [], value, precision)
    } else {
      const propagated = propagate(rhs, context.scope, context.sigmas, mode)
      if (propagated) {
        if (name) context.sigmas[name] = propagated.sigma
        tolerance = toleranceView(propagated.sigma, propagated.contributions, value, precision)
      }
    }

    const shown = formatValue(value, precision)
    const stages: string[] = []
    for (const stage of [
      toTex(rhs, context.scope),
      toTex(substitute(rhs, context.scope, precision), context.scope),
      valueToTex(shown, context.scope),
    ]) {
      const previous = stages[stages.length - 1]
      if (previous === undefined || !sameTex(previous, stage)) stages.push(stage)
    }

    const lhs = name ? `${symbolToTex(name, context.scope)} = ` : ''
    return {
      kind: 'calc',
      tex: lhs + stages.join(' = '),
      summary: tolerance ? `= ${shown} ${tolerance.text}` : `= ${shown}`,
      tolerance,
    }
  } catch (error) {
    return { kind: 'error', source: line, message: explain(error, defined) }
  }
}

/**
 * Replace every symbol with its current value, so a reader can see the numbers
 * that went in. This substituted middle stage is the point of the product.
 */
function substitute(
  node: MathNode,
  scope: Record<string, unknown>,
  precision: number,
): MathNode {
  return node.transform((n: any, path: string, parent: any) => {
    const isFunctionName = parent && parent.isFunctionNode && path === 'fn'
    if (n.isSymbolNode && !isFunctionName) {
      const value = scope[n.name]
      if (value !== undefined && typeof value !== 'function') {
        try {
          return math.parse(formatValue(value, precision))
        } catch {
          return n
        }
      }
    }
    return n
  })
}

// ---------------------------------------------------------------- blocks

function evaluateTable(
  block: string[],
  context: Context,
  precision: number,
  defined: Set<string>,
): Line {
  const [headerRow, ...dataRows] = block
  if (!headerRow) return { kind: 'error', source: 'table', message: 'A table needs a header row.' }

  const columns = headerRow.split('|').map((cell) => {
    const text = cell.trim()
    const computed = text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/)
    return computed
      ? { name: computed[1], expression: computed[2], input: false }
      : { name: text, expression: null as string | null, input: true }
  })

  const inputs = columns.filter((column) => column.input)
  const rows: TableCell[][] = []

  for (const raw of dataRows) {
    const cells = raw.split('|').map((cell) => cell.trim())
    const rowScope: Record<string, unknown> = { ...context.scope }
    const out: TableCell[] = []
    let failed = false

    inputs.forEach((column, index) => {
      if (failed) return
      const cell = cells[index] ?? ''
      // A bare word that is not a defined value is a label, not an expression -
      // otherwise a section called "A" would be evaluated as one ampere.
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(cell) && rowScope[cell] === undefined) {
        out.push({ text: cell })
        return
      }
      try {
        const value = math.parse(cell).evaluate(rowScope)
        rowScope[column.name] = value
        out.push({ text: formatValue(value, precision) })
      } catch (error) {
        out.push({ text: explain(error, defined) })
        failed = true
      }
    })

    for (const column of columns.filter((c) => !c.input)) {
      if (failed) {
        out.push({ text: '—' })
        continue
      }
      try {
        const value = math.parse(column.expression!).evaluate(rowScope)
        rowScope[column.name] = value
        if (typeof value === 'boolean') {
          out.push({ text: value ? 'OK' : 'NOT OK', verdict: value ? 'pass' : 'fail' })
        } else {
          out.push({ text: formatValue(value, precision) })
        }
      } catch (error) {
        out.push({ text: explain(error, defined) })
      }
    }

    rows.push(out)
  }

  return {
    kind: 'table',
    headers: columns.map((column) => column.name),
    rows,
    summary: `${rows.length} row${rows.length === 1 ? '' : 's'}`,
  }
}

const SAMPLES = 48

function evaluatePlot(line: string, context: Context, defined: Set<string>): Line {
  const match = line.match(
    /^plot\s+(.+?)\s+vs\s+([A-Za-z_][A-Za-z0-9_]*)\s+from\s+(.+?)\s+to\s+(.+)$/,
  )
  if (!match) {
    return {
      kind: 'error',
      source: line,
      message: 'Write a plot as:  plot sigma vs b from 200 mm to 400 mm',
    }
  }

  const [, expression, variable, fromSource, toSource] = match

  try {
    const exprNode = math.parse(expression)
    const from = math.parse(fromSource).evaluate(context.scope)
    const to = math.parse(toSource).evaluate(context.scope)

    const xUnit = displayUnit(from)
    const xFrom = toNumberIn(from, xUnit)
    const xTo = toNumberIn(to, xUnit)

    const points: { x: number; y: number }[] = []
    let yUnit: string | null = null

    for (let index = 0; index <= SAMPLES; index += 1) {
      const x = xFrom + ((xTo - xFrom) * index) / SAMPLES
      const sample = xUnit ? math.unit(x, xUnit) : x
      // Re-run the sheet's definitions with this variable overridden, which is
      // what makes plotting a derived quantity possible at all.
      const scope: Record<string, unknown> = { [variable]: sample }
      for (const definition of context.definitions) {
        if (definition.name === variable) continue
        try {
          definition.node.evaluate(scope)
        } catch {
          /* a definition that cannot run under this override is skipped */
        }
      }
      const y = exprNode.evaluate(scope)
      if (yUnit === null) yUnit = displayUnit(y)
      const yValue = toNumberIn(y, yUnit)
      if (Number.isFinite(yValue)) points.push({ x, y: yValue })
    }

    if (points.length < 2) throw new Error('Nothing plottable came out of that expression.')

    return {
      kind: 'plot',
      data: {
        xLabel: xUnit ? `${variable} [${xUnit}]` : variable,
        yLabel: yUnit ? `${expression} [${yUnit}]` : expression,
        points,
      },
      summary: `${points.length} points`,
    }
  } catch (error) {
    return { kind: 'error', source: line, message: explain(error, defined) }
  }
}

function evaluateImport(
  line: string,
  context: Context,
  options: Required<Pick<SheetOptions, 'precision' | 'mode'>>,
  libraries: Record<string, string>,
  depth: number,
): Line {
  const match = line.match(/^import\s+"([^"]+)"$/)
  if (!match) {
    return { kind: 'error', source: line, message: 'Write an import as:  import "my-formulas"' }
  }
  const name = match[1]
  const source = libraries[name]
  if (source === undefined) {
    return { kind: 'error', source: line, message: `No sheet called "${name}" to import.` }
  }
  if (depth > 3) {
    return { kind: 'error', source: line, message: 'Imports are nested too deeply.' }
  }

  const before = Object.keys(context.scope).length
  runLines(source.split('\n'), context, options, libraries, definedNames(source), depth + 1, [])
  const added = Object.keys(context.scope).length - before
  return {
    kind: 'note',
    text: `Imported "${name}" — ${added} definition${added === 1 ? '' : 's'} available.`,
  }
}

// ---------------------------------------------------------------- the sheet

/**
 * Walk the lines, mutating `context`. `results` receives one Line per source
 * line so that line numbers stay aligned with the editor.
 */
function runLines(
  lines: string[],
  context: Context,
  options: Required<Pick<SheetOptions, 'precision' | 'mode'>>,
  libraries: Record<string, string>,
  defined: Set<string>,
  depth: number,
  results: Line[],
  snapshots?: Context[],
  startIndex = 0,
): void {
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index].trim()
    let result: Line

    if (line === '') {
      result = { kind: 'blank' }
    } else if (line.startsWith('#')) {
      result = {
        kind: 'heading',
        text: line.replace(/^#+\s*/, ''),
        level: line.match(/^#+/)![0].length,
      }
    } else if (line.startsWith('//')) {
      result = { kind: 'prose', text: line.replace(/^\/\/\s*/, '') }
    } else if (/^import\b/.test(line)) {
      result = evaluateImport(line, context, options, libraries, depth)
    } else if (/^plot\b/.test(line)) {
      result = evaluatePlot(line, context, defined)
    } else if (/^table\b/.test(line)) {
      const block: string[] = []
      let cursor = index + 1
      while (cursor < lines.length && lines[cursor].trim() !== 'end') {
        if (lines[cursor].trim() !== '') block.push(lines[cursor])
        cursor += 1
      }
      result = evaluateTable(block, context, options.precision, defined)
      results.push(result)
      snapshots?.push(cloneContext(context))
      for (let filler = index + 1; filler <= Math.min(cursor, lines.length - 1); filler += 1) {
        results.push({ kind: 'blank' })
        snapshots?.push(cloneContext(context))
      }
      index = cursor
      continue
    } else {
      result = evaluateStatement(line, context, options, defined)
    }

    results.push(result)
    snapshots?.push(cloneContext(context))
  }
}

/** Index of the first line of the block containing `index`, for cache reuse. */
function blockStart(lines: string[], index: number): number {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const line = lines[cursor].trim()
    if (/^table\b/.test(line)) return cursor
    if (line === 'end') break
  }
  return index
}

interface Cache {
  key: string
  lines: string[]
  results: Line[]
  snapshots: Context[]
}

let cache: Cache | null = null

export function evaluateSheet(source: string, options: SheetOptions = {}): Line[] {
  const precision = options.precision ?? 4
  const mode = options.mode ?? 'quadrature'
  const libraries = options.libraries ?? {}
  const settings = { precision, mode }

  const lines = source.split('\n')
  const defined = definedNames(source)
  const key = JSON.stringify([precision, mode, Object.keys(libraries).sort(), Object.values(libraries)])

  // Incremental recompute: everything above the first edited line is unchanged,
  // because evaluation is strictly sequential.
  let start = 0
  let context: Context = { scope: {}, sigmas: {}, definitions: [] }
  const results: Line[] = []
  const snapshots: Context[] = []

  if (cache && cache.key === key) {
    let first = 0
    while (
      first < lines.length &&
      first < cache.lines.length &&
      lines[first] === cache.lines[first]
    ) {
      first += 1
    }
    const reusable = blockStart(lines, Math.min(Math.max(0, first), lines.length - 1))
    if (reusable > 0 && reusable <= cache.snapshots.length) {
      for (let index = 0; index < reusable; index += 1) {
        results.push(cache.results[index])
        snapshots.push(cache.snapshots[index])
      }
      context = cloneContext(cache.snapshots[reusable - 1])
      start = reusable
    }
  }

  runLines(lines, context, settings, libraries, defined, 0, results, snapshots, start)

  cache = { key, lines, results, snapshots }
  return results
}

/** The first heading in the sheet, used as the document title when printing. */
export function sheetTitle(source: string): string {
  const heading = source.split('\n').find((line) => line.trim().startsWith('#'))
  return heading ? heading.replace(/^\s*#+\s*/, '').trim() : 'Untitled calculation'
}

export { formatNumber }
