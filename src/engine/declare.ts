import { math, isUnitValue } from './units'

/**
 * Two ways a sheet says what it means before it starts calculating: naming a
 * unit its own field uses, and saying what kind of quantity a function takes.
 */

// ------------------------------------------------------------- user-defined units

/**
 * `unit ksi = 1000 psi`
 *
 * Adding `ksi` to the engine to make one verification case work silently moved
 * every stress in the app from MPa to ksi, because mathjs picks a display unit
 * by searching its own table. That is fixed — the display list in units.ts is
 * ours now — which is what makes it safe to let a sheet define units at all.
 *
 * The definition is global to the mathjs instance and overwrites a previous one
 * of the same name, so re-running a sheet is harmless and two sheets that
 * define the same name the same way do not fight. Two sheets that define it
 * *differently* would, which is why the line prints what it defined.
 */
export interface UnitDefinition {
  name: string
  definition: string
}

const UNIT_LINE = /^unit\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+?)\s*$/

export function parseUnitLine(line: string): UnitDefinition | null {
  const match = line.match(UNIT_LINE)
  return match ? { name: match[1], definition: match[2] } : null
}

/** Names mathjs already uses for something else, which must not be shadowed. */
const RESERVED = /^(e|i|pi|true|false|null|Infinity|NaN|end)$/

export function defineUnit({ name, definition }: UnitDefinition): string {
  if (RESERVED.test(name)) {
    throw new Error(`${name} already means something in a formula — choose another name`)
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`"${name}" is not a usable unit name`)
  }

  // Check the right-hand side means something before defining anything, so a
  // typo leaves the sheet's vocabulary exactly as it was.
  let sample: unknown
  try {
    sample = math.evaluate(definition)
  } catch (error) {
    throw new Error(
      `${definition} is not a quantity: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!isUnitValue(sample)) {
    throw new Error(`a unit has to be defined as a quantity with units — "${definition}" has none`)
  }

  try {
    ;(math as any).createUnit(name, { definition }, { override: true })
  } catch (error) {
    throw new Error(
      `${name} could not be defined: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  return `${name} = ${definition}`
}

// -------------------------------------------------------- dimensions on functions

/**
 * `A(d: length) = pi*d^2/4`
 *
 * Without this, calling `A(20 kN)` computes something, and the mistake shows up
 * several lines later as a stress in the wrong units — if it shows up at all.
 * With it the call itself stops, naming the argument and what it expected.
 *
 * The kinds are named rather than written as units on purpose: an engineer
 * writing a function thinks "this takes a length", not "this takes something
 * dimensionally equal to a metre".
 */
const KINDS: Record<string, string | null> = {
  number: null,
  ratio: null,
  factor: null,
  length: 'm',
  area: 'm^2',
  volume: 'm^3',
  mass: 'kg',
  time: 's',
  force: 'N',
  moment: 'N*m',
  pressure: 'Pa',
  stress: 'Pa',
  energy: 'J',
  power: 'W',
  temperature: 'K',
  angle: 'rad',
  velocity: 'm/s',
  speed: 'm/s',
  acceleration: 'm/s^2',
  density: 'kg/m^3',
  frequency: 'Hz',
  load: 'N/m',
}

export const KIND_NAMES = Object.keys(KINDS)

export interface Signature {
  name: string
  /** Parameter name to declared kind, for the parameters that declared one. */
  kinds: Record<string, string>
  /** The line with the annotations removed, ready for mathjs. */
  body: string
}

const SIGNATURE = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*=\s*(.+)$/

/**
 * Pull the annotations out of a function definition.
 *
 * mathjs has never heard of `d: length`, so the annotations are stripped here
 * and the plain definition is what it parses. Returns null when the line is not
 * an annotated function definition, which leaves every other line untouched.
 */
export function parseSignature(line: string): Signature | null {
  const match = line.match(SIGNATURE)
  if (!match) return null
  const [, name, parameters, rest] = match
  if (!parameters.includes(':')) return null

  const kinds: Record<string, string> = {}
  const plain: string[] = []

  for (const parameter of parameters.split(',')) {
    const [rawName, rawKind] = parameter.split(':')
    const parameterName = rawName.trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(parameterName)) return null
    plain.push(parameterName)
    if (rawKind !== undefined) {
      const kind = rawKind.trim().toLowerCase()
      if (!(kind in KINDS)) {
        throw new Error(
          `"${kind}" is not a kind of quantity. Try one of: ${KIND_NAMES.join(', ')}.`,
        )
      }
      kinds[parameterName] = kind
    }
  }

  return { name, kinds, body: `${name}(${plain.join(', ')}) = ${rest}` }
}

const dimensionsOf = (value: unknown): string | null => {
  try {
    return JSON.stringify((value as any).dimensions)
  } catch {
    return null
  }
}

const sampleDimensions = (kind: string): string | null => {
  const unit = KINDS[kind]
  if (!unit) return null
  try {
    return JSON.stringify((math as any).unit(1, unit).dimensions)
  } catch {
    return null
  }
}

/**
 * Wrap a function so its arguments are checked before its body runs.
 *
 * The declared kinds are positional, matched against the parameter names in
 * order, because that is the order the caller wrote them in.
 */
export function checked(
  fn: (...args: unknown[]) => unknown,
  signature: Signature,
  order: string[],
): (...args: unknown[]) => unknown {
  const expected = order.map((parameter) => signature.kinds[parameter])

  return (...args: unknown[]) => {
    args.forEach((argument, index) => {
      const kind = expected[index]
      if (!kind) return

      const wanted = sampleDimensions(kind)
      if (wanted === null) {
        // A plain number was asked for.
        if (isUnitValue(argument)) {
          throw new Error(
            `${signature.name} expects ${order[index]} to be a plain ${kind}, and got ${String(
              argument,
            )}`,
          )
        }
        return
      }

      if (!isUnitValue(argument)) {
        throw new Error(
          `${signature.name} expects ${order[index]} to be a ${kind}, and got ${String(
            argument,
          )} with no units`,
        )
      }
      if (dimensionsOf(argument) !== wanted) {
        throw new Error(
          `${signature.name} expects ${order[index]} to be a ${kind}, and got ${String(argument)}`,
        )
      }
    })
    return fn(...args)
  }
}
