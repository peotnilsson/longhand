import type { MathNode } from 'mathjs'
import {
  math,
  formatColumn,
  formatValue,
  formatLike,
  formatNumber,
  isVector,
  displayUnit,
  toNumberIn,
} from './units'
import { symbolToTex, toTex, valueToTex, sameTex } from './tex'
import {
  definitionIndex,
  parseSolve,
  parseSolve2,
  solve,
  solve2,
  SolveError,
  type SolveSetup,
} from './solve'
import { builtins } from './builtins'
import { splitNote, splitQuery } from './source'
import { applyDirective, parseDirective, splitArrows } from './rounding'
import { elementwisePowers, expandRanges } from './vectors'
import {
  collectSymbols,
  cloneUncertainty,
  correlationKey,
  emptyUncertainty,
  parseCorrelate,
  propagate,
  splitTolerance,
  type Contribution,
  type ToleranceMode,
  type Uncertainty,
} from './uncertainty'
import { absoluteTemperatureMisuse } from './temperature'
import { checked, defineUnit, parseSignature, parseUnitLine } from './declare'
import { IterateError, iterate, parseIterate } from './iterate'

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
  | {
      kind: 'calc'
      tex: string
      summary: string
      tolerance?: ToleranceView
      warning?: string
      note?: string
      /** A reviewer's question, printed in the margin. */
      query?: string
      /** The symbol this line defines, for cross-references and the inspector. */
      name?: string
      /** Its equation number, assigned in the order the sheet reads. */
      equation?: number
    }
  | {
      kind: 'definition'
      tex: string
      summary: string
      warning?: string
      note?: string
      query?: string
      name?: string
    }
  | {
      kind: 'check'
      tex: string
      pass: boolean
      margin: string | null
      summary: string
      note?: string
      query?: string
    }
  | { kind: 'break' }
  | { kind: 'figure'; id: string; caption: string; number: number; summary: string }
  | { kind: 'table'; headers: string[]; rows: TableCell[][]; summary: string }
  | { kind: 'plot'; data: PlotData; summary: string }
  | { kind: 'error'; source: string; message: string }

interface Definition {
  name: string
  node: MathNode
}

interface Context {
  scope: Record<string, unknown>
  uncertainty: Uncertainty
  definitions: Definition[]
  /** Figures are numbered in the order they appear, which is the only order that makes sense. */
  figures: number
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
  uncertainty: cloneUncertainty(context.uncertainty),
  definitions: [...context.definitions],
  figures: context.figures,
})

// ---------------------------------------------------------------- dependencies

/** name -> names it references. Used for error messages and for the UI. */
export function buildGraph(source: string): Record<string, string[]> {
  const graph: Record<string, string[]> = {}
  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith('//')) continue
    try {
      const node = math.parse(expandRanges(splitArrows(line).body))
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
  if (/must be square|Matrix must be square|two dimensional/i.test(message)) {
    return `${message} — if one of these is a list, write the operation element by element: .* to multiply, ./ to divide.`
  }
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

  // Optional trailing note:  b = 300 mm  // from drawing A-102
  // and, after it, a reviewer's query:   ?? which load case is this
  const { body: withoutNote, note: rawNote } = splitNote(line)
  const noteParts = splitQuery(rawNote ?? '')
  const withoutQuery = splitQuery(withoutNote)
  const note = noteParts.body || undefined
  const query = withoutQuery.query ?? noteParts.query
  line = withoutQuery.body

  // Everything after an arrow:  -> MPa  -> 3 sf  -> ceil 10 mm, chained.
  const arrows = splitArrows(line)
  let body = arrows.body
  const directives = arrows.directives

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

  // `A(d: length) = pi*d^2/4` — the kinds come out before mathjs sees the line,
  // and go back on as a check around the function afterwards.
  let signature: ReturnType<typeof parseSignature> = null
  try {
    signature = parseSignature(body)
    if (signature) body = signature.body
  } catch (error) {
    return { kind: 'error', source: line, message: (error as Error).message }
  }

  try {
    const node = math.parse(expandRanges(body))
    // `node` is what gets rendered — the formula exactly as written. `runnable`
    // is what gets evaluated, with `^` made element-wise so the same formula
    // also works down a list. Keeping them separate is what lets the page show
    // d² while the arithmetic behind it handles a vector of diameters.
    const runnable = elementwisePowers(node)
    const type = (node as any).type

    // ---- function definition:  A(d) = pi*d^2/4
    if (type === 'FunctionAssignmentNode') {
      const functionName = (node as any).name
      const redefined = context.scope[functionName] !== undefined
      runnable.evaluate(context.scope)
      if (signature) {
        const order: string[] = (node as any).params ?? []
        context.scope[functionName] = checked(
          context.scope[functionName] as (...args: unknown[]) => unknown,
          signature,
          order,
        )
      }
      context.definitions.push({ name: functionName, node: runnable })
      const declared = signature ? Object.entries(signature.kinds) : []
      return {
        kind: 'definition',
        name: functionName,
        query,
        tex: toTex(node, context.scope),
        summary: declared.length
          ? `${functionName}() defined — ${declared
              .map(([parameter, kind]) => `${parameter} is a ${kind}`)
              .join(', ')}`
          : `${functionName}() defined`,
        note,
        warning: redefined
          ? `${functionName} was already defined above — this replaces it for the lines below.`
          : undefined,
      }
    }

    const misuse = absoluteTemperatureMisuse(node, context.scope)
    if (misuse) return { kind: 'error', source: line, message: misuse }

    // ---- check:  sigma <= f_ck
    if (type === 'OperatorNode' && COMPARISONS.has((node as any).op)) {
      const [leftNode, rightNode] = (node as any).args
      const [leftRunnable, rightRunnable] = (runnable as any).args
      const left = leftRunnable.evaluate(context.scope)
      const right = rightRunnable.evaluate(context.scope)
      const pass = Boolean(runnable.evaluate(context.scope))
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
        note,
        query,
      }
    }

    // ---- assignment or bare expression
    const isAssignment = type === 'AssignmentNode'
    const name: string | null = isAssignment ? (node as any).object.name : null

    // Read the previous value BEFORE evaluating: evaluating an assignment node
    // writes straight into the scope, so afterwards every line looks like a
    // redefinition of itself.
    const previous = name === null ? undefined : context.scope[name]

    let value = runnable.evaluate(context.scope)
    for (const directive of directives) {
      value = applyDirective(value, parseDirective(directive), context.scope)
    }

    // Redefinition is legal — a staged calculation sometimes revises a value —
    // but silently is dangerous: a reviewer reading top to bottom has no way to
    // see that everything above used the earlier number.
    const warning =
      previous === undefined
        ? undefined
        : typeof previous === 'function'
          ? `${name} is a built-in function — this replaces it for the lines below.`
          : `${name} was ${formatValue(previous, precision)} above — this redefines it for the lines below.`

    if (isAssignment) {
      // Evaluating an assignment node has already put the *unrounded* value in
      // the scope, so this line is what makes `-> ceil 10 mm` mean anything:
      // without it the sheet would print 290 mm and every line below it would
      // quietly carry on with 287.4 mm.
      context.scope[name!] = value
      context.definitions.push({ name: name!, node: runnable })
    }

    const rhs: MathNode = isAssignment ? (node as any).value : node

    // uncertainty: explicit on this line, or propagated from uncertain inputs.
    // A list has no single ±, and asking for the partial derivatives of one
    // produces a matrix of them, so a vector result carries no tolerance.
    let tolerance: ToleranceView | undefined
    if (isVector(value)) {
      tolerance = undefined
    } else if (sigmaSource) {
      const sigma = math.parse(sigmaSource).evaluate(context.scope)
      if (name) {
        // A ± written on the line is a measurement: it is where uncertainty
        // enters the sheet, and it is what the shares further down name.
        context.uncertainty.sigmas[name] = sigma
        context.uncertainty.roots.add(name)
        delete context.uncertainty.derivations[name]
      }
      tolerance = toleranceView(sigma, [], value, precision)
    } else {
      const propagated = propagate(rhs, context.scope, context.uncertainty, mode)
      if (propagated) {
        if (name) {
          context.uncertainty.sigmas[name] = propagated.sigma
          context.uncertainty.roots.delete(name)
          // Kept so a line further down can be expressed in terms of the
          // measurements behind this one rather than this one.
          context.uncertainty.derivations[name] = rhs
        }
        tolerance = toleranceView(propagated.sigma, propagated.contributions, value, precision)
      } else if (name) {
        // Redefined without an uncertainty: the old one no longer applies.
        delete context.uncertainty.sigmas[name]
        context.uncertainty.roots.delete(name)
        delete context.uncertainty.derivations[name]
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
      warning,
      note,
      query,
      name: name ?? undefined,
    }
  } catch (error) {
    return { kind: 'error', source: line, message: explain(error, defined) }
  }
}

/**
 * `b_req = solve sigma = f_ck for b`
 *
 * Everything above the variable's own definition is already computed, so the
 * solver starts from the scope as it stood there and re-runs only the lines in
 * between on each try. That keeps a solve on a long sheet cheap, and it means
 * the variable can be buried ten steps up the chain from the thing being
 * matched.
 */
function evaluateSolve(
  rawLine: string,
  context: Context,
  options: Required<Pick<SheetOptions, 'precision' | 'mode'>>,
  defined: Set<string>,
  lines: string[],
  index: number,
  snapshots?: Context[],
): Line {
  const { body: line, note } = splitNote(rawLine)
  const request = parseSolve(line)!
  const { precision } = options

  try {
    const defined_at = definitionIndex(lines, request.variable, index)
    let setup: SolveSetup

    if (defined_at < 0) {
      // Not defined above: nothing to replay, and a range is compulsory.
      setup = { scope: { ...context.scope }, replay: [], reference: undefined }
    } else if (snapshots && defined_at >= 1 && snapshots[defined_at - 1]) {
      setup = {
        scope: { ...snapshots[defined_at - 1].scope },
        replay: lines.slice(defined_at + 1, index),
        reference: context.scope[request.variable],
      }
    } else {
      // No snapshots (a nested run): replay the whole prefix bar the definition.
      setup = {
        scope: builtins(),
        replay: lines.slice(0, index).filter((_, at) => at !== defined_at),
        reference: context.scope[request.variable],
      }
    }

    const { value } = solve(request, setup)

    context.scope[request.name] = value
    const node = math.parse(`${request.name} = ${formatValue(value, precision)}`)
    context.definitions.push({ name: request.name, node })

    const shown = formatValue(value, precision)
    const equation = `${toTex(math.parse(request.target), context.scope)} = ${toTex(
      math.parse(request.goal),
      context.scope,
    )}`
    return {
      kind: 'calc',
      tex: `${equation} \\;\\Rightarrow\\; ${symbolToTex(request.name, context.scope)} = ${valueToTex(
        shown,
        context.scope,
      )}`,
      summary: `= ${shown}`,
      note,
    }
  } catch (error) {
    if (error instanceof SolveError) {
      return { kind: 'error', source: line, message: error.message }
    }
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
      // A named table's columns are data, not a quantity: substituting one
      // prints the whole table into the middle of the line, which is how a
      // one-line lookup became a page-wide matrix.
      const isData =
        Array.isArray(value) ||
        (typeof value === 'object' && value !== null && (value as any).isUnit !== true)
      if (value !== undefined && typeof value !== 'function' && !isData) {
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
  /** `table steel` publishes its columns as steel.<column>, so the sheet can
   *  interpolate down them or sum them. */
  tableName?: string,
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

  type Cell =
    | { kind: 'value'; value: unknown }
    | { kind: 'verdict'; pass: boolean }
    | { kind: 'text'; text: string }

  // First pass: evaluate every cell, keeping the raw values so that each column
  // can be formatted as a whole afterwards.
  const grid: Cell[][] = []

  for (const raw of dataRows) {
    const cells = raw.split('|').map((cell) => cell.trim())
    const rowScope: Record<string, unknown> = { ...context.scope }
    const row: Cell[] = []
    let failed = false

    inputs.forEach((column, index) => {
      if (failed) {
        row.push({ kind: 'text', text: '—' })
        return
      }
      const cell = cells[index] ?? ''
      // A bare word that is not a defined value is a label, not an expression -
      // otherwise a section called "A" would be evaluated as one ampere.
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(cell) && rowScope[cell] === undefined) {
        row.push({ kind: 'text', text: cell })
        return
      }
      try {
        const value = elementwisePowers(math.parse(expandRanges(cell))).evaluate(rowScope)
        rowScope[column.name] = value
        row.push({ kind: 'value', value })
      } catch (error) {
        row.push({ kind: 'text', text: explain(error, defined) })
        failed = true
      }
    })

    for (const column of columns.filter((candidate) => !candidate.input)) {
      if (failed) {
        row.push({ kind: 'text', text: '—' })
        continue
      }
      try {
        const value = elementwisePowers(
          math.parse(expandRanges(column.expression!)),
        ).evaluate(rowScope)
        rowScope[column.name] = value
        row.push(
          typeof value === 'boolean'
            ? { kind: 'verdict', pass: value }
            : { kind: 'value', value },
        )
      } catch (error) {
        row.push({ kind: 'text', text: explain(error, defined) })
      }
    }

    grid.push(row)
  }

  // Second pass: format each column together.
  const rows: TableCell[][] = grid.map(() => [])
  columns.forEach((_column, index) => {
    const cells = grid.map((row) => row[index])
    const values = cells.flatMap((cell) => (cell?.kind === 'value' ? [cell.value] : []))
    const formatted = values.length ? formatColumn(values, precision) : []

    let cursor = 0
    cells.forEach((cell, rowIndex) => {
      if (!cell) {
        rows[rowIndex].push({ text: '' })
        return
      }
      if (cell.kind === 'value') {
        rows[rowIndex].push({ text: formatted[cursor] ?? formatValue(cell.value, precision) })
        cursor += 1
        return
      }
      if (cell.kind === 'verdict') {
        rows[rowIndex].push({
          text: cell.pass ? 'OK' : 'NOT OK',
          verdict: cell.pass ? 'pass' : 'fail',
        })
        return
      }
      rows[rowIndex].push({ text: cell.text })
    })
  })

  // A named table hands its columns to the sheet as arrays: values where a cell
  // held a quantity, the label itself where it held a name.
  if (tableName) {
    const published: Record<string, unknown[]> = {}
    columns.forEach((column, index) => {
      published[column.name] = grid.map((row) => {
        const cell = row[index]
        if (!cell) return null
        if (cell.kind === 'value') return cell.value
        if (cell.kind === 'verdict') return cell.pass
        return cell.text
      })
    })
    context.scope[tableName] = published
  }

  return {
    kind: 'table',
    headers: columns.map((column) => column.name),
    rows,
    summary: tableName
      ? `${rows.length} row${rows.length === 1 ? '' : 's'}, as ${tableName}.${columns[0].name}`
      : `${rows.length} row${rows.length === 1 ? '' : 's'}`,
  }
}

/**
 * `unit ksi = 1000 psi`
 *
 * A sheet naming a unit its own field uses. Definitions are global to the
 * engine and overwrite a previous one of the same name, so re-running is
 * harmless — and the line prints what it defined, because two sheets defining
 * the same name differently is the one way this could confuse somebody.
 */
function evaluateUnit(line: string): Line {
  const request = parseUnitLine(line)
  if (!request) {
    return {
      kind: 'error',
      source: line,
      message: 'Write a unit as:  unit ksi = 1000 psi',
    }
  }
  try {
    return { kind: 'note', text: `Unit defined: ${defineUnit(request)}` }
  } catch (error) {
    return { kind: 'error', source: line, message: (error as Error).message }
  }
}

/**
 * `correlate b and h by 0.8`
 *
 * Propagation assumes the inputs are independent, which is the usual
 * assumption and occasionally the wrong one: two dimensions measured with the
 * same instrument move together, and a budget that ignores that understates
 * the result.
 */
function evaluateCorrelate(line: string, context: Context): Line {
  const request = parseCorrelate(line)
  if (!request) {
    return {
      kind: 'error',
      source: line,
      message: 'Write a correlation as:  correlate b and h by 0.8',
    }
  }
  if (request.coefficient < -1 || request.coefficient > 1) {
    return {
      kind: 'error',
      source: line,
      message: `a correlation runs from -1 to 1, and ${request.coefficient} is outside that`,
    }
  }
  context.uncertainty.correlations[correlationKey(request.a, request.b)] = request.coefficient
  return {
    kind: 'note',
    text: `${request.a} and ${request.b} are treated as ${
      request.coefficient === 0 ? 'independent' : `correlated by ${request.coefficient}`
    } from here on.`,
  }
}

/** `f = iterate step(f) from 0.02` */
function evaluateIterate(
  rawLine: string,
  context: Context,
  options: Required<Pick<SheetOptions, 'precision' | 'mode'>>,
): Line {
  const { body: line, note } = splitNote(rawLine)
  const request = parseIterate(line)!
  try {
    const { value, rounds } = iterate(request, context.scope)
    context.scope[request.name] = value
    const node = math.parse(`${request.name} = ${formatValue(value, options.precision)}`)
    context.definitions.push({ name: request.name, node })
    const shown = formatValue(value, options.precision)
    return {
      kind: 'calc',
      tex: `${symbolToTex(request.name, context.scope)} = ${valueToTex(shown, context.scope)}`,
      summary: `= ${shown} after ${rounds} round${rounds === 1 ? '' : 's'}`,
      note,
    }
  } catch (error) {
    if (error instanceof IterateError) {
      return { kind: 'error', source: line, message: error.message }
    }
    return { kind: 'error', source: line, message: (error as Error).message }
  }
}

/** `x, y = solve A = B and C = D for x, y` */
function evaluateSolve2(
  rawLine: string,
  context: Context,
  options: Required<Pick<SheetOptions, 'precision' | 'mode'>>,
  defined: Set<string>,
  lines: string[],
  index: number,
  snapshots?: Context[],
): Line {
  const { body: line, note } = splitNote(rawLine)
  const request = parseSolve2(line)!
  const { precision } = options

  try {
    // Replay from before the *earlier* of the two definitions, so both
    // variables are free when the sheet tail is re-run.
    const firstAt = definitionIndex(lines, request.variables[0], index)
    const secondAt = definitionIndex(lines, request.variables[1], index)
    const earliest = Math.min(
      firstAt < 0 ? Number.MAX_SAFE_INTEGER : firstAt,
      secondAt < 0 ? Number.MAX_SAFE_INTEGER : secondAt,
    )

    const setup =
      earliest !== Number.MAX_SAFE_INTEGER && snapshots && earliest >= 1 && snapshots[earliest - 1]
        ? {
            scope: { ...snapshots[earliest - 1].scope },
            replay: lines
              .slice(earliest, index)
              .filter((_line, at) => at + earliest !== firstAt && at + earliest !== secondAt),
          }
        : {
            scope: builtins(),
            replay: lines.slice(0, index).filter((_line, at) => at !== firstAt && at !== secondAt),
          }

    const { values } = solve2(request, {
      ...setup,
      references: [
        context.scope[request.variables[0]],
        context.scope[request.variables[1]],
      ],
    })

    request.names.forEach((name, which) => {
      context.scope[name] = values[which]
      context.definitions.push({
        name,
        node: math.parse(`${name} = ${formatValue(values[which], precision)}`),
      })
    })

    const shown = request.names
      .map((name, which) => `${name} = ${formatValue(values[which], precision)}`)
      .join(',  ')
    const tex = request.names
      .map(
        (name, which) =>
          `${symbolToTex(name, context.scope)} = ${valueToTex(
            formatValue(values[which], precision),
            context.scope,
          )}`,
      )
      .join(', \\; ')

    return { kind: 'calc', tex, summary: `${shown}`, note }
  } catch (error) {
    if (error instanceof SolveError) {
      return { kind: 'error', source: line, message: error.message }
    }
    return { kind: 'error', source: line, message: explain(error, defined) }
  }
}

/**
 * `figure sectionAA "Cross-section at A-A"`
 *
 * The words live in the sheet — they are text, and text is what a sheet is
 * made of — while the image itself is held beside the sheet under the id, so a
 * photograph never has to be pasted into the middle of a calculation as a wall
 * of base64. Numbering is automatic and by position, because a figure the
 * author has to renumber by hand is a figure that ends up wrong.
 */
function evaluateFigure(line: string, context: Context): Line {
  const match = line.match(/^figure(?:\s+([A-Za-z_][A-Za-z0-9_]*))?\s*(?:"([^"]*)")?\s*$/)
  if (!match) {
    return {
      kind: 'error',
      source: line,
      message: 'Write a figure as:  figure section_AA "Cross-section at A-A"',
    }
  }
  const [, id, caption] = match
  context.figures += 1
  return {
    kind: 'figure',
    id: id ?? `figure_${context.figures}`,
    caption: caption ?? '',
    number: context.figures,
    summary: `Figure ${context.figures}`,
  }
}

/**
 * Numbers every line that defines something, and resolves `@name` references.
 *
 * `@section_AA` becomes "Figure 2" and `@W_el` becomes "eq. 7", both worked
 * out after the whole sheet has run, because a reference can point at
 * something further down and the number is not known until then. Referring to
 * a *symbol* rather than to a label means there is nothing extra to write: the
 * name is already on the line, and moving the line renumbers the reference.
 *
 * Cross-sheet references are deliberately not here. "See Loads, eq. 3" would
 * mean numbering another sheet at render time and quietly depending on its
 * contents, and a reference that silently points at the wrong line is worse
 * than one that was never made.
 */
function resolveReferences(results: Line[]): Line[] {
  const figures = new Map<string, number>()
  const equations = new Map<string, number>()

  let equation = 0
  const numbered = results.map((line) => {
    if (line.kind === 'figure') {
      figures.set(line.id, line.number)
      return line
    }
    if (line.kind === 'calc' && line.name) {
      equation += 1
      equations.set(line.name, equation)
      return { ...line, equation }
    }
    return line
  })

  if (figures.size === 0 && equations.size === 0) return numbered

  const swap = (text: string): string =>
    text.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (whole, id: string) => {
      if (figures.has(id)) return `Figure ${figures.get(id)}`
      if (equations.has(id)) return `eq. ${equations.get(id)}`
      return whole
    })

  return numbered.map((line) => {
    if (line.kind === 'prose' || line.kind === 'note') {
      const text = swap(line.text)
      return text === line.text ? line : { ...line, text }
    }
    if (line.kind === 'calc' || line.kind === 'definition' || line.kind === 'check') {
      const note = line.note === undefined ? undefined : swap(line.note)
      const query = line.query === undefined ? undefined : swap(line.query)
      return note === line.note && query === line.query ? line : { ...line, note, query }
    }
    return line
  })
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
    const exprNode = elementwisePowers(math.parse(expandRanges(expression)))
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
      result = evaluateImport(splitNote(line).body, context, options, libraries, depth)
    } else if (/^page\s+break\s*$/.test(line)) {
      result = { kind: 'break' }
    } else if (/^unit\b/.test(line)) {
      result = evaluateUnit(splitNote(line).body)
    } else if (/^correlate\b/.test(line)) {
      result = evaluateCorrelate(splitNote(line).body, context)
    } else if (parseIterate(splitNote(line).body)) {
      result = evaluateIterate(line, context, options)
    } else if (parseSolve2(splitNote(line).body)) {
      result = evaluateSolve2(line, context, options, defined, lines, index, snapshots)
    } else if (/^figure\b/.test(line)) {
      result = evaluateFigure(splitNote(line).body, context)
    } else if (/^plot\b/.test(line)) {
      result = evaluatePlot(splitNote(line).body, context, defined)
    } else if (/^table\b/.test(line)) {
      const named = splitNote(line).body.match(/^table\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/)
      const block: string[] = []
      let cursor = index + 1
      while (cursor < lines.length && splitNote(lines[cursor].trim()).body !== 'end') {
        const row = splitNote(lines[cursor]).body
        if (row !== '') block.push(row)
        cursor += 1
      }
      result = evaluateTable(block, context, options.precision, defined, named?.[1])
      results.push(result)
      snapshots?.push(cloneContext(context))
      for (let filler = index + 1; filler <= Math.min(cursor, lines.length - 1); filler += 1) {
        results.push({ kind: 'blank' })
        snapshots?.push(cloneContext(context))
      }
      index = cursor
      continue
    } else if (parseSolve(splitNote(line).body)) {
      result = evaluateSolve(line, context, options, defined, lines, index, snapshots)
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
  let context: Context = {
    scope: builtins(),
    uncertainty: emptyUncertainty(),
    definitions: [],
    figures: 0,
  }
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
  return resolveReferences(results)
}

/**
 * Throw the incremental cache away.
 *
 * Reusing everything above the first edited line is what keeps a long sheet
 * responsive, and it is also the one place where the app could quietly show a
 * stale answer. A user who suspects that needs a way to prove it, which is what
 * this and `recomputeCold` are for.
 */
export function clearCache(): void {
  cache = null
}

export interface ColdRun {
  /** True when the cached results and a run from nothing agree line for line. */
  equal: boolean
  lines: number
  /** The first line that differed, 1-based, or null when nothing did. */
  firstDifference: number | null
  milliseconds: number
}

/**
 * Run the sheet twice — once as the app has it, once from nothing — and say
 * whether they agree. An engineer should not have to take the cache's word for
 * it, and neither should we.
 */
export function recomputeCold(source: string, options: SheetOptions = {}): ColdRun {
  const cached = evaluateSheet(source, options).map((line) => JSON.stringify(line))
  clearCache()
  const started = Date.now()
  const cold = evaluateSheet(source, options).map((line) => JSON.stringify(line))
  const milliseconds = Date.now() - started

  const length = Math.max(cached.length, cold.length)
  let firstDifference: number | null = null
  for (let index = 0; index < length; index += 1) {
    if (cached[index] !== cold[index]) {
      firstDifference = index + 1
      break
    }
  }
  return {
    equal: firstDifference === null,
    lines: cold.length,
    firstDifference,
    milliseconds,
  }
}

/** The first heading in the sheet, used as the document title when printing. */
export function sheetTitle(source: string): string {
  const heading = source.split('\n').find((line) => line.trim().startsWith('#'))
  return heading ? heading.replace(/^\s*#+\s*/, '').trim() : 'Untitled calculation'
}

export { formatNumber }
