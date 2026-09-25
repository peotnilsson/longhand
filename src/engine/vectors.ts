/**
 * Ranges, and the arithmetic that comes with them.
 *
 *   i   = 1..10            every integer from 1 to 10, 10 included
 *   n   = 0..1 step 0.25   0, 0.25, 0.5, 0.75, 1
 *   x   = i*100 mm         every element scaled
 *   L   = sum(w)           and the usual reductions over the result
 *
 * A range is a list of plain numbers on purpose. Load combinations, span
 * numbers and factor sweeps are counts and multipliers; the quantity comes from
 * multiplying the range by something with units, which keeps one obvious rule
 * instead of a second unit system that only applies inside brackets.
 *
 * `..` is sugar. It is rewritten to a `range(...)` call before the expression
 * is parsed, so everything downstream — substitution, the dependency graph, the
 * solver — sees an ordinary function call and needs to know nothing about it.
 */
import { math } from './units'

const OPERAND = String.raw`(\([^()]*\)|[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?|\d+(?:\.\d+)?)`

const STEPPED = new RegExp(`${OPERAND}\\s*\\.\\.\\s*${OPERAND}\\s+step\\s+${OPERAND}`, 'g')
const PLAIN = new RegExp(`${OPERAND}\\s*\\.\\.\\s*${OPERAND}`, 'g')

/** Rewrite the `..` sugar outside string literals, which may contain anything. */
export function expandRanges(expression: string): string {
  let out = ''
  let index = 0
  let plain = ''

  const flush = () => {
    out += plain.replace(STEPPED, 'range($1, $2, $3)').replace(PLAIN, 'range($1, $2)')
    plain = ''
  }

  while (index < expression.length) {
    const character = expression[index]
    if (character === '"' || character === "'") {
      flush()
      const end = expression.indexOf(character, index + 1)
      if (end === -1) {
        out += expression.slice(index)
        return out
      }
      out += expression.slice(index, end + 1)
      index = end + 1
      continue
    }
    plain += character
    index += 1
  }

  flush()
  return out
}

/**
 * An inclusive range, which is the one engineers mean.
 *
 * mathjs has its own `range`, and it stops before the end — `range(1, 10)` is
 * nine numbers. Writing `1..10` and getting nine of them is the kind of
 * off-by-one that survives into a submitted calculation, so this shadows it.
 */
export function range(start: unknown, end: unknown, step: unknown = 1): number[] {
  const from = Number(start)
  const to = Number(end)
  const by = Number(step)

  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(by)) {
    throw new Error('A range needs plain numbers: 1..10, or 0..1 step 0.25')
  }
  if (by === 0) throw new Error('A range step cannot be zero')
  if (by < 0) throw new Error('Write a range upwards — 1..10 — and reverse it if you need to')
  if (to < from) throw new Error(`An empty range: ${from}..${to} counts downwards`)

  const count = Math.floor((to - from) / by + 1e-9) + 1
  if (count > 10_000) {
    throw new Error(`That range holds ${count} values — more than a calculation sheet can show`)
  }

  const values: number[] = []
  for (let index = 0; index < count; index += 1) {
    // Accumulating would drift: 0 + 0.1 ten times is not 1.
    values.push(from + index * by)
  }
  return values
}

/**
 * Make `^` mean what it looks like, for lists as well as numbers.
 *
 * mathjs reads `d^2` on a list as matrix exponentiation, which needs a square
 * matrix and so fails on every vector an engineer would write, while
 * `A(d) = pi*d^2/4` applied down a list of diameters is an obvious thing to
 * want. So `^` is evaluated through a helper that decides at the moment it
 * has the value in hand: element by element for a list, and a real matrix
 * power for a matrix — which used to be silently element-wise too, so
 * `[1,2;3,4]^2` gave [1,4;9,16] under a typeset M².
 *
 * Only the tree that gets evaluated is rewritten. The formula is rendered from
 * the tree as it was written, so the page still shows d², not power(d, 2).
 */
export function elementwisePowers(node: any): any {
  return node.transform((n: any) => {
    if (n.isOperatorNode && n.op === '^' && n.args.length === 2) {
      return new (math as any).FunctionNode(new (math as any).SymbolNode(POWER), [
        elementwisePowers(n.args[0]),
        elementwisePowers(n.args[1]),
      ])
    }
    return n
  })
}

/** The name the rewritten `^` calls. Underscored so a sheet cannot shadow it. */
export const POWER = '__power'

/** Element by element for a list, a true matrix power for a matrix. */
export function power(base: unknown, exponent: unknown): unknown {
  const rows = Array.isArray(base) ? base : (base as any)?.isMatrix ? (base as any).toArray() : null
  const isMatrix = Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0])
  return isMatrix ? (math as any).pow(base, exponent) : (math as any).dotPow(base, exponent)
}
