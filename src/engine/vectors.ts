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
 * Make `^` element-wise.
 *
 * mathjs reads `d^2` on a list as matrix exponentiation, which needs a square
 * matrix and so fails on every vector an engineer would write. A calculation
 * sheet has no use for a matrix power, and `A(d) = pi*d^2/4` applied down a
 * list of diameters is an obvious thing to want, so `^` is rewritten to `.^`
 * before evaluation. On plain numbers the two are the same operation.
 *
 * Only the tree that gets evaluated is rewritten. The formula is rendered from
 * the tree as it was written, so the page still shows d², not d.^2.
 */
export function elementwisePowers(node: any): any {
  return node.transform((n: any) => {
    if (n.isOperatorNode && n.op === '^') {
      const rewritten = n.clone()
      rewritten.op = '.^'
      rewritten.fn = 'dotPow'
      return rewritten
    }
    return n
  })
}
