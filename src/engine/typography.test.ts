import { describe, expect, it } from 'vitest'
import { mathToTex } from './mathline'
import { clearCache, evaluateSheet } from './sheet'
import { normaliseForCalculation, typographyHint } from './source'

/**
 * What a person pastes.
 *
 * Every case here was a syntax error on a line that looked perfectly correct,
 * which is the failure these tests exist to keep from coming back: the
 * characters come from a PDF, a Word document or a Swedish keyboard, and each
 * of them has one reading.
 */

const run = (source: string) => {
  clearCache()
  return evaluateSheet(source)
}
const first = (source: string) => run(source)[0] as any
const summary = (source: string) => first(source).summary as string
const failure = (source: string) => {
  const line = first(source)
  expect(line.kind, JSON.stringify(line)).toBe('error')
  return line.message as string
}

describe('characters a document puts on the line', () => {
  it('reads the minus sign, the multiplication sign and the middle dot', () => {
    expect(summary('a = 2 m − 1 m')).toBe('= 1 m')
    expect(summary('a = 2 m × 3')).toBe('= 6 m')
    expect(summary('a = 5 · 3 m')).toBe('= 15 m')
    expect(summary('a = 6 m ÷ 3')).toBe('= 2 m')
    expect(summary('a = 2 m – 1 m')).toBe('= 1 m')
  })

  it('reads a non-breaking space between a number and its unit', () => {
    expect(summary('a = 2 m')).toBe('= 2 m')
    expect(summary('a = 2 m')).toBe('= 2 m')
  })

  it('reads a superscript exponent, positive or negative', () => {
    expect(summary('a = 2 m/s²')).toBe('= 2 m/s^2')
    expect(normaliseForCalculation('f = 3 s⁻¹')).toBe('f = 3 s^-1')
    expect(normaliseForCalculation('V = 2 m³')).toBe('V = 2 m^3')
  })

  it('reads the micro sign, which is not the Greek letter', () => {
    expect(summary('a = 10 µm')).toBe('= 10 um')
    expect(summary('a = 10 μm')).toBe('= 10 um')
  })

  it('reads a degree, of angle and of temperature', () => {
    expect(summary('a = 45°')).toBe('= 45 deg')
    expect(summary('T = 20 °C')).toBe('= 20 degC')
  })

  it('reads ≤ and ≥ in a check, and ± as a tolerance', () => {
    const check = run('f = 30 MPa\ns = 20 MPa\ns ≤ f')[2] as any
    expect(check.kind).toBe('check')
    expect(check.pass).toBe(true)
    expect(summary('a = 2 m ± 0.1 m')).toContain('±')
  })

  it('reads ** as a power, the way a spreadsheet writes it', () => {
    expect(normaliseForCalculation('a = 2 ** 3')).toBe('a = 2 ^ 3')
    expect(summary('a = 2 ** 3 * 1 m')).toBe('= 8 m')
  })

  it('leaves quoted text exactly as it was typed', () => {
    const line = first('a = 2 m   // mätt på plats – rev C')
    expect(line.note).toBe('mätt på plats – rev C')
    expect(normaliseForCalculation('name = "2 × 4 – balk"')).toBe('name = "2 × 4 – balk"')
  })

  it('leaves a heading and a note alone', () => {
    expect((first('# 2 × 4 – balkar') as any).text).toBe('2 × 4 – balkar')
    expect((first('// 10 µm ± 2 µm') as any).text).toBe('10 µm ± 2 µm')
  })

  it('says what to write for the two it cannot guess', () => {
    expect(failure('a = 2,5 m')).toContain('2.5')
    expect(failure('a = 1 000 m')).toContain('1000')
    expect(typographyHint('a = 2.5 m')).toBeNull()
  })

  it('does not touch a comma that separates arguments', () => {
    expect(summary('a = max(2 m, 5 m)')).toBe('= 5 m')
  })

  it('reads them in a table as well', () => {
    const table = run('table\n  b | A = b²\n  2 m\n  3 m\nend').find((line) => line.kind === 'table') as any
    expect(table.rows.map((row: any[]) => row[1].text)).toEqual(['4 m^2', '9 m^2'])
    expect(table.warning).toBeUndefined()
  })
})

describe('characters a document puts in presentation maths', () => {
  it('sets the relations', () => {
    expect(mathToTex('x ≤ 2')).toBe('x \\leq 2')
    expect(mathToTex('a ≠ b')).toBe('a \\neq b')
    expect(mathToTex('a ≈ b')).toBe('a \\approx b')
    expect(mathToTex('x → ∞')).toBe('x \\to \\infty')
    expect(mathToTex('r² - r = 0')).toBe('{r}^{2} - r = 0')
  })

  it('sets the sets', () => {
    expect(mathToTex('A ∪ B')).toBe('A \\cup B')
    expect(mathToTex('∀ x ∈ RR')).toBe('\\forall x \\in \\mathbb{R}')
  })

  it('sets a Greek letter as a Greek letter', () => {
    expect(mathToTex('σ = 5')).toBe('\\sigma = 5')
    expect(mathToTex('Δ T')).toBe('\\Delta T')
  })

  it('gives a root sign its argument', () => {
    expect(mathToTex('√2')).toBe('\\sqrt{2}')
    expect(mathToTex('√(a + b)')).toBe('\\sqrt{a + b}')
  })

  it('sets a degree as a degree', () => {
    expect(mathToTex('45°')).toBe('{45}^{\\circ}')
  })

  it('sets a prime as a prime', () => {
    expect(mathToTex("f′(x)")).toBe(mathToTex("f'(x)"))
  })
})
