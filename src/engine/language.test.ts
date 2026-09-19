import { describe, expect, it } from 'vitest'
import { evaluateSheet, type Line } from './index'
import { expandRanges, range } from './vectors'
import { parseDirective } from './rounding'

const summaries = (lines: Line[]): string[] =>
  lines.flatMap((line) =>
    line.kind === 'calc' || line.kind === 'check' ? [line.summary] : [],
  )

const last = (source: string): string => summaries(evaluateSheet(source)).at(-1) ?? ''

const errorOf = (source: string): string | undefined =>
  evaluateSheet(source).find((line) => line.kind === 'error')?.message

describe('rounding and sizing', () => {
  it('reads the directives an engineer would write', () => {
    expect(parseDirective('MPa')).toEqual({ kind: 'unit', unit: 'MPa' })
    expect(parseDirective('3 sf')).toEqual({ kind: 'sf', digits: 3 })
    expect(parseDirective('2 dp')).toEqual({ kind: 'dp', digits: 2 })
    expect(parseDirective('ceil 10 mm')).toEqual({ kind: 'step', mode: 'ceil', step: '10 mm' })
    expect(parseDirective('nearest 5')).toEqual({ kind: 'step', mode: 'round', step: '5' })
    expect(parseDirective('floor 25 mm')).toEqual({ kind: 'step', mode: 'floor', step: '25 mm' })
  })

  it('rounds to significant figures in the unit it is read in', () => {
    expect(last('M = 172.84 kN*m -> 3 sf')).toBe('= 173 kN*m')
    expect(last('x = 1/3 -> 2 dp')).toBe('= 0.33')
  })

  it('rounds a required dimension up to a size you can order', () => {
    expect(last('b = 287.4 mm -> ceil 10 mm')).toBe('= 290 mm')
    expect(last('b = 287.4 mm -> floor 10 mm')).toBe('= 280 mm')
    // 287.4 is nearer 275 than 300, by 0.2 mm — which is the point of writing
    // `nearest` rather than `ceil` when you do not mean "round up".
    expect(last('b = 287.4 mm -> nearest 25 mm')).toBe('= 275 mm')
  })

  /**
   * The point of the whole feature: the lines below have to use the rounded
   * number, or the sheet says one thing and computes another.
   */
  it('carries the rounded value into the lines below', () => {
    const lines = evaluateSheet(
      ['b = 287.4 mm -> ceil 10 mm', 'h = 500 mm', 'W = b*h^2/6 -> 4 sf'].join('\n'),
    )
    // 290 * 500^2 / 6 = 1.2083e7 mm^3, not 287.4 * 500^2 / 6 = 1.1975e7
    expect(summaries(lines).at(-1)).toContain('1.208e7')
  })

  it('chains a unit and a rounding', () => {
    expect(last('sigma = 191.234 MPa -> MPa -> 3 sf')).toBe('= 191 MPa')
  })

  it('refuses to round a length to a force, and says so', () => {
    expect(errorOf('b = 300 mm -> ceil 10 kN')).toMatch(/units do not match/i)
    expect(errorOf('n = 3.7 -> ceil 10 mm')).toMatch(/plain number/i)
    expect(errorOf('b = 300 mm -> ceil 0 mm')).toMatch(/greater than zero/i)
  })

  it('leaves a sheet without arrows exactly as it was', () => {
    expect(last('b = 300 mm')).toBe('= 300 mm')
  })
})

describe('ranges and vectors', () => {
  it('rewrites the .. sugar into a call', () => {
    expect(expandRanges('i = 1..10')).toBe('i = range(1, 10)')
    expect(expandRanges('n = 0..1 step 0.25')).toBe('n = range(0, 1, 0.25)')
    expect(expandRanges('i = a..b')).toBe('i = range(a, b)')
    expect(expandRanges('x = 1.5..2.5')).toBe('x = range(1.5, 2.5)')
    expect(expandRanges('x = (n+1)..(m)')).toBe('x = range((n+1), (m))')
  })

  it('leaves strings alone', () => {
    expect(expandRanges('a = lookup("1..10", t.name, t.value)')).toBe(
      'a = lookup("1..10", t.name, t.value)',
    )
  })

  it('includes the end, which mathjs range does not', () => {
    expect(range(1, 10)).toHaveLength(10)
    expect(range(1, 10).at(-1)).toBe(10)
    expect(range(0, 1, 0.25)).toEqual([0, 0.25, 0.5, 0.75, 1])
  })

  it('refuses a range that would not print', () => {
    expect(() => range(1, 10, 0)).toThrow(/cannot be zero/)
    expect(() => range(10, 1)).toThrow(/empty range/)
    expect(() => range(1, 1e6)).toThrow(/more than a calculation sheet can show/)
  })

  it('says the unit once instead of once per element', () => {
    expect(last('i = 1..4\nx = i*100 mm')).toBe('= [100, 200, 300, 400] mm')
  })

  it('abbreviates a list too long to read', () => {
    const summary = last('i = 1..20')
    expect(summary).toContain('…')
    expect(summary).toContain('(20 values)')
  })

  it('reduces over a range the way a load combination would', () => {
    expect(last('i = 1..4\nw = i*10 kN/m\nW_tot = sum(w)')).toBe('= 100 kN/m')
    expect(last('i = 1..4\nm = max(i*2)')).toBe('= 8')
    expect(last('n = 0..1 step 0.5\na = mean(n)')).toBe('= 0.5')
  })

  it('carries a range through a user function', () => {
    expect(last('A(d) = pi*d^2/4\ni = 1..3\nareas = A(i*10 mm) -> mm^2')).toContain('mm^2')
  })

  it('gives a vector no ± of its own', () => {
    const lines = evaluateSheet('b = 300 mm +- 2 mm\ni = 1..3\nx = i*b')
    const calc = lines.filter((line) => line.kind === 'calc')
    expect(calc.at(-1)!.kind === 'calc' && calc.at(-1)!.tolerance).toBeUndefined()
  })

  it('renders a list as a bracketed row rather than a wall of text', () => {
    const lines = evaluateSheet('i = 1..3\nx = i*100 mm')
    const tex = lines.filter((line) => line.kind === 'calc').at(-1)
    expect(tex!.kind === 'calc' && tex!.tex).toContain('\\left[')
  })
})

/**
 * Defining `ksi` so that engineers could write it silently moved every stress
 * in the app from MPa to ksi, because mathjs picks the display unit by
 * searching its own table. The display choice belongs to Longhand, so this
 * pins it: the answer to "what does a stress read in" must not depend on which
 * units happen to be defined.
 */
describe('the display unit is ours to choose', () => {
  it('reads a derived stress in MPa even though ksi and psi exist', () => {
    expect(last('M = 250 kN*m\nW = 1.25e7 mm^3\nsigma = M/W')).toBe('= 20 MPa')
  })

  it('still lets the sheet ask for something else', () => {
    expect(last('M = 250 kN*m\nW = 1.25e7 mm^3\nsigma = M/W -> ksi')).toContain('ksi')
    expect(last('s = 1 ksi -> MPa')).toBe('= 6.895 MPa')
  })

  it('picks the candidate that keeps the number readable', () => {
    expect(last('p = 4 Pa\nq = p*1')).toBe('= 4 Pa')
    expect(last('F = 15 kN\nL = 2 m\nW = F*L -> kJ')).toBe('= 30 kJ')
  })

  it('keeps units as written ahead of any preference list', () => {
    expect(last('M = 250 kN*m')).toBe('= 250 kN*m')
  })
})
