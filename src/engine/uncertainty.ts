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

/** What the sheet knows about where its uncertainty comes from. */
export interface Uncertainty {
  /** Name to ±, for the inputs that were written with one. */
  sigmas: Record<string, unknown>
  /** Names given a ± directly, as opposed to inheriting one. */
  roots: Set<string>
  /** For a derived uncertain value, the expression it came from. */
  derivations: Record<string, MathNode>
  /** Correlation coefficients between root inputs, keyed "a|b" with a < b. */
  correlations: Record<string, number>
}

export const emptyUncertainty = (): Uncertainty => ({
  sigmas: {},
  roots: new Set(),
  derivations: {},
  correlations: {},
})

export const cloneUncertainty = (from: Uncertainty): Uncertainty => ({
  sigmas: { ...from.sigmas },
  roots: new Set(from.roots),
  derivations: { ...from.derivations },
  correlations: { ...from.correlations },
})

export const correlationKey = (a: string, b: string): string =>
  a < b ? `${a}|${b}` : `${b}|${a}`

/**
 * Rewrite an expression in terms of the measurements it ultimately came from.
 *
 * Without this, a sheet that computes W from b and h and then a stress from W
 * reports that W contributed 100% of the stress's uncertainty — which the
 * reader already knew and cannot act on. What they need to hear is which
 * *measurement* is limiting the answer, and that means substituting each
 * derived uncertain value with the expression that produced it until only
 * things somebody actually measured are left.
 *
 * Depth-limited because a sheet can be circular in ways that only show up here.
 */
function toRoots(
  node: MathNode,
  uncertainty: Uncertainty,
  depth = 0,
): MathNode {
  if (depth > 12) return node
  let changed = false

  const expanded = node.transform((current: any, path: string, parent: any) => {
    if (!current.isSymbolNode) return current
    if (parent && parent.isFunctionNode && path === 'fn') return current
    const name = current.name
    if (uncertainty.roots.has(name)) return current
    const derivation = uncertainty.derivations[name]
    if (!derivation) return current
    changed = true
    return derivation.cloneDeep()
  })

  return changed ? toRoots(expanded, uncertainty, depth + 1) : expanded
}

/**
 * First-order uncertainty propagation.
 *
 * For a result f(x1..xn) with input uncertainties s_i, each input contributes
 * |df/dx_i| · s_i. Quadrature (root sum of squares) is right for statistical
 * tolerances; the plain sum is the worst case, which is what a manufacturing
 * stack-up needs. Engineers use both, so we offer both.
 *
 * The partial derivatives are taken symbolically, so this is exact to first
 * order rather than a finite-difference approximation — and they are taken
 * against the expression rewritten in terms of root measurements, so the
 * shares name the things somebody actually measured.
 *
 * Inputs are treated as independent unless the sheet has said otherwise with a
 * `correlate` line. Independence is the usual assumption and occasionally the
 * wrong one: two dimensions off the same instrument are not independent, and a
 * budget that assumes they are understates the result.
 */
export function propagate(
  node: MathNode,
  scope: Record<string, unknown>,
  uncertainty: Uncertainty,
  mode: ToleranceMode,
): Propagated | null {
  const rooted = toRoots(node, uncertainty)
  const uncertain = collectSymbols(rooted).filter(
    (name) => uncertainty.sigmas[name] !== undefined,
  )
  if (uncertain.length === 0) return null

  const terms: { name: string; amount: unknown; signed: unknown }[] = []
  for (const name of uncertain) {
    try {
      const partial = math.derivative(rooted as any, name).evaluate(scope)
      const signed = math.multiply(partial, uncertainty.sigmas[name] as any)
      terms.push({ name, amount: math.abs(signed as any), signed })
    } catch {
      return null // a function we cannot differentiate - say nothing rather than lie
    }
  }

  /** ρ between two inputs; zero unless the sheet said otherwise. */
  const rho = (a: string, b: string): number =>
    a === b ? 1 : (uncertainty.correlations[correlationKey(a, b)] ?? 0)

  let total: unknown
  const shares: number[] = new Array(terms.length).fill(0)

  try {
    if (mode === 'quadrature') {
      // σ² = Σ ci² + 2 Σ_{i<j} ρij ci cj, with the signs of the sensitivities
      // kept: a positive correlation between terms that pull opposite ways
      // reduces the spread, and pretending otherwise would be pessimistic in
      // the wrong direction.
      let variance: unknown = null
      const add = (value: unknown) => {
        variance = variance === null ? value : math.add(variance as any, value as any)
      }
      terms.forEach((term, index) => {
        add(math.multiply(term.signed as any, term.signed as any))
        for (let other = index + 1; other < terms.length; other += 1) {
          const coefficient = rho(term.name, terms[other].name)
          if (coefficient === 0) continue
          add(
            math.multiply(
              math.multiply(term.signed as any, terms[other].signed as any) as any,
              2 * coefficient,
            ),
          )
        }
      })
      total = math.sqrt(variance as any)

      // Each input's share is its own variance plus its half of every cross
      // term it takes part in, so the shares still add up to the whole.
      terms.forEach((term, index) => {
        let portion: unknown = math.multiply(term.signed as any, term.signed as any)
        terms.forEach((other, otherIndex) => {
          if (otherIndex === index) return
          const coefficient = rho(term.name, other.name)
          if (coefficient === 0) return
          portion = math.add(
            portion as any,
            math.multiply(
              math.multiply(term.signed as any, other.signed as any) as any,
              coefficient,
            ) as any,
          )
        })
        try {
          const variancePart = math.multiply(total as any, total as any)
          shares[index] = math.number(math.divide(portion as any, variancePart as any) as any)
        } catch {
          shares[index] = 0
        }
      })
    } else {
      total = terms.reduce<unknown>(
        (sum, term) => (sum === null ? term.amount : math.add(sum as any, term.amount as any)),
        null,
      )
      terms.forEach((term, index) => {
        try {
          shares[index] = Math.abs(
            math.number(math.divide(term.amount as any, total as any) as any),
          )
        } catch {
          shares[index] = 0
        }
      })
    }
  } catch {
    return null // mixed dimensions among the terms: not a meaningful uncertainty
  }

  const contributions: Contribution[] = terms
    .map((term, index) => ({
      name: term.name,
      amount: term.amount,
      share: Number.isFinite(shares[index]) ? shares[index] : 0,
    }))
    .sort((a, b) => b.share - a.share)

  return { sigma: total, contributions }
}

/** `correlate b and h by 0.8` */
export interface Correlation {
  a: string
  b: string
  coefficient: number
}

const CORRELATE =
  /^correlate\s+([A-Za-z_][A-Za-z0-9_]*)\s+and\s+([A-Za-z_][A-Za-z0-9_]*)\s+by\s+(-?[\d.]+(?:e-?\d+)?)\s*$/

export function parseCorrelate(line: string): Correlation | null {
  const match = line.match(CORRELATE)
  if (!match) return null
  const coefficient = Number(match[3])
  if (!Number.isFinite(coefficient)) return null
  return { a: match[1], b: match[2], coefficient }
}

/** Split "300 mm ± 2 mm" into its value and uncertainty halves. */
export function splitTolerance(text: string): { value: string; sigma: string } | null {
  const match = text.match(/^(.*?)\s*(?:±|\+-)\s*(.+)$/)
  if (!match) return null
  const [, value, sigma] = match
  if (!value.trim() || !sigma.trim()) return null
  return { value: value.trim(), sigma: sigma.trim() }
}
