import { math } from './units'

/**
 * An initial value problem, solved numerically:
 *
 *     y = ode y'' - y' - 2y = x, y(0) = 2, y'(0) = 0 for x from 0 to 3
 *
 * defines y as a function you can call, plot and differentiate like any other.
 *
 * Numeric rather than symbolic on purpose. A symbolic solver covers the
 * textbook cases — constant coefficients, a polynomial or exponential on the
 * right — and fails on the first equation that is not one. A numeric one
 * covers every equation that can be solved for its highest derivative, which
 * is all of those and most of what comes after them, and it is exactly what a
 * written solution needs beside it: an independent check that the formula
 * worked out by hand really does satisfy the equation and the conditions.
 *
 * The method is the classical fourth-order Runge–Kutta on a fine fixed grid,
 * with cubic Hermite interpolation between grid points, so the function it
 * returns is smooth and accurate to far more figures than a sheet prints.
 */

export class OdeError extends Error {}

export interface OdeRequest {
  name: string
  equation: string
  conditions: string[]
  variable: string
  from: string
  to: string
}

const PATTERN =
  /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*ode\s+(.+?)\s+for\s+([A-Za-z_][A-Za-z0-9_]*)\s+from\s+(.+?)\s+to\s+(.+)$/

/** Commas at the top level only: y(0) = 2 has none, f(a, b) = 1 has one inside brackets. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at]
    if (char === '(' || char === '[') depth += 1
    else if (char === ')' || char === ']') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(start, at).trim())
      start = at + 1
    }
  }
  parts.push(text.slice(start).trim())
  return parts.filter(Boolean)
}

export function parseOde(line: string): OdeRequest | null {
  const match = line.match(PATTERN)
  if (!match) return null
  const [, name, body, variable, from, to] = match
  const [equation, ...conditions] = splitTopLevel(body)
  return { name, equation, conditions, variable, from, to }
}

/** Grid points: fine enough that interpolation error is far below four figures. */
const STEPS = 2000

const plain = (value: unknown, what: string): number => {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && (value as any).isUnit) {
    throw new OdeError(`${what} has units. ode works with plain numbers — divide the units out first.`)
  }
  try {
    return math.number(value as any)
  } catch {
    throw new OdeError(`${what} is not a number.`)
  }
}

export interface OdeSolution {
  /** The solution as a function of the independent variable. */
  fn: (x: unknown) => number
  order: number
  from: number
  to: number
}

export function solveOde(request: OdeRequest, scope: Record<string, unknown>): OdeSolution {
  const { name, variable } = request
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const sides = request.equation.split(/(?<![<>!=])=(?!=)/)
  if (sides.length !== 2) {
    throw new OdeError(`The equation needs exactly one = : ${name}'' + ${name} = 0, say.`)
  }

  // y''', y'', y' and y — with or without (x) after them — become plain
  // symbols, one per derivative, so mathjs can evaluate the equation.
  const orders: number[] = []
  // Not part of a longer name — but 2y is two times y, so a digit before it is fine.
  const reference = new RegExp(`(?<![A-Za-z_][A-Za-z0-9_]*)${escaped}('*)(?:\\s*\\(\\s*${variable}\\s*\\))?(?![A-Za-z0-9_(])`, 'g')
  const rewrite = (side: string) =>
    side.replace(reference, (_whole, primes: string) => {
      orders.push(primes.length)
      return `__d${primes.length}`
    })
  const left = rewrite(sides[0])
  const right = rewrite(sides[1])
  const order = Math.max(0, ...orders)
  if (order === 0) {
    throw new OdeError(`The equation has no derivative of ${name} in it — write ${name}' for the first.`)
  }
  if (order > 4) throw new OdeError('ode handles equations up to the fourth order.')

  let residual: { evaluate: (scope: Record<string, unknown>) => unknown }
  try {
    residual = math.compile(`(${left}) - (${right})`)
  } catch (error) {
    throw new OdeError(`The equation does not parse: ${error instanceof Error ? error.message : String(error)}`)
  }

  const x0 = plain(math.evaluate(request.from, { ...scope }), 'The start')
  const x1 = plain(math.evaluate(request.to, { ...scope }), 'The end')
  if (x0 === x1) throw new OdeError('from and to are the same point, so there is nothing to solve over.')

  // Initial conditions: one per derivative below the order, all at the start.
  const initial: (number | undefined)[] = Array(order).fill(undefined)
  const condition = new RegExp(`^${escaped}('*)\\s*\\((.+)\\)\\s*=\\s*(.+)$`)
  for (const text of request.conditions) {
    const found = text.match(condition)
    if (!found) {
      throw new OdeError(`"${text}" is not a condition — write it as ${name}(${request.from}) = 1 or ${name}'(${request.from}) = 0.`)
    }
    const [, primes, at, value] = found
    const where = plain(math.evaluate(at, { ...scope }), `The point in ${text}`)
    if (Math.abs(where - x0) > 1e-12 * Math.max(1, Math.abs(x0))) {
      throw new OdeError(
        `Every condition has to be at the start of the interval, ${variable} = ${x0}. ` +
          'A condition at the other end is a boundary value problem, which this does not solve.',
      )
    }
    if (primes.length >= order) {
      throw new OdeError(`${text} gives a derivative the equation does not need — it is of order ${order}.`)
    }
    initial[primes.length] = plain(math.evaluate(value, { ...scope }), `The value in ${text}`)
  }
  const missing = initial.findIndex((value) => value === undefined)
  if (missing >= 0) {
    throw new OdeError(
      `An equation of order ${order} needs ${order} condition${order === 1 ? '' : 's'}; ` +
        `${name}${"'".repeat(missing)}(${x0}) is missing.`,
    )
  }

  // The highest derivative, from the equation. It is assumed to appear
  // linearly — true of every equation in a first course — and the residual is
  // evaluated twice to find its coefficient, which also catches the case
  // where that coefficient vanishes and the equation cannot be solved for it.
  const local: Record<string, unknown> = { ...scope }
  const highest = (x: number, state: number[]): number => {
    local[variable] = x
    for (let k = 0; k < order; k += 1) local[`__d${k}`] = state[k]
    const evaluate = () => {
      try {
        return plain(residual.evaluate(local), 'The equation')
      } catch (error) {
        if (error instanceof OdeError) throw error
        throw new OdeError(
          `The equation could not be evaluated at ${variable} = ${x}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
    local[`__d${order}`] = 0
    const at0 = evaluate()
    local[`__d${order}`] = 1
    const at1 = evaluate()
    const coefficient = at1 - at0
    if (!Number.isFinite(coefficient) || Math.abs(coefficient) < 1e-14) {
      throw new OdeError(
        `The coefficient of ${name}${"'".repeat(order)} is zero at ${variable} = ${x}, so the equation cannot be solved for it there.`,
      )
    }
    return -at0 / coefficient
  }

  const derivative = (x: number, state: number[]): number[] => [
    ...state.slice(1),
    highest(x, state),
  ]

  const h = (x1 - x0) / STEPS
  const xs: number[] = [x0]
  const states: number[][] = [initial as number[]]
  const slopes: number[] = []
  let state = initial as number[]
  for (let step = 0; step < STEPS; step += 1) {
    const x = x0 + step * h
    const k1 = derivative(x, state)
    const k2 = derivative(x + h / 2, state.map((v, i) => v + (h / 2) * k1[i]))
    const k3 = derivative(x + h / 2, state.map((v, i) => v + (h / 2) * k2[i]))
    const k4 = derivative(x + h, state.map((v, i) => v + h * k3[i]))
    slopes.push(k1[0])
    state = state.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]))
    if (!state.every(Number.isFinite)) {
      throw new OdeError(`The solution blows up before ${variable} = ${x1} — somewhere past ${variable} = ${x.toPrecision(4)}.`)
    }
    xs.push(x + h)
    states.push(state)
  }
  slopes.push(derivative(x1, state)[0])

  const lo = Math.min(x0, x1)
  const hi = Math.max(x0, x1)

  // Cubic Hermite between grid points, using the value and slope at each end.
  const fn = (input: unknown): number => {
    const x = plain(input, `${name}(…)`)
    // A hair beyond the ends is allowed — a derivative at the start has to
    // look a millionth to either side — and uses the end interval's cubic.
    const slack = 1e-4 * (hi - lo)
    if (x < lo - slack || x > hi + slack) {
      throw new Error(`${name} is only solved for ${variable} from ${x0} to ${x1}; ${x} is outside that.`)
    }
    const position = Math.min(STEPS - 1, Math.max(0, Math.floor((x - x0) / h)))
    const t = (x - xs[position]) / h
    const y0 = states[position][0]
    const y1 = states[position + 1][0]
    const m0 = slopes[position] * h
    const m1 = slopes[position + 1] * h
    const t2 = t * t
    const t3 = t2 * t
    return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * m1
  }

  return { fn, order, from: x0, to: x1 }
}
