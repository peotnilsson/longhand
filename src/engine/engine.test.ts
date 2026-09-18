import { describe, expect, it } from 'vitest'
import { evaluateSheet, type Line } from './index'

const texts = (lines: Line[]): string[] =>
  lines.flatMap((line) => (line.kind === 'calc' ? [line.tex] : []))

const summaries = (lines: Line[]): string[] =>
  lines.flatMap((line) =>
    line.kind === 'calc' || line.kind === 'check' ? [line.summary] : [],
  )

describe('units as written', () => {
  it('keeps a bending moment in kN*m instead of collapsing it to kJ', () => {
    const [line] = texts(evaluateSheet('M = 250 kN*m'))
    expect(line).toContain('\\mathrm{kN}')
    expect(line).not.toContain('kJ')
  })

  it('keeps mm*mm^2 as mm^3 without an explicit display unit', () => {
    const lines = evaluateSheet('b = 300 mm\nh = 500 mm\nW = b*h^2/6')
    expect(summaries(lines).at(-1)).toContain('mm^3')
  })

  it('falls back to mathjs when the units are incoherent, so a stress reads in MPa', () => {
    const lines = evaluateSheet('M = 250 kN*m\nW = 1.25e7 mm^3\nsigma = M/W')
    expect(summaries(lines).at(-1)).toContain('MPa')
  })

  it('still honours an explicit display unit', () => {
    const lines = evaluateSheet('M = 250 kN*m -> kJ')
    expect(summaries(lines).at(-1)).toContain('kJ')
  })
})

describe('dimension errors', () => {
  it('refuses to add a length to a moment', () => {
    const lines = evaluateSheet('b = 300 mm\nM = 250 kN*m\nbad = b + M')
    const error = lines.find((line) => line.kind === 'error')
    expect(error).toBeDefined()
  })

  it('explains a reference to something defined further down', () => {
    const lines = evaluateSheet('a = later * 2\nlater = 5')
    const error = lines.find((line) => line.kind === 'error')
    expect(error && error.kind === 'error' && error.message).toContain('defined further down')
  })
})

describe('tolerances', () => {
  const sheet = 'b = 300 mm +- 2 mm\nh = 500 mm +- 3 mm\nW = b*h^2/6'

  it('propagates through a formula', () => {
    const lines = evaluateSheet(sheet)
    const last = lines.filter((line) => line.kind === 'calc').at(-1)
    expect(last && last.kind === 'calc' && last.tolerance?.text).toMatch(/±/)
  })

  it('gives a larger spread in worst case than in quadrature', () => {
    const value = (mode: 'quadrature' | 'worst') => {
      const lines = evaluateSheet(sheet, { mode })
      const last = lines.filter((line) => line.kind === 'calc').at(-1)
      const text = last && last.kind === 'calc' ? (last.tolerance?.text ?? '') : ''
      const match = text.match(/([\d.]+(?:e-?\d+)?)/)
      return match ? Number(match[1]) : NaN
    }
    expect(value('worst')).toBeGreaterThan(value('quadrature'))
  })

  it('writes the spread in the same unit and notation as the value', () => {
    const lines = evaluateSheet(sheet)
    const last = lines.filter((line) => line.kind === 'calc').at(-1)
    const view = last && last.kind === 'calc' ? last : null
    // the value itself is 1.25e7 mm^3, so the spread reads 1.716e5 mm^3 —
    // not 171600 mm^3, which is hard to compare against it at a glance
    expect(view?.summary).toMatch(/e7 mm\^3/)
    expect(view?.tolerance?.text).toMatch(/^± [\d.]+e5 mm\^3$/)
  })

  it('keeps a spread in plain notation when the value is in plain notation', () => {
    const lines = evaluateSheet('b = 300 mm +- 2 mm\nc = 2*b')
    const last = lines.filter((line) => line.kind === 'calc').at(-1)
    const view = last && last.kind === 'calc' ? last : null
    expect(view?.tolerance?.text).toBe('± 4 mm')
  })

  it('reports contribution shares that sum to about 100%', () => {
    const lines = evaluateSheet(sheet)
    const last = lines.filter((line) => line.kind === 'calc').at(-1)
    const shares =
      last && last.kind === 'calc' ? (last.tolerance?.contributions ?? []) : []
    const total = shares.reduce((sum, share) => sum + share.share, 0)
    expect(total).toBeGreaterThan(0.98)
    expect(total).toBeLessThan(1.02)
  })
})

describe('checks', () => {
  it('passes with the spare margin', () => {
    const lines = evaluateSheet('s = 20 MPa\nf = 30 MPa\ns <= f')
    const check = lines.find((line) => line.kind === 'check')
    expect(check && check.kind === 'check' && check.pass).toBe(true)
    expect(check && check.kind === 'check' && check.margin).toContain('spare')
  })

  it('fails and says how far over it is', () => {
    const lines = evaluateSheet('s = 40 MPa\nf = 30 MPa\ns <= f')
    const check = lines.find((line) => line.kind === 'check')
    expect(check && check.kind === 'check' && check.pass).toBe(false)
    expect(check && check.kind === 'check' && check.margin).toContain('over')
  })
})

describe('redefinition', () => {
  it('says nothing when every name is defined once', () => {
    const lines = evaluateSheet('b = 300 mm\nh = 500 mm')
    expect(lines.some((line) => 'warning' in line && line.warning)).toBe(false)
  })

  it('warns once, naming the previous value, and keeps evaluating', () => {
    const lines = evaluateSheet('b = 300 mm\nb = 600 mm\nc = b*2')
    const warnings = lines.flatMap((line) =>
      'warning' in line && line.warning ? [line.warning] : [],
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('300 mm')
    expect(lines.some((line) => line.kind === 'error')).toBe(false)
  })
})

describe('incremental cache', () => {
  const base = `# Sheet
b = 300 mm +- 2 mm
h = 500 mm
W = b*h^2/6
sigma = 250 kN*m/W
sigma <= 30 MPa
table
  n | x
  A | 1 mm
end
`
  const strip = (lines: Line[]) => JSON.stringify(lines)

  it('matches a cold run after an edit above a block', async () => {
    const edited = base.replace('h = 500 mm', 'h = 450 mm')
    const warm = await import('./index?warm=1')
    warm.evaluateSheet(base)
    const cold = await import('./index?cold=1')
    expect(strip(warm.evaluateSheet(edited))).toBe(strip(cold.evaluateSheet(edited)))
  })

  it('matches a cold run after an edit inside a table', async () => {
    const edited = base.replace('  A | 1 mm', '  A | 2 mm')
    const warm = await import('./index?warm=2')
    warm.evaluateSheet(base)
    const cold = await import('./index?cold=2')
    expect(strip(warm.evaluateSheet(edited))).toBe(strip(cold.evaluateSheet(edited)))
  })

  it('is stable when the sheet has not changed', async () => {
    const warm = await import('./index?warm=3')
    expect(strip(warm.evaluateSheet(base))).toBe(strip(warm.evaluateSheet(base)))
  })
})

describe('solve', () => {
  const value = (source: string): string => {
    const lines = evaluateSheet(source)
    const last = lines.at(-1)
    if (!last) return 'no lines'
    if (last.kind === 'error') return `error: ${last.message}`
    return last.kind === 'calc' ? last.summary : last.kind
  }

  it('finds the width that brings a stress to its limit', () => {
    // sigma = M/(b h^2/6) = 30 MPa with M = 250 kN*m, h = 500 mm gives b = 200 mm
    expect(
      value(`M = 250 kN*m
h = 500 mm
b = 300 mm
W = b*h^2/6
sigma = M/W
b_req = solve sigma = 30 MPa for b`),
    ).toBe('= 200 mm')
  })

  it('works through several intermediate steps and returns the right unit', () => {
    expect(
      value(`q = 5 kN/m
L = 6 m
M = q*L^2/8
W = 200 mm*(400 mm)^2/6
sigma = M/W
L_max = solve sigma = 20 MPa for L`),
    ).toBe('= 13.06 m')
  })

  it('solves a plain expression given a range', () => {
    expect(value('x_req = solve x^2 = 4 for x from 0 to 5')).toBe('= 2')
  })

  it('picks the root inside the range on a nonlinear problem', () => {
    // x^2 - 4x = -3 has roots at 1 and 3
    expect(value('f = 0\nx_req = solve x^2 - 4*x = -3 for x from 0 to 1.5')).toBe('= 1')
    expect(value('f = 0\nx_req = solve x^2 - 4*x = -3 for x from 2 to 10')).toBe('= 3')
  })

  it('binds the answer for the lines below', () => {
    expect(
      value(`h = 500 mm
b = 300 mm
sigma = 250 kN*m/(b*h^2/6)
b_req = solve sigma = 30 MPa for b
twice = 2*b_req`),
    ).toBe('= 400 mm')
  })

  it('says so when the two sides never meet', () => {
    expect(value('a = 5 mm\ny = a*0 + 1 mm\ny_req = solve y = 2 mm for a')).toContain(
      'never changes sign',
    )
  })

  it('asks for a range when the variable has no value above', () => {
    expect(value('y_req = solve q = 2 mm for q')).toContain('from')
  })

  it('refuses to match quantities of different kinds', () => {
    expect(value('a = 5 mm\ny = a*2\ny_req = solve y = 3 MPa for a')).toContain('error')
  })
})

describe('named tables', () => {
  const sheet = `table steel
  section | h | A
  IPE200 | 200 mm | 2850 mm^2
  IPE300 | 300 mm | 5380 mm^2
  IPE400 | 400 mm | 8450 mm^2
end
`
  const last = (source: string): string => {
    const lines = evaluateSheet(sheet + source)
    const line = lines.at(-1)
    if (!line) return 'no lines'
    if (line.kind === 'error') return `error: ${line.message}`
    return line.kind === 'calc' ? line.summary : line.kind
  }

  it('interpolates between two rows', () => {
    expect(last('A_mid = interp(250 mm, steel.h, steel.A)')).toBe('= 4115 mm^2')
  })

  it('interpolates down a column that runs the other way', () => {
    expect(
      last(`table down
  x | y
  10 s | 1 m
  5 s | 3 m
  1 s | 7 m
end
z = interp(7 s, down.x, down.y)`),
    ).toBe('= 2.2 m')
  })

  it('refuses to extrapolate past the last row', () => {
    expect(last('A = interp(600 mm, steel.h, steel.A)')).toContain('outside the table')
  })

  it('looks a row up by its label', () => {
    expect(last('A = lookup("IPE300", steel.section, steel.A)')).toBe('= 5380 mm^2')
  })

  it('lists what is there when the label is not', () => {
    const message = last('A = lookup("HEA200", steel.section, steel.A)')
    expect(message).toContain('IPE200')
  })

  it('sums and takes the largest of a column', () => {
    expect(last('A_total = sum(steel.A)')).toBe('= 16680 mm^2')
    expect(last('h_max = max(steel.h)')).toBe('= 400 mm')
  })

  it('leaves an unnamed table out of the scope', () => {
    expect(
      last(`table
  s | b
  A | 2 mm
end
z = interp(1 mm, steel.h, steel.A)`),
    ).toContain('outside the table')
  })
})
