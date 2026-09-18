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
      handler: (n: any) => (n.isSymbolNode ? symbolToTex(n.name, scope) : undefined),
    } as any),
  )

/**
 * Render an already-formatted value string ("250 kN*m") as TeX.
 *
 * The number is kept exactly as it was formatted. Handing it back to mathjs to
 * re-render would give a second opinion on notation — it turns 9375000 into
 * 9.375e6 while our own formatter leaves it plain — and a value printed one way
 * beside its own ± printed the other is the kind of thing a reviewer stops at.
 */
export function valueToTex(formatted: string, scope: Record<string, unknown>): string {
  const match = formatted.match(/^(-?[\d.]+(?:e[+-]?\d+)?)(\s+(.*))?$/)
  if (match) {
    const [, number, , unit] = match
    const tex = numberToTex(number)
    if (!unit) return tex
    try {
      // the unit alone through mathjs, which knows how to set it upright
      return `${tex}~${toTex(math.parse(`1 ${unit}`), scope).replace(/^1~?/, '')}`
    } catch {
      return `${tex}~\\mathrm{${unit}}`
    }
  }
  try {
    return toTex(math.parse(formatted), scope)
  } catch {
    return `\\text{${formatted}}`
  }
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
