import type { MathNode } from 'mathjs'
import { math } from './units'
import { splitTolerance } from './uncertainty'
import { splitNote } from './source'


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

  let body = splitNote(trimmed).body
  if (body === '') return
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

// ------------------------------------------------------------- two at once

/**
 * `x, y = solve A = B and C = D for x, y`
 *
 * Two equations, two unknowns. Bisection cannot do this — there is no line to
 * bracket along — so this is Newton with a numerically estimated Jacobian,
 * replaying the same sheet tail the one-unknown solver replays.
 *
 * Everything is done in dimensionless multipliers of the values the sheet
 * already has: x is carried as t·x0 rather than as a quantity. That keeps the
 * unit algebra out of the linear solve entirely, and it means the step sizes
 * are sensible whatever the units happen to be.
 */
export interface Solve2Request {
  names: [string, string]
  left: [string, string]
  right: [string, string]
  variables: [string, string]
}

const PATTERN2 =
  /^([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*solve\s+(.+?)\s*=\s*(.+?)\s+and\s+(.+?)\s*=\s*(.+?)\s+for\s+([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/

export function parseSolve2(line: string): Solve2Request | null {
  const match = line.match(PATTERN2)
  if (!match) return null
  const [, nameA, nameB, leftA, rightA, leftB, rightB, varA, varB] = match
  return {
    names: [nameA, nameB],
    left: [leftA, leftB],
    right: [rightA, rightB],
    variables: [varA, varB],
  }
}

export interface Solve2Setup {
  scope: Record<string, unknown>
  replay: string[]
  /** The current values of the two variables: their units, and the first guess. */
  references: [unknown, unknown]
}

const ROUNDS2 = 60

/**
 * One of whatever `like` is measured in: 1 mm for a length, 1 for a number.
 *
 * Built from the value's units rather than by dividing the value by itself,
 * which is the obvious way and gives 0/0 for exactly the case this exists for
 * — a quantity that happens to be zero.
 */
function unitOneOf(like: unknown): unknown {
  if (like && typeof like === 'object' && (like as any).type === 'Unit') {
    const units = (like as any).formatUnits?.() as string | undefined
    return units ? math.unit(1, units) : 1
  }
  return 1
}

export function solve2(
  request: Solve2Request,
  setup: Solve2Setup,
): { values: [unknown, unknown]; tries: number } {
  let tries = 0
  const [refA, refB] = setup.references

  if (refA === undefined || refB === undefined) {
    throw new SolveError(
      `${request.variables.join(' and ')} both need a value above the solve line — ` +
        'those values say what kind of quantity each one is, and where to start looking.',
    )
  }

  // The unknowns are carried as multiples of a reference, which is what lets a
  // length and a pressure be solved for together. A reference of zero cannot
  // be a multiple of anything, so a variable that starts at zero is carried as
  // a multiple of one of its own units instead, starting from nought.
  const isZero = (value: unknown): boolean => {
    try {
      return math.equal(math.abs(value as any) as any, math.multiply(value as any, 0) as any) === true
    } catch {
      return false
    }
  }
  const baseA = isZero(refA) ? unitOneOf(refA) : refA
  const baseB = isZero(refB) ? unitOneOf(refB) : refB
  const origin: [number, number] = [isZero(refA) ? 0 : 1, isZero(refB) ? 0 : 1]

  const quantities = (t: [number, number]): [unknown, unknown] => [
    math.multiply(baseA as any, t[0]),
    math.multiply(baseB as any, t[1]),
  ]

  /** Both residuals at a trial point, still carrying their own units. */
  const residuals = (t: [number, number]): [unknown, unknown] => {
    tries += 1
    const [a, b] = quantities(t)
    const scope: Record<string, unknown> = {
      ...setup.scope,
      [request.variables[0]]: a,
      [request.variables[1]]: b,
    }
    for (const line of setup.replay) replayLine(line, scope)
    return [0, 1].map((which) => {
      const left = math.parse(request.left[which]).evaluate(scope)
      const right = math.parse(request.right[which]).evaluate(scope)
      return math.subtract(left as any, right as any)
    }) as [unknown, unknown]
  }

  // Each residual is scaled by its own size at the starting point, so the two
  // equations weigh the same however differently they are measured.
  //
  // An equation that already balances at the start has a size of zero, and
  // dividing by that made every residual NaN — and because NaN is never
  // greater than a tolerance, the solver "converged" at once and handed back
  // the starting values as the answer. One of the residual's own units is the
  // honest scale for that equation.
  const start = residuals(origin)
  const scaleOf = (value: unknown): unknown => {
    try {
      return isZero(value) ? unitOneOf(value) : math.abs(value as any)
    } catch {
      return 1
    }
  }
  const scales = [scaleOf(start[0]), scaleOf(start[1])]

  const plain = (t: [number, number]): [number, number] => {
    const raw = residuals(t)
    return [0, 1].map((which) => {
      try {
        return math.number(math.divide(raw[which] as any, scales[which] as any) as any)
      } catch {
        throw new SolveError(
          `equation ${which + 1} compares quantities of different kinds, so it can never balance.`,
        )
      }
    }) as [number, number]
  }

  const norm = (r: [number, number]): number => Math.hypot(r[0], r[1])

  let t: [number, number] = [...origin]
  let r = plain(t)

  for (let round = 0; round < ROUNDS2 && norm(r) > 1e-12; round += 1) {
    // A Jacobian by central differences, on a step proportional to the guess.
    const step: [number, number] = [
      Math.max(Math.abs(t[0]), 1e-3) * 1e-6,
      Math.max(Math.abs(t[1]), 1e-3) * 1e-6,
    ]
    const dA = plain([t[0] + step[0], t[1]])
    const dA2 = plain([t[0] - step[0], t[1]])
    const dB = plain([t[0], t[1] + step[1]])
    const dB2 = plain([t[0], t[1] - step[1]])

    const j11 = (dA[0] - dA2[0]) / (2 * step[0])
    const j21 = (dA[1] - dA2[1]) / (2 * step[0])
    const j12 = (dB[0] - dB2[0]) / (2 * step[1])
    const j22 = (dB[1] - dB2[1]) / (2 * step[1])

    const determinant = j11 * j22 - j12 * j21
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-14) {
      throw new SolveError(
        `the two equations do not pin down ${request.variables.join(' and ')} separately — ` +
          'they move together, so any number of answers would fit.',
      )
    }

    const deltaA = (-r[0] * j22 + r[1] * j12) / determinant
    const deltaB = (-r[1] * j11 + r[0] * j21) / determinant

    // Back off rather than overshoot: a full Newton step can leave the region
    // where the sheet still evaluates at all.
    let scale = 1
    let next: [number, number] = [t[0] + deltaA, t[1] + deltaB]
    let nextR: [number, number]
    for (;;) {
      try {
        nextR = plain(next)
        if (Number.isFinite(norm(nextR)) && norm(nextR) < norm(r)) break
      } catch {
        /* fall through and halve */
      }
      scale /= 2
      if (scale < 1e-6) {
        throw new SolveError(
          `no pair of values for ${request.variables.join(' and ')} brings both equations ` +
            'together. Check the two equations really are different, and that a solution exists.',
        )
      }
      next = [t[0] + deltaA * scale, t[1] + deltaB * scale]
    }

    t = next
    r = nextR
  }

  // Written as "not within" rather than "beyond", so that NaN — which is
  // neither — counts as the failure it is.
  if (!(norm(r) <= 1e-6)) {
    throw new SolveError(
      `${request.variables.join(' and ')} did not converge — the two equations are still ` +
        'out by more than a millionth. Try starting from values closer to the answer.',
    )
  }

  return { values: quantities(t), tries }
}
