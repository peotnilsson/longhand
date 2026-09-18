import { create, all, type MathNode } from 'mathjs'
import { splitTolerance } from './uncertainty'

const math = create(all)

/**
 * `b_req = solve sigma = f_ck for b`
 *
 * The question an engineer actually has is not "what stress does this section
 * give" but "what section do I need". Nothing here is symbolic: it re-runs the
 * lines that depend on the variable with a trial value and bisects until the
 * two sides meet, which works for any expression the sheet can already
 * evaluate — including one built through ten intermediate steps.
 */
export interface SolveRequest {
  /** The name the answer is bound to. */
  name: string
  /** The two sides to bring together. */
  target: string
  goal: string
  /** The variable to vary. */
  variable: string
  /** An explicit bracket, needed when the variable has no value above. */
  from?: string
  to?: string
}

const PATTERN =
  /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*solve\s+(.+?)\s*=\s*(.+?)\s+for\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+from\s+(.+?)\s+to\s+(.+?))?\s*$/

export function parseSolve(line: string): SolveRequest | null {
  const match = line.match(PATTERN)
  if (!match) return null
  const [, name, target, goal, variable, from, to] = match
  return { name, target, goal, variable, from, to }
}

/** Lines that only describe or display something contribute nothing to a replay. */
const isInert = (line: string): boolean =>
  line === '' ||
  line.startsWith('#') ||
  line.startsWith('//') ||
  /^(plot|import|table|end)\b/.test(line)

/**
 * Re-evaluate one line into a scope. Only assignments and function definitions
 * matter; a check evaluates to a boolean and is harmless, and anything that
 * throws for a trial value is skipped rather than failing the whole solve —
 * a line further down may be the one being solved for.
 */
function replayLine(line: string, scope: Record<string, unknown>): void {
  const trimmed = line.trim()
  if (isInert(trimmed)) return

  let body = trimmed
  const arrow = body.lastIndexOf('->')
  if (arrow !== -1) body = body.slice(0, arrow).trim()

  const assignment = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/)
  if (assignment) {
    const split = splitTolerance(assignment[2])
    if (split) body = `${assignment[1]} = ${split.value}`
  }

  try {
    math.parse(body).evaluate(scope)
  } catch {
    /* a line that cannot be evaluated at this trial value is not the answer */
  }
}

export interface SolveSetup {
  /** The scope as it stood before the variable was first given a value. */
  scope: Record<string, unknown>
  /** The lines between that definition and the solve line, to re-run each try. */
  replay: string[]
  /** The variable's current value, used for its unit and as the first guess. */
  reference?: unknown
}

export interface SolveResult {
  value: unknown
  /** How many times the sheet tail was re-run, for the curious. */
  tries: number
}

export class SolveError extends Error {}

/** The sign of a quantity, which may carry units. */
function sign(value: unknown): number {
  if (typeof value === 'number') return Math.sign(value)
  const zero = math.multiply(value as any, 0)
  if (math.larger(value as any, zero as any)) return 1
  if (math.smaller(value as any, zero as any)) return -1
  return 0
}

const scale = (value: unknown, factor: number): unknown =>
  math.multiply(value as any, factor)

const midpoint = (low: unknown, high: unknown): unknown =>
  math.divide(math.add(low as any, high as any) as any, 2)

/** |high - low| / |high + low|, so convergence means the same at any size. */
function width(low: unknown, high: unknown): number {
  try {
    const span = math.abs(math.subtract(high as any, low as any) as any)
    const size = math.abs(math.add(high as any, low as any) as any)
    const ratio = math.number(math.divide(span as any, size as any) as any)
    return Number.isFinite(ratio) ? ratio : Infinity
  } catch {
    return Infinity
  }
}

const TRIES = 60

export function solve(request: SolveRequest, setup: SolveSetup): SolveResult {
  let tries = 0

  const difference = (trial: unknown): unknown => {
    tries += 1
    const scope: Record<string, unknown> = { ...setup.scope, [request.variable]: trial }
    for (const line of setup.replay) replayLine(line, scope)
    const left = math.parse(request.target).evaluate(scope)
    const right = math.parse(request.goal).evaluate(scope)
    return math.subtract(left as any, right as any)
  }

  const at = (trial: unknown): number | null => {
    try {
      return sign(difference(trial))
    } catch (error) {
      if (error instanceof Error && /[Uu]nit/.test(error.message)) throw error
      return null
    }
  }

  // An explicit range wins; otherwise open out around the value the sheet has.
  let low: unknown
  let high: unknown
  if (request.from !== undefined && request.to !== undefined) {
    low = math.parse(request.from).evaluate({ ...setup.scope })
    high = math.parse(request.to).evaluate({ ...setup.scope })
  } else {
    if (setup.reference === undefined) {
      throw new SolveError(
        `${request.variable} has no value above, so there is nowhere to start — add "from … to …".`,
      )
    }
    low = scale(setup.reference, 0.5)
    high = scale(setup.reference, 2)
  }

  let lowSign = at(low)
  let highSign = at(high)

  // Widen until the difference changes sign, which is what makes an answer exist.
  if (request.from === undefined) {
    for (let step = 0; step < 40 && !(lowSign && highSign && lowSign !== highSign); step += 1) {
      low = scale(low, 0.5)
      high = scale(high, 2)
      lowSign = at(low)
      highSign = at(high)
    }
  }

  if (lowSign === 0) return { value: low, tries }
  if (highSign === 0) return { value: high, tries }
  if (!lowSign || !highSign || lowSign === highSign) {
    throw new SolveError(
      `No value of ${request.variable} makes ${request.target} equal ${request.goal} — ` +
        `the difference never changes sign. Try "from … to …" around where you expect it.`,
    )
  }

  for (let step = 0; step < TRIES && width(low, high) > 1e-12; step += 1) {
    const middle = midpoint(low, high)
    const middleSign = at(middle)
    if (middleSign === null) break
    if (middleSign === 0) return { value: middle, tries }
    if (middleSign === lowSign) low = middle
    else high = middle
  }

  return { value: midpoint(low, high), tries }
}

/** The line that first gives `name` a value, searching upwards from `before`. */
export function definitionIndex(lines: string[], name: string, before: number): number {
  const pattern = new RegExp(`^\\s*${name}\\s*=`)
  for (let index = before - 1; index >= 0; index -= 1) {
    if (pattern.test(lines[index])) return index
  }
  return -1
}

export type { MathNode }
