import { create, all } from 'mathjs'

const math = create(all)

/**
 * The two things an engineer does with a table of data: read a value between
 * two rows, and pick the row for a named section. Everything else — sum, max,
 * min, mean — mathjs already does over an array, and a named table's columns
 * are arrays.
 */

const isUnit = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && (value as any).isUnit === true

/** A ratio of two quantities of the same kind, as a plain number. */
const ratio = (a: unknown, b: unknown): number =>
  math.number(math.divide(a as any, b as any) as any)

const show = (value: unknown): string =>
  isUnit(value) ? (value as any).toString() : String(value)

/**
 * Linear interpolation down a pair of columns:
 *
 *   A = interp(h_needed, steel.h, steel.A)
 *
 * The x column may run up or down, which is how printed tables come. Asking
 * for a point outside it is an error rather than an extrapolation — silently
 * extending someone else's table past its last row is how wrong numbers get
 * into a calculation.
 */
export function interp(x: unknown, xs: unknown[], ys: unknown[]): unknown {
  if (!Array.isArray(xs) || !Array.isArray(ys)) {
    throw new Error('interp needs two columns: interp(x, table.x, table.y)')
  }
  if (xs.length !== ys.length) {
    throw new Error(`interp needs columns of the same length (${xs.length} and ${ys.length})`)
  }
  if (xs.length < 2) throw new Error('interp needs at least two rows')

  for (let index = 0; index < xs.length - 1; index += 1) {
    const span = math.subtract(xs[index + 1] as any, xs[index] as any)
    let position: number
    try {
      position = ratio(math.subtract(x as any, xs[index] as any), span)
    } catch {
      throw new Error('interp: x is not the same kind of quantity as the column')
    }
    if (position >= 0 && position <= 1) {
      const rise = math.subtract(ys[index + 1] as any, ys[index] as any)
      return math.add(ys[index] as any, math.multiply(rise as any, position) as any)
    }
  }

  const first = xs[0]
  const last = xs[xs.length - 1]
  throw new Error(`interp: ${show(x)} is outside the table (${show(first)} to ${show(last)})`)
}

/**
 * Pick the row whose label matches:
 *
 *   A = lookup("IPE200", steel.section, steel.A)
 */
export function lookup(key: unknown, keys: unknown[], values: unknown[]): unknown {
  if (!Array.isArray(keys) || !Array.isArray(values)) {
    throw new Error('lookup needs two columns: lookup("name", table.name, table.value)')
  }
  const wanted = String(key).trim().toLowerCase()
  const index = keys.findIndex((candidate) => String(candidate).trim().toLowerCase() === wanted)
  if (index === -1) {
    const available = keys.slice(0, 6).map(show).join(', ')
    throw new Error(
      `lookup: nothing called ${show(key)} in that column (it holds ${available}${
        keys.length > 6 ? ', …' : ''
      })`,
    )
  }
  const value = values[index]
  if (value === undefined) throw new Error(`lookup: that row has no value in this column`)
  return value
}

/** Seeded into every sheet's scope, so they are available without an import. */
export const builtins = (): Record<string, unknown> => ({ interp, lookup })

export const BUILTIN_NAMES = ['interp', 'lookup']
