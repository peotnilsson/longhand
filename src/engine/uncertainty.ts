import type { MathNode } from 'mathjs'
import { math } from './units'

export type ToleranceMode = 'quadrature' | 'worst'

export interface Contribution {
  /** The uncertain input this term comes from. */
  name: string
  /** Its contribution to the result's uncertainty, in the result's units. */
  amount: unknown
  /** Fraction of the total, 0..1. */
  share: number
}

export interface Propagated {
  sigma: unknown
  contributions: Contribution[]
}

/** Every variable name referenced anywhere in an expression. */
export function collectSymbols(node: MathNode): string[] {
  const names = new Set<string>()
  node.traverse((n: any, path: string, parent: any) => {
    if (!n.isSymbolNode) return
    if (parent && parent.isFunctionNode && path === 'fn') return
    names.add(n.name)
  })
  return [...names]
}

/**
 * First-order uncertainty propagation.
 *
 * For a result f(x1..xn) with independent input uncertainties s_i, each input
 * contributes |df/dx_i| * s_i. Quadrature (root sum of squares) is right for
 * statistical tolerances; the plain sum is the worst case, which is what a
 * manufacturing stack-up needs. Engineers use both, so we offer both.
 *
 * The partial derivatives are taken symbolically, so this is exact to first
 * order rather than a finite-difference approximation.
 */
export function propagate(
  node: MathNode,
  scope: Record<string, unknown>,
  sigmas: Record<string, unknown>,
  mode: ToleranceMode,
): Propagated | null {
  const uncertain = collectSymbols(node).filter((name) => sigmas[name] !== undefined)
  if (uncertain.length === 0) return null

  const terms: { name: string; amount: unknown }[] = []
  for (const name of uncertain) {
    try {
      const partial = math.derivative(node as any, name).evaluate(scope)
      terms.push({ name, amount: math.abs(math.multiply(partial, sigmas[name]) as any) })
    } catch {
      return null // a function we cannot differentiate - say nothing rather than lie
    }
  }

  let total: unknown
  try {
    if (mode === 'quadrature') {
      let sumOfSquares: unknown = null
      for (const term of terms) {
        const square = math.multiply(term.amount as any, term.amount as any)
        sumOfSquares = sumOfSquares === null ? square : math.add(sumOfSquares as any, square)
      }
      total = math.sqrt(sumOfSquares as any)
    } else {
      total = terms.reduce<unknown>(
        (sum, term) => (sum === null ? term.amount : math.add(sum as any, term.amount as any)),
        null,
      )
    }
  } catch {
    return null // mixed dimensions among the terms: not a meaningful uncertainty
  }

  // In quadrature the terms combine as squares, so the honest "share of the
  // uncertainty" is the share of the variance — which is what sums to 100%.
  const contributions: Contribution[] = terms
    .map((term) => {
      let share = 0
      try {
        const ratio = Math.abs(math.number(math.divide(term.amount as any, total as any) as any))
        share = mode === 'quadrature' ? ratio * ratio : ratio
      } catch {
        share = 0
      }
      return { ...term, share }
    })
    .sort((a, b) => b.share - a.share)

  return { sigma: total, contributions }
}

/** Split "300 mm ± 2 mm" into its value and uncertainty halves. */
export function splitTolerance(text: string): { value: string; sigma: string } | null {
  const match = text.match(/^(.*?)\s*(?:±|\+-)\s*(.+)$/)
  if (!match) return null
  const [, value, sigma] = match
  if (!value.trim() || !sigma.trim()) return null
  return { value: value.trim(), sigma: sigma.trim() }
}
