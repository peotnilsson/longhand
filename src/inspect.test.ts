import { describe, expect, it } from 'vitest'
import { evaluateSheet } from './engine'
import { downstream, inspect, tableFromPaste, toMarkdown } from './inspect'

const sheet = [
  '# Beam',
  'b = 300 mm',
  'h = 500 mm',
  'M_Ed = 250 kN*m',
  'W = b*h^2/6',
  'sigma = M_Ed/W -> MPa',
  'spare = 1 mm',
].join('\n')

const symbolsOf = (source: string) => inspect(source, evaluateSheet(source))

describe('the variable inspector', () => {
  it('lists every symbol with what it holds', () => {
    const found = symbolsOf(sheet)
    expect(found.map((symbol) => symbol.name)).toEqual([
      'b',
      'h',
      'M_Ed',
      'W',
      'sigma',
      'spare',
    ])
    expect(found.find((symbol) => symbol.name === 'W')?.value).toContain('mm^3')
  })

  it('says what each one is built from', () => {
    const W = symbolsOf(sheet).find((symbol) => symbol.name === 'W')
    expect(W?.dependsOn.sort()).toEqual(['b', 'h'])
  })

  it('and what is built from it', () => {
    const W = symbolsOf(sheet).find((symbol) => symbol.name === 'W')
    expect(W?.usedBy).toEqual(['sigma'])
  })

  /** The question to answer before altering anything somebody else will check. */
  it('traces everything a change would redo', () => {
    const found = symbolsOf(sheet)
    expect(downstream(found, 'b').sort()).toEqual(['W', 'sigma'])
    expect(downstream(found, 'sigma')).toEqual([])
  })

  it('points out a symbol nothing uses, which is often a typo', () => {
    const unused = symbolsOf(sheet).filter((symbol) => symbol.unused).map((s) => s.name)
    expect(unused).toContain('spare')
    expect(unused).not.toContain('b')
  })

  it('carries the equation number, so a symbol can be pointed at', () => {
    const sigma = symbolsOf(sheet).find((symbol) => symbol.name === 'sigma')
    expect(sigma?.equation).toBe(5)
  })
})

describe('equation numbers and references', () => {
  it('numbers the lines that define something, in reading order', () => {
    const lines = evaluateSheet('a = 1\nb = 2\nc = a + b')
    const numbers = lines.flatMap((line) =>
      line.kind === 'calc' ? [line.equation] : [],
    )
    expect(numbers).toEqual([1, 2, 3])
  })

  it('resolves @name in prose to the equation number', () => {
    const lines = evaluateSheet('b = 300 mm\nW = b^3\n// The section modulus is @W')
    const prose = lines.filter((line) => line.kind === 'prose').at(-1)
    expect(prose && prose.kind === 'prose' && prose.text).toBe('The section modulus is eq. 2')
  })

  it('leaves a reference to nothing exactly as written', () => {
    const lines = evaluateSheet('// see @nothing_here')
    const prose = lines.find((line) => line.kind === 'prose')
    expect(prose && prose.kind === 'prose' && prose.text).toBe('see @nothing_here')
  })

  it('renumbers itself when a line moves', () => {
    const lines = evaluateSheet('x = 9 mm\nb = 300 mm\nW = b^3\n// see @W')
    const prose = lines.filter((line) => line.kind === 'prose').at(-1)
    expect(prose && prose.kind === 'prose' && prose.text).toBe('see eq. 3')
  })
})

describe("a reviewer's query", () => {
  it('comes off the line and is kept apart from a note', () => {
    const lines = evaluateSheet('sigma = 20 MPa // from the load case ?? is that the right one')
    const calc = lines.find((line) => line.kind === 'calc')
    expect(calc && calc.kind === 'calc' && calc.note).toBe('from the load case')
    expect(calc && calc.kind === 'calc' && calc.query).toBe('is that the right one')
  })

  it('works without a note too', () => {
    const lines = evaluateSheet('sigma = 20 MPa ?? which load case')
    const calc = lines.find((line) => line.kind === 'calc')
    expect(calc && calc.kind === 'calc' && calc.query).toBe('which load case')
    expect(calc && calc.kind === 'calc' && calc.summary).toBe('= 20 MPa')
  })

  it('can be attached to a check, which is where a checker argues', () => {
    const lines = evaluateSheet('a = 1\nb = 2\na <= b ?? is 2 the limit or 2.5')
    const check = lines.find((line) => line.kind === 'check')
    expect(check && check.kind === 'check' && check.query).toBe('is 2 the limit or 2.5')
  })
})

describe('a page break where the author asked for one', () => {
  it('is a line of its own and evaluates to nothing', () => {
    const lines = evaluateSheet('a = 1\npage break\nb = 2')
    expect(lines[1].kind).toBe('break')
    expect(lines.filter((line) => line.kind === 'error')).toEqual([])
  })
})

describe('taking a sheet elsewhere', () => {
  it('writes Markdown a report appendix can hold', () => {
    const source = '# Beam\nb = 300 mm\nb <= 400 mm\n'
    const text = toMarkdown('Beam', evaluateSheet(source))
    expect(text).toContain('# Beam')
    expect(text).toContain('`b` = 300 mm')
    expect(text).toContain('**OK**')
  })

  it('carries a table across as a Markdown table', () => {
    const source = 'table\n  a | b\n  1 mm | 2 mm\nend\n'
    const text = toMarkdown('T', evaluateSheet(source))
    expect(text).toContain('| a | b |')
    expect(text).toContain('| --- | --- |')
  })

  it('turns a pasted spreadsheet range into a table block', () => {
    const block = tableFromPaste('profile\th\tA\nIPE200\t200 mm\t2850 mm^2\nIPE300\t300 mm\t5380 mm^2')
    expect(block).toContain('table')
    expect(block).toContain('profile | h')
    expect(block?.trimEnd().endsWith('end')).toBe(true)
  })

  it('reads a comma-separated range too', () => {
    const block = tableFromPaste('a,b\n1 mm,2 mm')
    // The columns are padded to line up, the way somebody would have typed them.
    expect(block).toContain('a    | b')
    expect(block).toContain('1 mm | 2 mm')
  })

  /** What comes out has to be a block the engineer can edit, not a black box. */
  it('produces something the engine can actually run', () => {
    const block = tableFromPaste('profile\th\nIPE200\t200 mm\nIPE300\t300 mm')!
    const lines = evaluateSheet(block)
    expect(lines.filter((line) => line.kind === 'error')).toEqual([])
    const table = lines.find((line) => line.kind === 'table')
    expect(table && table.kind === 'table' && table.rows.length).toBe(2)
  })

  it('refuses something that is not a table', () => {
    expect(tableFromPaste('just one line')).toBeNull()
    expect(tableFromPaste('')).toBeNull()
  })
})
