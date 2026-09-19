import { describe, expect, it } from 'vitest'
import { evaluateSheet, type Line } from './index'

const summaries = (lines: Line[]): string[] =>
  lines.flatMap((line) =>
    line.kind === 'calc' || line.kind === 'check' ? [line.summary] : [],
  )

const last = (source: string): string => summaries(evaluateSheet(source)).at(-1) ?? ''

const errorOf = (source: string): string | undefined =>
  evaluateSheet(source).find((line) => line.kind === 'error')?.message

const errorsIn = (source: string): number =>
  evaluateSheet(source).filter((line) => line.kind === 'error').length

const toleranceOf = (source: string) => {
  const calc = evaluateSheet(source).filter((line) => line.kind === 'calc').at(-1)
  return calc && calc.kind === 'calc' ? calc.tolerance : undefined
}

describe('units a sheet defines for itself', () => {
  it('defines one and uses it', () => {
    expect(last('unit kgf = 9.80665 N\nF = 100 kgf -> N')).toBe('= 980.7 N')
  })

  it('says what it defined', () => {
    const note = evaluateSheet('unit kgf = 9.80665 N').find((line) => line.kind === 'note')
    expect(note && note.kind === 'note' && note.text).toContain('kgf = 9.80665 N')
  })

  it('can be defined twice without complaint, because a sheet re-runs', () => {
    expect(errorsIn('unit kgf = 9.80665 N\nunit kgf = 9.80665 N\nx = 2 kgf -> N')).toBe(0)
  })

  it('refuses a definition that is not a quantity', () => {
    expect(errorOf('unit silly = 5')).toMatch(/has none/)
    expect(errorOf('unit silly = not_a_thing')).toMatch(/not a quantity/)
  })

  it('refuses to shadow something a formula already needs', () => {
    expect(errorOf('unit pi = 3 m')).toMatch(/already means something/)
  })

  /**
   * The reason user-defined units are safe now: adding one used to move every
   * stress in the app into it, because mathjs picked the display unit.
   */
  it('does not take over how unrelated results are shown', () => {
    expect(last('unit kgf = 9.80665 N\nM = 250 kN*m\nW = 1.25e7 mm^3\nsigma = M/W')).toBe(
      '= 20 MPa',
    )
  })
})

describe('temperature on a scale is not a difference', () => {
  /**
   * mathjs evaluates 0.17 W/(m^2 K) * 22 degC to exactly what it gives for
   * 22 K, because multiplying drops the offset. 22 °C is 295.15 K, so the
   * answer is out by a factor of thirteen and nothing about it looks wrong.
   */
  it('refuses to multiply by an absolute temperature', () => {
    expect(errorOf('U = 0.17 W/(m^2*K)\nq = U*22 degC')).toMatch(/not a difference/)
  })

  it('catches it through a variable too', () => {
    expect(errorOf('U = 0.17 W/(m^2*K)\ndT = 22 degC\nq = U*dT')).toMatch(/dT is a temperature/)
  })

  it('names kelvin as the fix', () => {
    expect(errorOf('U = 0.17 W/(m^2*K)\ndT = 22 degC\nq = U*dT')).toMatch(/22 K/)
  })

  it('is happy once the difference is written in kelvin', () => {
    expect(last('U = 0.17 W/(m^2*K)\ndT = 22 K\nq = U*dT -> W/m^2')).toBe('= 3.74 W/m^2')
  })

  it('leaves adding and subtracting alone', () => {
    expect(errorsIn('T_1 = 20 degC\nT_2 = 42 degC\ndT = T_2 - T_1')).toBe(0)
  })

  it('leaves an absolute temperature that is only stored alone', () => {
    expect(errorsIn('T = 20 degC\nT_K = T -> K')).toBe(0)
  })
})

describe('statistics over a column', () => {
  const readings = [
    'table run',
    '  x       | y',
    '  1 s     | 2.1 mm',
    '  2 s     | 3.9 mm',
    '  3 s     | 6.2 mm',
    '  4 s     | 7.8 mm',
    'end',
  ].join('\n')

  it('takes a mean in the units of the column', () => {
    expect(last(`${readings}\nm = mean(run.y)`)).toBe('= 5 mm')
  })

  it('uses the sample standard deviation, not the population one', () => {
    // By hand: deviations -2.9, -1.1, 1.2, 2.8; squares 8.41, 1.21, 1.44, 7.84;
    // sum 18.90, over n-1 = 3 is 6.30, root 2.5100. The population form would
    // divide by 4 and give 2.174, which is the wrong answer for a sample.
    expect(last(`${readings}\ns = sd(run.y)`)).toBe('= 2.51 mm')
  })

  it('refuses a standard deviation of one reading', () => {
    expect(errorOf('i = 1..1\ns = sd(i*1 mm)')).toMatch(/at least two readings/)
  })

  it('fits a straight line with the right units on the slope', () => {
    // Sxy = 9.70, Sxx = 5.00, so the slope is 1.94 mm per second.
    expect(last(`${readings}\nk = slope(run.x, run.y)`)).toBe('= 1.94 mm/s')
  })

  it('and an intercept in the units of y', () => {
    expect(last(`${readings}\nc = intercept(run.x, run.y)`)).toContain('mm')
  })

  it('reports how good the fit is', () => {
    const value = Number(last(`${readings}\nq = r2(run.x, run.y)`).replace('= ', ''))
    expect(value).toBeGreaterThan(0.99)
    expect(value).toBeLessThanOrEqual(1)
  })

  it('gives r2 = 1 for points exactly on a line', () => {
    expect(last('i = 1..5\nx = i*1 s\ny = i*2 mm\nq = r2(x, y)')).toBe('= 1')
  })
})

describe('choosing a row', () => {
  const steel = [
    'table steel',
    '  profile | W_el       | mass',
    '  IPE200  | 194e3 mm^3 | 22.4 kg/m',
    '  IPE300  | 557e3 mm^3 | 42.2 kg/m',
    '  IPE400  | 1160e3 mm^3 | 66.3 kg/m',
    'end',
    'W_req = 500e3 mm^3',
  ].join('\n')

  it('finds the lightest section that still passes', () => {
    expect(last(`${steel}\nok = steel.W_el >= W_req\nm = smallest(steel.mass, ok)`)).toBe(
      '= 42.2 kg/m',
    )
  })

  it('names it, which is the answer an engineer wanted', () => {
    const lines = evaluateSheet(
      `${steel}\nok = steel.W_el >= W_req\nchoice = pick(steel.profile, steel.mass, ok)`,
    )
    expect(lines.filter((line) => line.kind === 'error')).toEqual([])
    expect(summaries(lines).at(-1)).toContain('IPE300')
  })

  it('counts how many pass', () => {
    expect(last(`${steel}\nok = steel.W_el >= W_req\nn = count_where(ok)`)).toBe('= 2')
  })

  it('says so plainly when nothing passes', () => {
    expect(
      errorOf(`${steel}\nok = steel.W_el >= 2000e3 mm^3\nm = smallest(steel.mass, ok)`),
    ).toMatch(/no row passes/)
  })

  it('takes the largest when that is the question', () => {
    expect(last(`${steel}\nm = largest(steel.mass)`)).toBe('= 66.3 kg/m')
  })
})

describe('interpolation in two directions', () => {
  const grid = [
    'table k',
    '  t      | T      | lambda',
    '  50 mm  | 0 degC | 0.035 W/(m*K)',
    '  50 mm  | 40 degC | 0.039 W/(m*K)',
    '  150 mm | 0 degC | 0.031 W/(m*K)',
    '  150 mm | 40 degC | 0.035 W/(m*K)',
    'end',
  ].join('\n')

  it('lands on a corner exactly', () => {
    expect(last(`${grid}\nv = interp2(50 mm, 0 degC, k.t, k.T, k.lambda)`)).toContain('0.035')
  })

  it('averages the four corners at the middle', () => {
    // (0.035 + 0.039 + 0.031 + 0.035)/4 = 0.035
    expect(last(`${grid}\nv = interp2(100 mm, 20 degC, k.t, k.T, k.lambda)`)).toContain('0.035')
  })

  it('interpolates along one axis at a time', () => {
    // halfway in t at T = 0: (0.035 + 0.031)/2 = 0.033
    expect(last(`${grid}\nv = interp2(100 mm, 0 degC, k.t, k.T, k.lambda)`)).toContain('0.033')
  })

  it('refuses to extrapolate past the table', () => {
    expect(errorOf(`${grid}\nv = interp2(500 mm, 0 degC, k.t, k.T, k.lambda)`)).toMatch(
      /outside the table/,
    )
  })
})

describe('calculus', () => {
  it('integrates a load over a span, and the units come out right', () => {
    // A constant 12 kN/m over 6 m is 72 kN.
    expect(last('w(x) = 12 kN/m\nW = integral(w, 0 m, 6 m) -> kN')).toBe('= 72 kN')
  })

  it('integrates something that actually varies', () => {
    // A triangular load from 0 to 12 kN/m over 6 m is half of 72.
    expect(last('w(x) = 2 kN/m^2*x\nW = integral(w, 0 m, 6 m) -> kN')).toBe('= 36 kN')
  })

  it('differentiates, with the units of the ratio', () => {
    expect(last('f(x) = 3 kN/m*x\ns = deriv(f, 2 m) -> kN/m')).toBe('= 3 kN/m')
  })

  it('is exact enough on a curve', () => {
    // d/dx of x^2 at x = 3 is 6.
    const value = Number(last('f(x) = x^2\ns = deriv(f, 3)').replace('= ', ''))
    expect(value).toBeCloseTo(6, 6)
  })

  it('says what it needs when handed something that is not a function', () => {
    expect(errorOf('x = 4\ny = integral(x, 0, 1)')).toMatch(/needs a function/)
  })
})

describe('declared dimensions on a function', () => {
  it('accepts the right kind of quantity', () => {
    expect(last('A(d: length) = pi*d^2/4\na = A(20 mm) -> mm^2')).toBe('= 314.2 mm^2')
  })

  it('stops the wrong kind at the call, naming the argument', () => {
    const message = errorOf('A(d: length) = pi*d^2/4\na = A(20 kN)')
    expect(message).toMatch(/A expects d to be a length/)
  })

  it('stops a plain number where a quantity was declared', () => {
    expect(errorOf('A(d: length) = pi*d^2/4\na = A(20)')).toMatch(/no units/)
  })

  it('can ask for a plain number and refuse a quantity', () => {
    expect(errorOf('f(n: number) = n*2\nx = f(3 mm)')).toMatch(/plain number/)
  })

  it('says so when the kind is not one it knows', () => {
    expect(errorOf('A(d: wibble) = d')).toMatch(/not a kind of quantity/)
  })

  it('says what it declared, so the sheet reads as documentation', () => {
    const definition = evaluateSheet('A(d: length) = pi*d^2/4').find(
      (line) => line.kind === 'definition',
    )
    expect(definition && definition.kind === 'definition' && definition.summary).toContain(
      'd is a length',
    )
  })

  it('leaves an undeclared function exactly as it was', () => {
    expect(last('A(d) = pi*d^2/4\na = A(20 mm) -> mm^2')).toBe('= 314.2 mm^2')
  })
})

describe('iterating to a fixed point', () => {
  /**
   * Colebrook has the friction factor on both sides. Written as a fixed point
   * it is exactly how it is done by hand: guess, compute, write the new value
   * over the old one.
   */
  const colebrook = [
    'Re_D = 1e5',
    'rr = 0.001',
    'step(f) = (-2*log10(rr/3.7 + 2.51/(Re_D*sqrt(f))))^-2',
    'f = iterate step(f) from 0.02',
  ].join('\n')

  it('settles on the answer', () => {
    const value = Number(last(colebrook).replace(/= ([\d.]+).*/, '$1'))
    expect(value).toBeCloseTo(0.0221745, 5)
  })

  it('says how many rounds it took', () => {
    expect(last(colebrook)).toMatch(/after \d+ rounds?/)
  })

  it('carries units through', () => {
    expect(last('g(x) = 0.5*x + 5 mm\nx = iterate g(x) from 1 mm')).toContain('mm')
  })

  it('gives up rather than spinning for ever', () => {
    expect(errorOf('g(x) = 2*x + 1\nx = iterate g(x) from 1')).toMatch(/ran away|did not settle/)
  })

  it('takes a tolerance when the default is tighter than the problem', () => {
    expect(errorsIn('g(x) = 0.5*x + 5\nx = iterate g(x) from 1 within 1e-6')).toBe(0)
  })
})

describe('two unknowns at once', () => {
  /**
   * x + y = 10 and x - y = 2 has one answer, x = 6 and y = 4, and it is the
   * simplest thing that proves the 2x2 Newton and its replay are wired up.
   */
  it('solves a pair of linear equations', () => {
    const lines = evaluateSheet(
      ['x = 1', 'y = 1', 'a = x + y', 'b = x - y', 'x, y = solve a = 10 and b = 2 for x, y'].join(
        '\n',
      ),
    )
    expect(lines.filter((line) => line.kind === 'error')).toEqual([])
    const summary = summaries(lines).at(-1) ?? ''
    expect(summary).toContain('x = 6')
    expect(summary).toContain('y = 4')
  })

  it('works through units', () => {
    const lines = evaluateSheet(
      [
        'b = 100 mm',
        'h = 100 mm',
        'A = b*h',
        'r = h/b',
        'b, h = solve A = 20000 mm^2 and r = 2 for b, h',
      ].join('\n'),
    )
    expect(lines.filter((line) => line.kind === 'error')).toEqual([])
    const summary = summaries(lines).at(-1) ?? ''
    expect(summary).toContain('mm')
  })

  it('asks for starting values rather than guessing', () => {
    expect(
      errorOf('a = 1\nx, y = solve a = 1 and a = 2 for x, y'),
    ).toMatch(/both need a value above/)
  })

  it('says so when the two equations are really one', () => {
    expect(
      errorOf(
        ['x = 1', 'y = 1', 'a = x + y', 'b = 2*(x + y)', 'x, y = solve a = 10 and b = 20 for x, y'].join(
          '\n',
        ),
      ),
    ).toMatch(/do not pin down|did not converge/)
  })
})

describe('uncertainty, traced back to what was measured', () => {
  /**
   * The old attribution said "W contributed 100%", which the reader already
   * knew. What they can act on is which measurement is limiting the answer.
   */
  const sheet = [
    'b = 300 mm +- 2 mm',
    'h = 500 mm +- 10 mm',
    'W = b*h^2/6',
    'M = 250 kN*m',
    'sigma = M/W -> MPa',
  ].join('\n')

  it('names the measurements, not the intermediate value', () => {
    const names = (toleranceOf(sheet)?.contributions ?? []).map((share) => share.name)
    expect(names).toContain('b')
    expect(names).toContain('h')
    expect(names).not.toContain('W')
  })

  it('gets the shares right: the height matters four times as much', () => {
    // sigma depends on h^2, so h's sensitivity is twice its relative error.
    // b: 2/300 = 0.67%, h: 2 x 10/500 = 4%. In variance, h is ~97%.
    const shares = Object.fromEntries(
      (toleranceOf(sheet)?.contributions ?? []).map((share) => [share.name, share.share]),
    )
    expect(shares.h).toBeGreaterThan(0.9)
    expect(shares.b).toBeLessThan(0.1)
  })

  it('still adds up to the whole', () => {
    const total = (toleranceOf(sheet)?.contributions ?? []).reduce(
      (sum, share) => sum + share.share,
      0,
    )
    expect(total).toBeCloseTo(1, 6)
  })

  it('forgets an uncertainty when the value is redefined without one', () => {
    expect(toleranceOf('b = 300 mm +- 2 mm\nb = 300 mm\nx = b*2')).toBeUndefined()
  })
})

describe('inputs that are not independent', () => {
  const both = (extra: string) =>
    toleranceOf(['x = 100 mm +- 1 mm', 'y = 100 mm +- 1 mm', extra, 's = x + y'].join('\n'))

  it('assumes independence, and says the usual thing', () => {
    // sqrt(1^2 + 1^2) = 1.414
    expect(both('// nothing')?.text).toContain('1.414')
  })

  it('adds them fully when they move together', () => {
    expect(both('correlate x and y by 1')?.text).toContain('2 mm')
  })

  it('cancels them when they move opposite ways', () => {
    const text = both('correlate x and y by -1')?.text ?? ''
    expect(text).toMatch(/± 0(\.0+)? mm|± 0 /)
  })

  it('refuses a coefficient outside -1 to 1', () => {
    expect(
      errorOf('x = 1 mm +- 1 mm\ny = 1 mm +- 1 mm\ncorrelate x and y by 4\ns = x + y'),
    ).toMatch(/runs from -1 to 1/)
  })

  it('says what it did', () => {
    const note = evaluateSheet(
      'x = 1 mm +- 1 mm\ny = 1 mm +- 1 mm\ncorrelate x and y by 0.8',
    ).find((line) => line.kind === 'note')
    expect(note && note.kind === 'note' && note.text).toContain('correlated by 0.8')
  })
})

describe('the constants sheet', () => {
  it('evaluates with no errors of its own', async () => {
    const { CONSTANTS_SHEET } = await import('../constants')
    const lines = evaluateSheet(CONSTANTS_SHEET)
    expect(lines.filter((line) => line.kind === 'error')).toEqual([])
  })

  it('hands its values to a sheet that imports it', async () => {
    const { CONSTANTS_SHEET, CONSTANTS_NAME } = await import('../constants')
    const lines = evaluateSheet('import "Constants"\nW = 12 kg*g_n -> N', {
      libraries: { [CONSTANTS_NAME]: CONSTANTS_SHEET },
    })
    expect(lines.filter((line) => line.kind === 'error')).toEqual([])
    expect(
      lines.flatMap((line) => (line.kind === 'calc' ? [line.summary] : [])).at(-1),
    ).toBe('= 117.7 N')
  })

  /**
   * The gas constant is the product of two defined numbers since 2019, so it
   * is exact and this is a real check rather than a rounding tolerance.
   */
  it('carries the exact constants exactly', async () => {
    const { CONSTANTS_SHEET, CONSTANTS_NAME } = await import('../constants')
    const lines = evaluateSheet(
      'import "Constants"\nR_check = N_A*k_B -> J/(mol*K)\nabs(R_check - R_gas)/R_gas <= 1e-15',
      { libraries: { [CONSTANTS_NAME]: CONSTANTS_SHEET } },
    )
    const check = lines.find((line) => line.kind === 'check')
    expect(check && check.kind === 'check' && check.pass).toBe(true)
  })

  it('carries no partial safety factors, which belong in the sheet that uses them', async () => {
    const { CONSTANTS_SHEET } = await import('../constants')
    expect(CONSTANTS_SHEET).not.toMatch(/gamma_[MmGgQq]\s*=/)
    expect(CONSTANTS_SHEET).toMatch(/no partial safety factors|not authoritative|code is right/i)
  })
})
