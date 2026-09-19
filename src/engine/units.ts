import { create, all } from 'mathjs'

export const math = create(all, {})

/**
 * Units mathjs does not ship, which engineers do use.
 *
 * Added rather than worked around: a sheet that has to write 1000 psi instead
 * of 1 ksi is a sheet that will be written somewhere else. Each definition is
 * exact and follows from units mathjs already has, so nothing here introduces
 * a number of its own.
 */
const EXTRA_UNITS: [string, string][] = [
  ['ksi', '1000 psi'],
  ['kip', '1000 lbf'],
  ['klf', '1000 lbf/ft'],
  ['psf', '1 lbf/ft^2'],
]

for (const [name, definition] of EXTRA_UNITS) {
  try {
    ;(math as any).createUnit(name, definition)
  } catch {
    /* already defined by a future mathjs: its definition wins, and that is fine */
  }
}

export type UnitPowers = Record<string, number>

export const isUnitValue = (value: unknown): boolean =>
  typeof (value as any)?.formatUnits === 'function'

export const isUnitName = (name: string): boolean => {
  try {
    return (math as any).Unit.isValuelessUnit(name)
  } catch {
    return false
  }
}

/** The SI dimension signature of a unit symbol, e.g. m and mm share one. */
const dimensionKey = (symbol: string): string | null => {
  try {
    return JSON.stringify((math as any).unit(1, symbol).dimensions)
  } catch {
    return null
  }
}

/** "kN m / (mm mm^2)" -> { kN: 1, m: 1, mm: -3 } */
export function parseUnits(text: string): UnitPowers | null {
  const powers: UnitPowers = {}
  let sign = 1
  for (const part of text.split('/')) {
    for (const token of part.replace(/[()]/g, ' ').split(/[\s*]+/).filter(Boolean)) {
      const match = token.match(/^([A-Za-zµ]+)(?:\^(-?\d+(?:\.\d+)?))?$/)
      if (!match) return null
      const exponent = match[2] ? Number(match[2]) : 1
      powers[match[1]] = (powers[match[1]] ?? 0) + sign * exponent
    }
    sign = -1
  }
  return powers
}

/** { mm: 3 } -> "mm^3";  { kN: 1, mm: -2 } -> "kN/mm^2" */
export function unitString(powers: UnitPowers): string | null {
  const entries = Object.entries(powers).filter(([, power]) => power !== 0)
  if (entries.length === 0) return null
  if (entries.some(([, power]) => !Number.isInteger(power))) return null

  const numerator = entries.filter(([, power]) => power > 0)
  const denominator = entries.filter(([, power]) => power < 0)
  if (numerator.length === 0) return null

  const show = ([symbol, power]: [string, number]) =>
    Math.abs(power) === 1 ? symbol : `${symbol}^${Math.abs(power)}`

  const top = numerator.map(show).join('*')
  return denominator.length ? `${top}/${denominator.map(show).join('/')}` : top
}

/**
 * A unit expression is coherent if no two of its factors measure the same
 * dimension. "kN*m" is coherent; "kN*m/mm^3" is not, because it mixes metres
 * and millimetres, and displaying a stress that way would read 2e-5 kN m/mm^3
 * instead of 20 MPa.
 */
export function isCoherent(powers: UnitPowers): boolean {
  const seen = new Map<string, string>()
  for (const [symbol, power] of Object.entries(powers)) {
    if (power === 0) continue
    const key = dimensionKey(symbol)
    if (key === null) return false
    if (seen.has(key) && seen.get(key) !== symbol) return false
    seen.set(key, symbol)
  }
  return true
}

/**
 * One rule for every number in the app, so the document, the inline results and
 * a table all agree. Scientific from a hundred thousand up, which is where a
 * digit run stops being readable — 1.25e7 mm^3, never 12500000 mm^3 — and the
 * same threshold a table column uses.
 */
export const formatNumber = (value: unknown, precision: number): string =>
  math
    .format(value, { notation: 'auto', precision, lowerExp: -4, upperExp: 5 } as any)
    .replace(/e\+/g, 'e')

/**
 * What a derived quantity should be read in when its own units are not usable.
 *
 * mathjs picks this itself by searching its unit table, and the choice is an
 * accident of what is in the table: defining `ksi` so that engineers can write
 * it silently moved every stress in the app from MPa to ksi, and defining
 * `psf` moved them to pounds per square foot. A calculation tool cannot have
 * its output change because a unit was added at the other end of the codebase.
 *
 * So the choice is made here instead, from a short list per dimension, taking
 * the first candidate that puts the number in a range a person reads without
 * counting zeros. SI first, because that is what the sheets are written in.
 */
const DISPLAY_PREFERENCES = [
  ['Pa', ['MPa', 'kPa', 'GPa', 'Pa']],
  ['N', ['kN', 'N', 'MN']],
  ['J', ['kJ', 'J', 'MJ']],
  ['W', ['kW', 'W', 'MW']],
  ['m', ['mm', 'm', 'km']],
  ['m^2', ['mm^2', 'm^2']],
  ['m^3', ['mm^3', 'm^3', 'L']],
  ['kg', ['kg', 'g', 'tonne']],
  ['N/m', ['kN/m', 'N/m']],
  ['N*m', ['kN*m', 'N*m']],
  ['m/s', ['m/s', 'km/h']],
  ['m/s^2', ['m/s^2']],
  ['kg/m^3', ['kg/m^3']],
  ['s', ['s', 'min', 'h']],
] as const

/** dimension signature -> the units to try, in order. Built once. */
const byDimension = new Map<string, readonly string[]>()
for (const [sample, candidates] of DISPLAY_PREFERENCES) {
  const key = dimensionKey(sample)
  if (key && !byDimension.has(key)) byDimension.set(key, candidates)
}

/** Readable without counting zeros: the same window preferredUnit uses. */
const readable = (magnitude: number): boolean =>
  magnitude === 0 || (magnitude >= 1e-3 && magnitude < 1e5)

function curatedUnit(value: unknown): string | null {
  if (!isUnitValue(value)) return null
  let key: string
  try {
    key = JSON.stringify((value as any).dimensions)
  } catch {
    return null
  }
  const candidates = byDimension.get(key)
  if (!candidates) return null

  let fallback: string | null = null
  for (const candidate of candidates) {
    try {
      const magnitude = Math.abs((value as any).toNumber(candidate))
      if (fallback === null) fallback = candidate
      if (readable(magnitude)) return candidate
    } catch {
      /* not convertible: try the next */
    }
  }
  return fallback
}

/** The unit a quantity should be displayed in, or null to let mathjs decide. */
export function preferredUnit(value: unknown): string | null {
  if (!isUnitValue(value)) return null
  const powers = parseUnits((value as any).formatUnits())
  if (!powers || !isCoherent(powers)) return null
  const target = unitString(powers)
  if (!target) return null
  try {
    const magnitude = Math.abs((value as any).toNumber(target))
    if (magnitude === 0 || (magnitude >= 1e-3 && magnitude < 1e9)) return target
  } catch {
    /* not convertible to its own units */
  }
  return null
}

/**
 * Show a quantity in the units it was written in.
 *
 * mathjs stores the units as constructed but simplifies them for display, which
 * turns a bending moment of 250 kN*m into 250 kJ — dimensionally identical, and
 * something no engineer would ever write.
 */
export function formatValue(value: unknown, precision: number): string {
  if (isVector(value)) return formatVector(toVector(value), precision)
  const target = preferredUnit(value) ?? curatedUnit(value)
  if (target) {
    return `${formatNumber((value as any).toNumber(target), precision)} ${target}`
  }
  return formatNumber(value, precision)
}

/** A range or a list of quantities — anything with elements rather than one value. */
export const isVector = (value: unknown): boolean =>
  Array.isArray(value) ||
  (typeof value === 'object' && value !== null && (value as any).isMatrix === true)

export const toVector = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : ((value as any).toArray() as unknown[])

/** Past this many elements a printed list stops being read and starts being skipped. */
const SHOWN = 10

/**
 * A list, with the unit said once.
 *
 * mathjs would print [1 mm, 2 mm, 3 mm], which is four repetitions of a fact
 * the reader already has. Formatting the elements as a column — the same rule
 * a table uses — keeps the decimal points aligned and lets the unit go at the
 * end, the way it is written on paper.
 */
export function formatVector(values: unknown[], precision: number): string {
  if (values.length === 0) return '[]'
  if (values.some((value) => isVector(value))) {
    return `${values.length} row${values.length === 1 ? '' : 's'} × ${
      toVector(values[0]).length
    } columns`
  }

  const shown = values.length > SHOWN ? values.slice(0, SHOWN) : values
  const formatted = formatColumn(shown, precision)
  const unit = displayUnit(shown.find((value) => isUnitValue(value)))

  const bare = unit
    ? formatted.map((text) => text.replace(new RegExp(`\\s*${escapeUnit(unit)}$`), ''))
    : formatted

  const body = values.length > SHOWN ? `${bare.join(', ')}, …` : bare.join(', ')
  const tail = values.length > SHOWN ? ` (${values.length} values)` : ''
  return `[${body}]${unit ? ` ${unit}` : ''}${tail}`
}

const escapeUnit = (unit: string): string => unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Format in whatever unit `reference` is displayed in, so that a value and its
 * ± uncertainty always read in the same unit — "20 MPa ± 0.27 MPa", never
 * "20 MPa ± 274.6 kPa".
 */
export function formatLike(value: unknown, reference: unknown, precision: number): string {
  const target = displayUnit(reference)
  if (target && isUnitValue(value)) {
    try {
      const number = (value as any).toNumber(target)
      // Match the reference's notation as well as its unit: beside a section
      // modulus printed as 1.25e7 mm^3, a tolerance of 171600 mm^3 is hard to
      // compare at a glance, where 1.716e5 mm^3 is not.
      const exponential = formatReference(reference, target, precision).includes('e')
      const text = exponential
        ? math.format(number, { notation: 'exponential', precision } as any).replace(/e\+?/, 'e')
        : formatNumber(number, precision)
      return `${text} ${target}`
    } catch {
      /* fall through */
    }
  }
  return formatValue(value, precision)
}

const formatReference = (reference: unknown, target: string, precision: number): string => {
  try {
    return formatNumber((reference as any).toNumber(target), precision)
  } catch {
    return formatValue(reference, precision)
  }
}

/**
 * The unit string a quantity should be read in: its own units when those are
 * coherent, otherwise whatever mathjs simplified it to. Never null for a unit
 * value, which matters because math.number() throws on units.
 */
export function displayUnit(value: unknown): string | null {
  if (!isUnitValue(value)) return null
  const preferred = preferredUnit(value) ?? curatedUnit(value)
  if (preferred) return preferred
  const formatted = math.format(value, { notation: 'fixed', precision: 14 } as any)
  const text = formatted.match(/^[-+\d.eE]+\s*(.*)$/)?.[1]?.trim()
  return text ? text : null
}

/** A plain number from a value, in the given unit when it has one. */
export function toNumberIn(value: unknown, unit: string | null): number {
  if (unit && isUnitValue(value)) return (value as any).toNumber(unit)
  return math.number(value as any)
}

/**
 * Unit names worth offering in autocomplete: everything mathjs knows, plus the
 * prefixed forms an engineer actually types, which mathjs derives dynamically
 * and so does not list.
 */
const ENGINEERING = [
  'mm', 'cm', 'dm', 'm', 'km', 'mm^2', 'cm^2', 'm^2', 'mm^3', 'cm^3', 'm^3',
  'N', 'kN', 'MN', 'Pa', 'kPa', 'MPa', 'GPa', 'N*m', 'kN*m', 'N*mm',
  'kg', 'g', 'tonne', 'kg/m^3', 'kN/m', 'kN/m^2', 'kN/m^3',
  's', 'min', 'h', 'Hz', 'rpm', 'J', 'kJ', 'MJ', 'W', 'kW', 'MW', 'kWh',
  'K', 'degC', 'deg', 'rad', 'L', 'mL', 'm/s', 'km/h', 'm/s^2',
  'A', 'V', 'ohm', 'F', 'C',
  'psi', 'ksi', 'kip', 'klf', 'psf', 'lbf', 'inch', 'ft', 'bar', 'atm',
]

export function unitNames(): string[] {
  let known: string[] = []
  try {
    known = Object.keys((math as any).Unit.UNITS)
  } catch {
    known = []
  }
  return [...new Set([...ENGINEERING, ...known])].sort()
}

/**
 * Format a whole table column consistently.
 *
 * Formatting each cell on its own gives a column reading 1.25e7 next to
 * 8440000 — the same rule applied to different magnitudes, which looks like a
 * bug to a reader. So the column picks one unit and one notation for all of
 * its cells, from the range of values it actually holds.
 */
export function formatColumn(values: unknown[], precision: number): string[] {
  const unit = values.map(displayUnit).find((candidate) => candidate !== null) ?? null

  const numbers = values.map((value) => {
    try {
      return toNumberIn(value, unit)
    } catch {
      return NaN
    }
  })

  const magnitudes = numbers.filter((n) => Number.isFinite(n) && n !== 0).map(Math.abs)
  const largest = magnitudes.length ? Math.max(...magnitudes) : 0
  const smallest = magnitudes.length ? Math.min(...magnitudes) : 0
  const exponential = largest >= 1e5 || (smallest > 0 && smallest < 1e-3)

  // One decimal count for the whole column, taken from its largest value, so
  // the decimal points line up: 20.00 / 29.63 / 61.22, never 20 / 29.63 / 61.224.
  // Whole numbers stay whole: nobody writes a 300 mm beam width as 300.0 mm.
  // Whole *within floating-point noise*: a unit value is stored in SI, so
  // 3 * 100 mm comes back as 300.00000000000006 mm and a strict integer test
  // would print the whole column to one decimal place.
  const allIntegers = numbers.every(
    (n) => !Number.isFinite(n) || Math.abs(n - Math.round(n)) <= Math.abs(n) * 1e-10,
  )
  const decimals = allIntegers
    ? 0
    : largest > 0
      ? Math.max(0, precision - 1 - Math.floor(Math.log10(largest)))
      : precision - 1

  return values.map((value, index) => {
    const n = numbers[index]
    if (!Number.isFinite(n)) return formatValue(value, precision)
    const text = exponential
      ? math.format(n, { notation: 'exponential', precision } as any).replace(/e\+?/, 'e')
      : n.toFixed(Math.min(decimals, 10))
    return unit ? `${text} ${unit}` : text
  })
}
