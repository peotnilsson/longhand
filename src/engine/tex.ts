import { math, isUnitName } from './units'
import type { MathNode } from 'mathjs'

const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma',
  'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
])

/**
 * Engineers write M_Ed, f_ck, sigma_max. mathjs renders those as literal
 * underscores and spaced-out italics. Render them as written on paper:
 * variables italic, units upright, real subscripts, Greek where meant.
 *
 * The braces around single letters matter: mathjs concatenates our output onto
 * things like \cdot, and "\cdot m" without a group becomes \cdotm.
 */
export function symbolToTex(name: string, scope: Record<string, unknown> = {}): string {
  const [head, ...rest] = name.split('_')
  const upright = !(name in scope) && isUnitName(name)
  const base = GREEK.has(head)
    ? `\\${head}`
    : head.length === 1 && !upright
      ? `{${head}}`
      : `\\mathrm{${head}}`
  if (rest.length === 0) return base
  const sub = rest.join('\\_')
  return `${base}_{${GREEK.has(sub) ? `\\${sub}` : `\\mathrm{${sub}}`}}`
}

/** mathjs writes exponents as 10^{+7} and the micro prefix as "um". */
const cleanTex = (tex: string): string =>
  tex
    .replace(/10\^\{\+/g, '10^{')
    .replace(/\\mathrm\{u([A-Za-z]{1,2})\}/g, '\\mathrm{\\mu $1}')
    // a function called A_circle must render as A subscript circle, not with a
    // literal underscore inside \mathrm
    .replace(/\\mathrm\{([A-Za-z]+)_([A-Za-z0-9]+)\}/g, '\\mathrm{$1}_{\\mathrm{$2}}')

export const toTex = (node: MathNode, scope: Record<string, unknown>): string =>
  cleanTex(
    node.toTex({
      handler: (n: any) => {
        if (n.isSymbolNode) return symbolToTex(n.name, scope)
        // steel.W_el is a column of a named table: set it upright as one name
        // rather than letting the underscore become a subscript of a subscript.
        if (n.isAccessorNode && n.object?.isSymbolNode) {
          const column = n.index?.dimensions?.[0]
          const name = column?.value ?? column?.name
          if (typeof name === 'string') {
            return `\\mathrm{${escapeName(n.object.name)}}.\\mathrm{${escapeName(name)}}`
          }
        }
        return undefined
      },
    } as any),
  )

const escapeName = (name: string): string => name.replace(/_/g, '\\_')

/**
 * Render an already-formatted value string ("250 kN*m") as TeX.
 *
 * The number is kept exactly as it was formatted. Handing it back to mathjs to
 * re-render would give a second opinion on notation — it turns 9375000 into
 * 9.375e6 while our own formatter leaves it plain — and a value printed one way
 * beside its own ± printed the other is the kind of thing a reviewer stops at.
 */
export function valueToTex(formatted: string, scope: Record<string, unknown>): string {
  // A list, as formatVector writes it: "[1, 2, 3] mm" or "[1, 2, …] mm (20 values)".
  const list = formatted.match(/^\[(.*)\]\s*([^\s(]*)\s*(\(\d+ values\))?$/)
  if (list) {
    const [, body, unit, count] = list
    const elements = body
      .split(',')
      .map((element) => element.trim())
      .map((element) => (element === '…' ? '\\dots' : numberToTex(element)))
      .join(',\\; ')
    const tail = count ? `\\;\\text{${count.replace(/[()]/g, '')}}` : ''
    return `\\left[${elements}\\right]${unit ? `~${unitToTex(unit)}` : ''}${tail}`
  }

  const match = formatted.match(/^(-?[\d.]+(?:e[+-]?\d+)?)(\s+(.*))?$/)
  if (match) {
    const [, number, , unit] = match
    const tex = numberToTex(number)
    return unit ? `${tex}~${unitToTex(unit)}` : tex
  }
  try {
    return toTex(math.parse(formatted), scope)
  } catch {
    return `\\text{${formatted}}`
  }
}

/**
 * "kN/m" becomes a fraction, "mm^3" a power, "kN*m" a product.
 *
 * Written out here rather than handed to mathjs, which renders a unit only as
 * part of a quantity: asking it for "1 kN/m" and removing the 1 leaves the 1
 * stranded in the numerator, which is how the landing-page screenshot came to
 * read 6 · (1 kN)/m.
 */
export function unitToTex(unit: string): string {
  const factors = parseUnitFactors(unit.trim())
  if (factors.length === 0) return `\\mathrm{${unit}}`

  const above = factors.filter((factor) => factor.power > 0)
  const below = factors.filter((factor) => factor.power < 0)
  const top = above.length ? above.map(render).join('\\cdot ') : '1'
  if (below.length === 0) return top

  const bottom = below
    .map((factor) => render({ name: factor.name, power: -factor.power }))
    .join('\\cdot ')
  return `\\frac{${top}}{${bottom}}`
}

const render = ({ name, power }: { name: string; power: number }): string => {
  const upright = `\\mathrm{${name.replace(/µ/g, '\\mu ')}}`
  return power === 1 ? upright : `${upright}^{${power}}`
}

/**
 * Read a unit string into signed factors, so "W/m^2/K" and "W/(m^2*K)" — the
 * two ways the same unit gets written — both come out as W over m² K. A slash
 * applies to the one factor or bracketed group that follows it, which is how
 * an engineer reads it and how mathjs writes it.
 */
function parseUnitFactors(unit: string, outerSign = 1): { name: string; power: number }[] {
  const factors: { name: string; power: number }[] = []
  let index = 0
  let sign = outerSign

  while (index < unit.length) {
    const character = unit[index]

    if (character === ' ' || character === '*' || character === '·') {
      index += 1
      continue
    }
    if (character === '/') {
      sign = -outerSign
      index += 1
      continue
    }
    if (character === '(') {
      let depth = 1
      let end = index + 1
      while (end < unit.length && depth > 0) {
        if (unit[end] === '(') depth += 1
        if (unit[end] === ')') depth -= 1
        end += 1
      }
      factors.push(...parseUnitFactors(unit.slice(index + 1, end - 1), sign))
      sign = outerSign
      index = end
      continue
    }

    const match = /^([A-Za-zµΩ°%]+)(?:\^(-?\d+(?:\.\d+)?))?/.exec(unit.slice(index))
    if (!match) return []
    factors.push({ name: match[1], power: sign * Number(match[2] ?? 1) })
    sign = outerSign
    index += match[0].length
  }

  return factors
}

/** "1.25e7" -> 1.25 \cdot 10^{7}, anything else unchanged. */
const numberToTex = (number: string): string => {
  const exponential = number.match(/^(-?[\d.]+)e([+-]?\d+)$/)
  if (!exponential) return number
  const [, mantissa, exponent] = exponential
  return `${mantissa} \\cdot 10^{${Number(exponent)}}`
}

/** Two stages are "the same" if they differ only in spacing or multiplication dots. */
export const sameTex = (a: string, b: string): boolean =>
  a.replace(/~|\\cdot|\s|\\left|\\right|[{}]/g, '') ===
  b.replace(/~|\\cdot|\s|\\left|\\right|[{}]/g, '')
