import { create, all } from 'mathjs'

export const math = create(all, {})

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

export const formatNumber = (value: unknown, precision: number): string =>
  math
    .format(value, { notation: 'auto', precision, lowerExp: -4, upperExp: 7 } as any)
    .replace(/e\+/g, 'e')

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
  const target = preferredUnit(value)
  if (target) {
    return `${formatNumber((value as any).toNumber(target), precision)} ${target}`
  }
  return formatNumber(value, precision)
}

/**
 * Format in whatever unit `reference` is displayed in, so that a value and its
 * ± uncertainty always read in the same unit — "20 MPa ± 0.27 MPa", never
 * "20 MPa ± 274.6 kPa".
 */
export function formatLike(value: unknown, reference: unknown, precision: number): string {
  const target = displayUnit(reference)
  if (target && isUnitValue(value)) {
    try {
      return `${formatNumber((value as any).toNumber(target), precision)} ${target}`
    } catch {
      /* fall through */
    }
  }
  return formatValue(value, precision)
}

/**
 * The unit string a quantity should be read in: its own units when those are
 * coherent, otherwise whatever mathjs simplified it to. Never null for a unit
 * value, which matters because math.number() throws on units.
 */
export function displayUnit(value: unknown): string | null {
  if (!isUnitValue(value)) return null
  const preferred = preferredUnit(value)
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
