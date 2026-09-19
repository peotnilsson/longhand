import { isUnitValue } from './units'

/**
 * The one wrong answer that still looked right.
 *
 *   U  = 0.17 W/(m^2*K)
 *   dT = 22 degC
 *   q  = U*dT
 *
 * mathjs evaluates that to 3.74 W/m² — the same as it would for 22 K — because
 * multiplying drops the offset. But 22 °C is 295.15 K, so if the engineer
 * really meant the temperature rather than the difference, the answer is off by
 * a factor of thirteen. Nothing in the units catches it, nothing in the output
 * looks odd, and the sheet is wrong.
 *
 * A degree Celsius is a point on a scale; a kelvin is an interval. Adding and
 * subtracting them is fine and stays fine. Multiplying or dividing by one is
 * the operation that has no meaning, so that is what this refuses.
 */

const MULTIPLICATIVE = new Set([
  'multiply',
  'divide',
  'pow',
  'dotMultiply',
  'dotDivide',
  'dotPow',
])

/** Units that measure from somewhere other than absolute zero. */
const SCALE_UNITS = /^(degC|degF|celsius|fahrenheit)$/

const onAScale = (value: unknown): boolean =>
  isUnitValue(value) &&
  Array.isArray((value as any).units) &&
  (value as any).units.some((factor: any) => factor?.unit?.offset)

/**
 * The name of an absolute temperature this node stands for, or null.
 *
 * Two shapes reach here. A literal `22 degC` is parsed as an implicit
 * multiplication of a number by a unit symbol, so the whole implicit node is
 * the quantity. A symbol like `dT` is one if the value it holds is one.
 */
function scaleQuantity(node: any, scope: Record<string, unknown>): string | null {
  if (node?.isOperatorNode && node.implicit && node.args?.length === 2) {
    const right = node.args[1]
    if (right?.isSymbolNode && SCALE_UNITS.test(right.name) && scope[right.name] === undefined) {
      const left = node.args[0]
      const shown = left?.isConstantNode ? `${left.value} ${right.name}` : right.name
      return shown
    }
  }
  if (node?.isSymbolNode && !SCALE_UNITS.test(node.name) && onAScale(scope[node.name])) {
    return node.name
  }
  return null
}

/**
 * Check an expression before it is evaluated.
 *
 * Returns the message to show, or null when there is nothing wrong. Written as
 * a check rather than a throw so the caller decides how it surfaces.
 */
export function absoluteTemperatureMisuse(
  node: any,
  scope: Record<string, unknown>,
): string | null {
  let found: string | null = null

  node.traverse((current: any, _path: string, parent: any) => {
    if (found) return
    const what = scaleQuantity(current, scope)
    if (!what) return
    if (!parent?.isOperatorNode) return
    if (parent.implicit) return
    if (!MULTIPLICATIVE.has(parent.fn)) return
    found = what
  })

  if (!found) return null

  return (
    `${found} is a temperature on a scale, not a difference — multiplying by it silently ` +
    'drops the 273.15. Write K for a difference (a rise of 22 degrees is 22 K), or convert ' +
    'it first with -> K if you did mean the absolute temperature.'
  )
}
