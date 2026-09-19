import { create, all } from 'mathjs'

const math = create(all)

/**
 * The functions an engineering sheet needs that mathjs does not have, or does
 * not have in the shape an engineer would write.
 *
 * Everything here works on the arrays a named table publishes as its columns,
 * and everything here carries units through rather than demanding plain
 * numbers — which is the whole reason it exists rather than being left to
 * mathjs's own statistics.
 */

const isUnit = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && (value as any).isUnit === true

const show = (value: unknown): string =>
  isUnit(value) ? (value as any).toString() : String(value)

/** A ratio of two quantities of the same kind, as a plain number. */
const ratio = (a: unknown, b: unknown): number =>
  math.number(math.divide(a as any, b as any) as any)

const asArray = (value: unknown, what: string): unknown[] => {
  if (Array.isArray(value)) return value
  if (typeof (value as any)?.toArray === 'function') return (value as any).toArray()
  throw new Error(`${what} needs a column of values — use a named table, or a range like 1..10`)
}

const sameLength = (a: unknown[], b: unknown[], what: string): void => {
  if (a.length !== b.length) {
    throw new Error(`${what} needs columns of the same length (${a.length} and ${b.length})`)
  }
}

// ------------------------------------------------------------------ statistics

/**
 * The mean, in the units of the column.
 *
 * mathjs can already do this; it is re-exported here so that `mean`, `sd` and
 * `regression` all behave the same way about empty columns and about labels
 * that crept in from a text cell.
 */
const numeric = (values: unknown[], what: string): unknown[] => {
  const kept = values.filter((value) => typeof value === 'number' || isUnit(value))
  if (kept.length === 0) throw new Error(`${what}: that column holds no numbers`)
  return kept
}

export function mean(column: unknown): unknown {
  const values = numeric(asArray(column, 'mean'), 'mean')
  return math.divide(
    values.reduce((sum, value) => math.add(sum as any, value as any)) as any,
    values.length,
  )
}

/**
 * The sample standard deviation — n − 1 in the denominator.
 *
 * A measurement series is a sample of a larger population, not the population
 * itself, and the n − 1 form is what every laboratory course and every
 * measurement standard means by "the standard deviation of these readings".
 */
export function sd(column: unknown): unknown {
  const values = numeric(asArray(column, 'sd'), 'sd')
  if (values.length < 2) {
    throw new Error('sd needs at least two readings — one reading has no spread')
  }
  const average = mean(values)
  let sumOfSquares: unknown = null
  for (const value of values) {
    const deviation = math.subtract(value as any, average as any)
    const square = math.multiply(deviation as any, deviation as any)
    sumOfSquares = sumOfSquares === null ? square : math.add(sumOfSquares as any, square)
  }
  return math.sqrt(math.divide(sumOfSquares as any, values.length - 1) as any)
}

/** The spread of the mean itself, which is what an uncertainty budget wants. */
export function sem(column: unknown): unknown {
  const values = numeric(asArray(column, 'sem'), 'sem')
  return math.divide(sd(values) as any, Math.sqrt(values.length))
}

interface Fit {
  slope: unknown
  intercept: unknown
  r2: number
}

/**
 * Ordinary least squares through two columns.
 *
 * Returned as three separate functions rather than one object, because a sheet
 * prints values and an object printed into the middle of a calculation is the
 * same mistake as printing a whole table there. The fit is computed once and
 * cached on the arrays, so asking for all three costs one pass.
 */
const fits = new WeakMap<object, Fit>()

function fit(xColumn: unknown, yColumn: unknown): Fit {
  const xs = asArray(xColumn, 'the fit')
  const ys = asArray(yColumn, 'the fit')
  sameLength(xs, ys, 'a fit')

  const cached = fits.get(xs as object)
  if (cached) return cached
  if (xs.length < 2) throw new Error('a fit needs at least two points')

  const xBar = mean(xs)
  const yBar = mean(ys)

  let sxy: unknown = null
  let sxx: unknown = null
  let syy: unknown = null
  for (let index = 0; index < xs.length; index += 1) {
    const dx = math.subtract(xs[index] as any, xBar as any)
    const dy = math.subtract(ys[index] as any, yBar as any)
    const xy = math.multiply(dx as any, dy as any)
    const xx = math.multiply(dx as any, dx as any)
    const yy = math.multiply(dy as any, dy as any)
    sxy = sxy === null ? xy : math.add(sxy as any, xy as any)
    sxx = sxx === null ? xx : math.add(sxx as any, xx as any)
    syy = syy === null ? yy : math.add(syy as any, yy as any)
  }

  let slope: unknown
  try {
    slope = math.divide(sxy as any, sxx as any)
  } catch {
    throw new Error('a fit needs an x column that varies')
  }
  const intercept = math.subtract(yBar as any, math.multiply(slope as any, xBar as any) as any)

  // r² = Sxy² / (Sxx · Syy), which is dimensionless however the columns are measured.
  let r2 = 0
  try {
    const top = math.multiply(sxy as any, sxy as any)
    const bottom = math.multiply(sxx as any, syy as any)
    r2 = Math.min(1, Math.max(0, ratio(top, bottom)))
  } catch {
    r2 = 0
  }

  const result = { slope, intercept, r2 }
  fits.set(xs as object, result)
  return result
}

export const slope = (xs: unknown, ys: unknown): unknown => fit(xs, ys).slope
export const intercept = (xs: unknown, ys: unknown): unknown => fit(xs, ys).intercept
export const r2 = (xs: unknown, ys: unknown): number => fit(xs, ys).r2

// -------------------------------------------------------------------- choosing

const truthy = (value: unknown): boolean => value === true || value === 1

/**
 * The lightest section that still passes.
 *
 * A table with a computed verdict column already answers "which of these
 * work"; this answers the question after it. `where` is that verdict column,
 * and leaving it out considers every row.
 */
function bestIndex(
  values: unknown[],
  where: unknown[] | undefined,
  wanted: 'smallest' | 'largest',
  what: string,
): number {
  let best = -1
  for (let index = 0; index < values.length; index += 1) {
    if (where && !truthy(where[index])) continue
    const value = values[index]
    if (!(typeof value === 'number' || isUnit(value))) continue
    if (best === -1) {
      best = index
      continue
    }
    const better =
      wanted === 'smallest'
        ? math.smaller(value as any, values[best] as any)
        : math.larger(value as any, values[best] as any)
    if (better) best = index
  }
  if (best === -1) {
    throw new Error(
      where
        ? `${what}: no row passes, so there is nothing to choose`
        : `${what}: that column holds no numbers`,
    )
  }
  return best
}

const columns = (values: unknown, where: unknown, what: string) => ({
  values: asArray(values, what),
  where: where === undefined ? undefined : asArray(where, what),
})

export function smallest(values: unknown, where?: unknown): unknown {
  const pair = columns(values, where, 'smallest')
  if (pair.where) sameLength(pair.values, pair.where, 'smallest')
  return pair.values[bestIndex(pair.values, pair.where, 'smallest', 'smallest')]
}

export function largest(values: unknown, where?: unknown): unknown {
  const pair = columns(values, where, 'largest')
  if (pair.where) sameLength(pair.values, pair.where, 'largest')
  return pair.values[bestIndex(pair.values, pair.where, 'largest', 'largest')]
}

/** The label of the row with the smallest value — "which section", not "how big". */
export function pick(labels: unknown, values: unknown, where?: unknown): unknown {
  const names = asArray(labels, 'pick')
  const pair = columns(values, where, 'pick')
  sameLength(names, pair.values, 'pick')
  if (pair.where) sameLength(names, pair.where, 'pick')
  return names[bestIndex(pair.values, pair.where, 'smallest', 'pick')]
}

export function pick_largest(labels: unknown, values: unknown, where?: unknown): unknown {
  const names = asArray(labels, 'pick_largest')
  const pair = columns(values, where, 'pick_largest')
  sameLength(names, pair.values, 'pick_largest')
  if (pair.where) sameLength(names, pair.where, 'pick_largest')
  return names[bestIndex(pair.values, pair.where, 'largest', 'pick_largest')]
}

/** How many rows pass, which is the sentence under a table of sections. */
export function count_where(where: unknown): number {
  return asArray(where, 'count_where').filter(truthy).length
}

// --------------------------------------------------------------- interpolation

/**
 * Interpolation into a table with two entry arguments.
 *
 * Code tables are printed as a grid — a row per thickness, a column per
 * temperature — but they arrive here as three equal-length columns, because
 * that is how a `table` block holds them. The lattice is recovered from the
 * unique values of the first two, which is exactly the shape a printed table
 * has.
 */
export function interp2(
  x: unknown,
  y: unknown,
  xs: unknown,
  ys: unknown,
  zs: unknown,
): unknown {
  const xColumn = asArray(xs, 'interp2')
  const yColumn = asArray(ys, 'interp2')
  const zColumn = asArray(zs, 'interp2')
  sameLength(xColumn, yColumn, 'interp2')
  sameLength(xColumn, zColumn, 'interp2')

  const axis = (column: unknown[]): unknown[] => {
    const seen: unknown[] = []
    for (const value of column) {
      if (!seen.some((other) => equal(other, value))) seen.push(value)
    }
    return seen.sort((a, b) => (math.smaller(a as any, b as any) ? -1 : 1))
  }

  const xAxis = axis(xColumn)
  const yAxis = axis(yColumn)
  if (xAxis.length < 2 || yAxis.length < 2) {
    throw new Error('interp2 needs at least two values along each axis')
  }

  const bracket = (value: unknown, values: unknown[], which: string): [number, number, number] => {
    for (let index = 0; index < values.length - 1; index += 1) {
      const span = math.subtract(values[index + 1] as any, values[index] as any)
      let position: number
      try {
        position = ratio(math.subtract(value as any, values[index] as any), span)
      } catch {
        throw new Error(`interp2: ${which} is not the same kind of quantity as that column`)
      }
      if (position >= 0 && position <= 1) return [index, index + 1, position]
    }
    throw new Error(
      `interp2: ${show(value)} is outside the table (${show(values[0])} to ${show(
        values[values.length - 1],
      )})`,
    )
  }

  const [x0, x1, tx] = bracket(x, xAxis, 'x')
  const [y0, y1, ty] = bracket(y, yAxis, 'y')

  const at = (i: number, j: number): unknown => {
    const found = zColumn.find(
      (_value, index) => equal(xColumn[index], xAxis[i]) && equal(yColumn[index], yAxis[j]),
    )
    if (found === undefined) {
      throw new Error(
        `interp2: the table has no row for ${show(xAxis[i])}, ${show(yAxis[j])} — it is not a full grid`,
      )
    }
    return found
  }

  // Along x at each of the two y rows, then between those two along y.
  const blend = (low: unknown, high: unknown, t: number): unknown =>
    math.add(low as any, math.multiply(math.subtract(high as any, low as any) as any, t) as any)

  const lower = blend(at(x0, y0), at(x1, y0), tx)
  const upper = blend(at(x0, y1), at(x1, y1), tx)
  return blend(lower, upper, ty)
}

const equal = (a: unknown, b: unknown): boolean => {
  try {
    return math.equal(a as any, b as any) === true
  } catch {
    return a === b
  }
}

// ------------------------------------------------------------------- calculus

const callable = (f: unknown, what: string): ((x: unknown) => unknown) => {
  if (typeof f !== 'function') {
    throw new Error(`${what} needs a function you defined, like ${what}(f, …) after f(x) = …`)
  }
  return f as (x: unknown) => unknown
}

/**
 * ∫f dx between two limits, by adaptive Simpson.
 *
 * Adaptive rather than a fixed number of strips because a beam load that is
 * flat over most of a span and steep at one end is the normal case, and a
 * fixed rule either wastes effort or quietly gets that end wrong. The limits
 * carry units and so does the result: integrating kN/m over metres gives kN.
 */
export function integral(f: unknown, from: unknown, to: unknown, tolerance = 1e-10): unknown {
  const fn = callable(f, 'integral')
  const span = math.subtract(to as any, from as any)

  const value = (t: number): unknown => fn(math.add(from as any, math.multiply(span as any, t) as any))

  // Work in the dimensionless parameter t from 0 to 1, then scale by the span
  // once at the end, so the unit algebra happens in one place.
  const unitOf = (sample: unknown): unknown => sample
  const asNumber = (sample: unknown, reference: unknown): number => {
    if (typeof sample === 'number') return sample
    return ratio(sample, reference)
  }

  const reference = unitOf(value(0.5))
  const at = (t: number): number => asNumber(value(t), reference)

  const simpson = (a: number, b: number, fa: number, fm: number, fb: number): number =>
    ((b - a) / 6) * (fa + 4 * fm + fb)

  const refine = (
    a: number,
    b: number,
    fa: number,
    fm: number,
    fb: number,
    whole: number,
    depth: number,
  ): number => {
    const m = (a + b) / 2
    const lm = (a + m) / 2
    const rm = (m + b) / 2
    const flm = at(lm)
    const frm = at(rm)
    const left = simpson(a, m, fa, flm, fm)
    const right = simpson(m, b, fm, frm, fb)
    if (depth > 16 || Math.abs(left + right - whole) <= 15 * tolerance * Math.max(1, Math.abs(whole))) {
      return left + right + (left + right - whole) / 15
    }
    return (
      refine(a, m, fa, flm, fm, left, depth + 1) + refine(m, b, fm, frm, fb, right, depth + 1)
    )
  }

  const fa = at(0)
  const fm = at(0.5)
  const fb = at(1)
  const area = refine(0, 1, fa, fm, fb, simpson(0, 1, fa, fm, fb), 0)

  if (!Number.isFinite(area)) {
    throw new Error('integral: the function did not give a number everywhere between the limits')
  }
  return math.multiply(math.multiply(reference as any, area) as any, span as any)
}

/**
 * df/dx at a point, by a central difference on a step scaled to x.
 *
 * Numeric rather than symbolic on purpose: it works for a function built from
 * lookups and conditionals, which is what an engineer's own functions usually
 * are, and the central difference is exact for anything quadratic.
 */
export function deriv(f: unknown, x: unknown): unknown {
  const fn = callable(f, 'deriv')
  const step = math.multiply(x as any, 1e-6)
  const stepped = isUnit(step) && ratio(step, x) === 0 ? math.multiply(x as any, 1e-6) : step

  const ahead = fn(math.add(x as any, stepped as any))
  const behind = fn(math.subtract(x as any, stepped as any))
  return math.divide(
    math.subtract(ahead as any, behind as any) as any,
    math.multiply(stepped as any, 2) as any,
  )
}

export const LIBRARY_NAMES = [
  'mean',
  'sd',
  'sem',
  'slope',
  'intercept',
  'r2',
  'smallest',
  'largest',
  'pick',
  'pick_largest',
  'count_where',
  'interp2',
  'integral',
  'deriv',
]

export const library = (): Record<string, unknown> => ({
  mean,
  sd,
  sem,
  slope,
  intercept,
  r2,
  smallest,
  largest,
  pick,
  pick_largest,
  count_where,
  interp2,
  integral,
  deriv,
})
