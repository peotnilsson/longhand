import { describe, expect, it } from 'vitest'
import { clearCache, evaluateSheet } from '.'

const summaryOf = (source: string, index: number) => {
  clearCache()
  const line = evaluateSheet(source)[index]
  return line.kind === 'calc' ? line.summary : `${line.kind}: ${'message' in line ? line.message : ''}`
}

describe('solving two equations', () => {
  /**
   * Both of these used to hand back the starting values as though they were
   * the answer. An equation that balanced at the start had a size of zero,
   * scaling by it made every residual NaN, and NaN is never greater than a
   * tolerance — so the solver stopped at once and reported success. Found by
   * writing an ordinary textbook exercise, which is the worst way to find it.
   */
  it('solves from a start of zero', () => {
    expect(summaryOf('a = 0\nb = 0\na, b = solve -2*a = 1 and -a - 2*b = 0 for a, b\n', 2)).toBe(
      'a = -0.5,  b = 0.25',
    )
  })

  it('solves when one equation already balances at the start', () => {
    expect(summaryOf('p = 1\nq = 1\np, q = solve p + q = 2 and 2*p - q = 0 for p, q\n', 2)).toBe(
      'p = 0.6667,  q = 1.333',
    )
  })

  it('still solves from a start of zero with units on it', () => {
    const summary = summaryOf(
      'b = 0 mm\nh = 0 mm\nb, h = solve b + h = 300 mm and h - 2*b = 0 mm for b, h\n',
      2,
    )
    expect(summary).toBe('b = 100 mm,  h = 200 mm')
  })

  it('says it failed rather than returning the start when there is no answer', () => {
    const summary = summaryOf('p = 1\nq = 1\np, q = solve p + q = 2 and p + q = 3 for p, q\n', 2)
    expect(summary).toMatch(/^error:/)
  })
})

describe('a numeric derivative', () => {
  it('works at zero, where a step proportional to x is no step at all', () => {
    expect(summaryOf('y(x) = exp(2*x)\nd = deriv(y, 0)\n', 1)).toBe('= 2')
  })

  it('works at zero with units', () => {
    expect(summaryOf('f(x) = x^2 + 3 m*x\nd = deriv(f, 0 m)\n', 1)).toBe('= 3 m')
  })
})
