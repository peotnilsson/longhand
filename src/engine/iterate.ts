import { create, all } from 'mathjs'

const math = create(all)

/**
 * `f = iterate step(f) from 0.02`
 *
 * The case where an input depends on the answer. Effective length depends on
 * the stiffness that depends on the effective length; a friction factor sits on
 * both sides of Colebrook; a deflection check feeds back into the load it was
 * computed from. On paper an engineer guesses, computes, and writes the new
 * value over the old one until it stops moving — which is a fixed point, and
 * this is that, spelled the way it is done by hand.
 *
 * `solve` can already do many of these by bisection, and where it can it is
 * better: it proves an answer exists by bracketing one. Iteration is for the
 * shape where the sheet naturally reads x ← g(x) and writing it as a root-find
 * would mean rearranging the engineer's own formula.
 */

export interface IterateRequest {
  /** The name the answer is bound to, and the variable fed back in. */
  name: string
  /** The expression evaluated with `name` set to the current guess. */
  expression: string
  /** The first guess. */
  from: string
  /** Relative change that counts as settled. */
  within?: string
}

const PATTERN =
  /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*iterate\s+(.+?)\s+from\s+(.+?)(?:\s+within\s+(.+?))?\s*$/

export function parseIterate(line: string): IterateRequest | null {
  const match = line.match(PATTERN)
  if (!match) return null
  const [, name, expression, from, within] = match
  return { name, expression, from, within }
}

export class IterateError extends Error {}

export interface IterateResult {
  value: unknown
  /** How many times round, which is worth printing: it says how well it behaved. */
  rounds: number
}

/** Enough for anything that converges at all; past this it is not going to. */
const ROUNDS = 500
const DEFAULT_TOLERANCE = 1e-12

/** |new − old| / |new|, so settling means the same at any magnitude. */
function change(next: unknown, previous: unknown): number {
  try {
    const gap = math.abs(math.subtract(next as any, previous as any) as any)
    const size = math.abs(next as any)
    const zero = math.multiply(size as any, 0)
    if (math.equal(size as any, zero as any) === true) {
      return math.number(gap as any)
    }
    return Math.abs(math.number(math.divide(gap as any, size as any) as any))
  } catch {
    return Infinity
  }
}

export function iterate(
  request: IterateRequest,
  scope: Record<string, unknown>,
): IterateResult {
  const working = { ...scope }

  let current: unknown
  try {
    current = math.parse(request.from).evaluate(working)
  } catch (error) {
    throw new IterateError(
      `the first guess "${request.from}" is not a value: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  let tolerance = DEFAULT_TOLERANCE
  if (request.within !== undefined) {
    try {
      tolerance = Math.abs(math.number(math.parse(request.within).evaluate(working) as any))
    } catch {
      throw new IterateError(`"${request.within}" is not a tolerance`)
    }
    if (!(tolerance > 0)) throw new IterateError('a tolerance has to be greater than zero')
  }

  const expression = math.parse(request.expression)
  let previous = current

  for (let round = 1; round <= ROUNDS; round += 1) {
    working[request.name] = current
    let next: unknown
    try {
      next = expression.evaluate(working)
    } catch (error) {
      throw new IterateError(
        `${request.expression} could not be worked out at ${request.name} = ${String(current)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }

    const moved = change(next, current)
    previous = current
    current = next

    if (!Number.isFinite(moved)) {
      throw new IterateError(
        `${request.name} ran away rather than settling — it reached ${String(current)}. ` +
          'Check the formula, or start from a closer guess.',
      )
    }
    if (moved <= tolerance) return { value: current, rounds: round }
  }

  throw new IterateError(
    `${request.name} did not settle in ${ROUNDS} rounds — it is still moving between ` +
      `${String(previous)} and ${String(current)}. Some feedbacks oscillate: try averaging ` +
      'the guess with the result, or use solve with a bracket instead.',
  )
}
