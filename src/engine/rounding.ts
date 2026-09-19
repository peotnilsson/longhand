/**
 * What comes after the arrow.
 *
 *   sigma = M/W      -> MPa          the unit to read it in
 *   sigma = M/W      -> 3 sf         three significant figures
 *   x     = 1/3      -> 2 dp         two decimal places
 *   b_req = 6*M/...  -> ceil 10 mm   the next width you can actually order
 *
 * The rounding ones change the value, not just how it is printed, and that is
 * deliberate: a required dimension rounded up to a stock size is the number the
 * rest of the sheet has to use. A display-only rounding would let the lines
 * below quietly carry on with 287.4 mm while the sheet says 290 mm, which is
 * exactly the sort of gap between the paper and the arithmetic this tool exists
 * to close.
 *
 * Several can be chained, applied left to right:
 *
 *   b_req = ... -> mm -> ceil 10 mm
 */

import { math, displayUnit, isUnitValue, isVector, toVector } from './units'

export type Directive =
  | { kind: 'unit'; unit: string }
  | { kind: 'sf'; digits: number }
  | { kind: 'dp'; digits: number }
  | { kind: 'step'; mode: 'ceil' | 'floor' | 'round'; step: string }

export function parseDirective(text: string): Directive {
  const trimmed = text.trim()

  const significant = trimmed.match(/^(\d{1,2})\s*(?:sf|s\.f\.|sig|significant(?:\s+figures?)?)$/i)
  if (significant) return { kind: 'sf', digits: Number(significant[1]) }

  const decimals = trimmed.match(/^(\d{1,2})\s*(?:dp|d\.p\.|decimals?|decimal\s+places?)$/i)
  if (decimals) return { kind: 'dp', digits: Number(decimals[1]) }

  const stepped = trimmed.match(/^(ceil|ceiling|up|floor|down|round|nearest)\s+(.+)$/i)
  if (stepped) {
    const word = stepped[1].toLowerCase()
    const mode = word === 'ceil' || word === 'ceiling' || word === 'up'
      ? 'ceil'
      : word === 'floor' || word === 'down'
        ? 'floor'
        : 'round'
    return { kind: 'step', mode, step: stepped[2].trim() }
  }

  return { kind: 'unit', unit: trimmed }
}

const round = (value: number, mode: 'ceil' | 'floor' | 'round'): number =>
  mode === 'ceil' ? Math.ceil(value) : mode === 'floor' ? Math.floor(value) : Math.round(value)

/**
 * Apply one directive, keeping the quantity a quantity.
 *
 * Everything works through the unit the value is displayed in, so "3 sf" on a
 * moment of 172.8 kN·m gives 173 kN·m rather than three significant figures of
 * its value in joules.
 */
export function applyDirective(
  value: unknown,
  directive: Directive,
  scope: Record<string, unknown>,
): unknown {
  // A list takes the directive element by element: `-> mm^2` on a column of
  // areas means every one of them in mm², not a conversion of the list itself.
  if (isVector(value)) {
    return toVector(value).map((element) => applyDirective(element, directive, scope))
  }

  if (directive.kind === 'unit') {
    if (!isUnitValue(value)) {
      throw new Error(`Cannot convert a plain number to ${directive.unit}`)
    }
    return (value as any).to(directive.unit)
  }

  if (directive.kind === 'step') {
    const step = math.parse(directive.step).evaluate(scope)
    const stepIsUnit = isUnitValue(step)
    if (stepIsUnit !== isUnitValue(value)) {
      throw new Error(
        stepIsUnit
          ? `Cannot round a plain number to ${directive.step}`
          : `Rounding to ${directive.step} needs a step with the same units`,
      )
    }

    if (!stepIsUnit) {
      const size = math.number(step as any)
      if (!(size > 0)) throw new Error('A rounding step has to be greater than zero')
      return round(math.number(value as any) / size, directive.mode) * size
    }

    const unit = displayUnit(step)!
    const size = (step as any).toNumber(unit)
    if (!(size > 0)) throw new Error('A rounding step has to be greater than zero')
    let amount: number
    try {
      amount = (value as any).toNumber(unit)
    } catch {
      throw new Error(`Cannot round this to ${directive.step}: the units do not match`)
    }
    return math.unit(round(amount / size, directive.mode) * size, unit)
  }

  // sf and dp, done in the unit the value reads in.
  const unit = displayUnit(value)
  const amount = unit ? (value as any).toNumber(unit) : math.number(value as any)
  if (!Number.isFinite(amount)) return value

  const rounded =
    directive.kind === 'sf'
      ? amount === 0
        ? 0
        : Number(amount.toPrecision(Math.max(1, Math.min(15, directive.digits))))
      : Number(amount.toFixed(Math.max(0, Math.min(15, directive.digits))))

  return unit ? math.unit(rounded, unit) : rounded
}

/**
 * Split a line into its body and the directives after each arrow.
 *
 * `->` cannot occur inside an expression, so a plain split is safe; the only
 * thing to be careful of is a string, which `splitNote` has already dealt with
 * by the time this runs.
 */
export function splitArrows(line: string): { body: string; directives: string[] } {
  const parts = line.split('->')
  return {
    body: parts[0].trim(),
    directives: parts.slice(1).map((part) => part.trim()).filter(Boolean),
  }
}
