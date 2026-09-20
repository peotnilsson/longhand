import { describe, expect, it } from 'vitest'
import { evaluateSheet } from './engine'
import { toLatex, toWordHtml } from './export'

const SHEET = `# Beam check
## Loading
// The load case is the one from the brief.
b = 300 mm
h = 500 mm
M_Ed = 250 kN*m
f_yd = 235 MPa
W = b*h^2/6
sigma = M_Ed/W  -> MPa  ?? is 250 the right case
sigma <= f_yd
table
  case | bw     | hw
  A    | 300 mm | 500 mm
  B    | 250 mm | 450 mm
end
`

const lines = evaluateSheet(SHEET)
const META = { project: 'Bridge 12', author: 'Peo', revision: 'B' }

describe('LaTeX export', () => {
  const tex = toLatex('Beam check', lines, META)

  it('is a document that stands on its own', () => {
    expect(tex).toContain('\\documentclass')
    expect(tex).toContain('\\begin{document}')
    expect(tex.trimEnd().endsWith('\\end{document}')).toBe(true)
  })

  it('marks the part that can be lifted into somebody else&apos;s document', () => {
    expect(tex).toContain('% --- sheet body begins')
    expect(tex).toContain('% --- sheet body ends')
  })

  it('carries the formulas as formulas', () => {
    expect(tex).toMatch(/\\\[|\\begin\{equation\}/)
    expect(tex).toContain('\\frac')
  })

  it('keeps the sheet&apos;s own equation numbers', () => {
    expect(tex).toContain('\\tag{')
  })

  it('carries the verdict, the table and the query', () => {
    expect(tex).toContain('\\textbf{OK}')
    expect(tex).toContain('\\begin{longtable}')
    expect(tex).toContain('is 250 the right case')
  })

  /**
   * An underscore in a variable name is a subscript inside maths and a syntax
   * error outside it. The prose is escaped; the maths, which is already TeX,
   * is not — and getting that backwards produces a file that will not compile.
   */
  it('escapes prose without mangling the maths', () => {
    const awkward = evaluateSheet('# T\n// 50 % of f_y & more_things\nx = 1 mm\n')
    const out = toLatex('T', awkward)
    expect(out).toContain('50 \\% of f\\_y \\& more\\_things')
    expect(out).toContain('\\begin{equation}')
  })

  it('names the project and the revision, because an appendix has to', () => {
    expect(tex).toContain('Bridge 12')
    expect(tex).toContain('Revision: B')
  })
})

describe('Word export', () => {
  const html = toWordHtml('Beam check', lines, (tex) => `<math data-tex="${tex.length}"></math>`, {
    ...META,
    signature: 'Checked by A. Nilsson on 2026-09-20',
  })

  it('is a document Word recognises as its own', () => {
    expect(html).toContain('urn:schemas-microsoft-com:office:word')
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('hands the formulas over as maths, not as pictures or prose', () => {
    expect(html).toContain('<math')
    expect(html).not.toContain('<img')
  })

  it('carries the table as a table Word can edit', () => {
    expect(html).toContain('<table')
    expect(html).toContain('<th>case</th>')
  })

  it('carries the signature line', () => {
    expect(html).toContain('Checked by A. Nilsson')
  })

  it('escapes what would otherwise close a tag', () => {
    const risky = evaluateSheet('# T\n// a < b & "quoted"\nx = 1 mm\n')
    const out = toWordHtml('T', risky, () => '<math/>')
    expect(out).toContain('a &lt; b &amp; &quot;quoted&quot;')
  })
})
