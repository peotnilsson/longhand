import { describe, expect, it } from 'vitest'
import { evaluateSheet } from './engine'
import { splitNote } from './engine/source'
import { ENTRIES, REFERENCE, filterSections, search } from './reference'
import { EXAMPLES, findExample } from './examples'

/**
 * Documentation that is not run is documentation that is wrong. Every example
 * printed on the reference page, and every worked example offered from the
 * landing page, is evaluated here — so a change to the language that breaks
 * what the page claims fails the build instead of embarrassing us later.
 */

const errorsIn = (source: string): string[] =>
  evaluateSheet(source)
    .filter((line) => line.kind === 'error')
    .map((line) => (line.kind === 'error' ? `${line.source}: ${line.message}` : ''))

describe('the reference', () => {
  it('has a unique id for every section and entry', () => {
    const ids = [...REFERENCE.map((section) => section.id), ...ENTRIES.map((entry) => entry.id)]
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('says something about every entry', () => {
    for (const entry of ENTRIES) {
      expect(entry.code.length, entry.id).toBeGreaterThan(0)
      expect(entry.summary.length, entry.id).toBeGreaterThan(3)
    }
  })

  for (const entry of ENTRIES.filter((candidate) => candidate.example)) {
    it(`runs the example for ${entry.id}`, () => {
      expect(errorsIn(entry.example!)).toEqual([])
    })
  }

  it('finds things by what they are called elsewhere', () => {
    expect(search('goal seek').map((entry) => entry.id)).toContain('solve')
    expect(search('vlookup').map((entry) => entry.id)).toContain('lookup')
    expect(search('uncertainty').map((entry) => entry.id)).toContain('tolerance')
    expect(search('interpolate').map((entry) => entry.id)).toContain('interp')
  })

  it('matches on all the words, not any of them', () => {
    expect(search('table name').map((entry) => entry.id)).toContain('named-table')
    expect(search('table zzz')).toHaveLength(0)
  })

  it('returns everything for an empty search', () => {
    expect(search('  ')).toHaveLength(ENTRIES.length)
    expect(filterSections('')).toHaveLength(REFERENCE.length)
  })

  it('drops sections with no hits when filtering', () => {
    const sections = filterSections('solve')
    expect(sections.length).toBeGreaterThan(0)
    expect(sections.every((section) => (section.entries ?? []).length > 0)).toBe(true)
  })
})

describe('the worked examples', () => {
  for (const example of EXAMPLES) {
    it(`${example.name} evaluates without an error`, () => {
      expect(errorsIn(example.source)).toEqual([])
    })
  }

  it('gets the beam right: 21.6 kN/m, 172.8 kN*m, 191.2 MPa, and it passes', () => {
    const lines = evaluateSheet(findExample('beam')!.source)
    const summaries = lines.flatMap((line) =>
      line.kind === 'calc' ? [line.summary] : line.kind === 'check' ? [line.summary] : [],
    )
    expect(summaries).toContain('= 21.6 kN/m')
    expect(summaries).toContain('= 172.8 kN*m')
    expect(summaries.some((text) => text.startsWith('= 191.2 MPa'))).toBe(true)
    expect(summaries.some((text) => text.startsWith('OK'))).toBe(true)
    // solve gives the modulus actually required: 172.8 kN*m / 355 MPa
    expect(summaries.at(-1)).toBe('= 4.868e5 mm^3')
  })

  it('solves Colebrook in the pump example', () => {
    const lines = evaluateSheet(findExample('pump')!.source)
    const summaries = lines.flatMap((line) => (line.kind === 'calc' ? [line.summary] : []))
    // a friction factor near 0.019 and a total head near 9.1 m
    expect(summaries.some((text) => /^= 0\.019/.test(text))).toBe(true)
    expect(summaries.at(-1)).toMatch(/^= 9\.1/)
  })

  it('propagates the insulation tolerance into the U-value', () => {
    const lines = evaluateSheet(findExample('wall')!.source)
    const u = lines.find(
      (line) => line.kind === 'calc' && line.summary.includes('W/m^2/K'),
    )
    expect(u?.kind).toBe('calc')
    expect(u && u.kind === 'calc' && u.tolerance?.text).toMatch(/±/)
  })

  it('shows the diameter dominating the volume it was measured for', () => {
    const lines = evaluateSheet(findExample('density')!.source)
    // shares are attributed to the quantities named on the line, so the
    // measurements show up on V, which is where they were combined
    const volume = lines.find(
      (line) => line.kind === 'calc' && line.summary.includes('mm^3'),
    )
    const shares = volume && volume.kind === 'calc' ? (volume.tolerance?.contributions ?? []) : []
    expect(shares[0]?.name).toBe('d')
    expect(shares[0]?.share).toBeGreaterThan(0.5)
    expect(shares.reduce((total, share) => total + share.share, 0)).toBeCloseTo(1, 2)
  })

  it('has an id the app can be linked with', () => {
    expect(findExample('beam')?.name).toBeTruthy()
    expect(findExample('nope')).toBeUndefined()
    expect(findExample(null)).toBeUndefined()
  })
})

describe('notes on a line', () => {
  it('keeps a trailing note out of the maths and beside the result', () => {
    const lines = evaluateSheet('b = 300 mm    // from drawing A-102, rev C')
    const line = lines[0]
    expect(line.kind).toBe('calc')
    expect(line.kind === 'calc' && line.summary).toBe('= 300 mm')
    expect(line.kind === 'calc' && line.note).toBe('from drawing A-102, rev C')
  })

  it('leaves a // inside a quoted label alone', () => {
    expect(splitNote('x = lookup("a//b", t.name, t.v)')).toEqual({
      body: 'x = lookup("a//b", t.name, t.v)',
    })
    expect(splitNote('x = 1 mm  // and "quotes" in the note')).toEqual({
      body: 'x = 1 mm',
      note: 'and "quotes" in the note',
    })
  })

  it('carries a note on a check and on a solve', () => {
    const lines = evaluateSheet(
      'a = 2 mm\nb = 3 mm\na <= b   // clause 6.2.1\nc = solve a = b for a  // required',
    )
    const check = lines.find((line) => line.kind === 'check')
    expect(check && check.kind === 'check' && check.note).toBe('clause 6.2.1')
    const solved = lines.at(-1)
    expect(solved && solved.kind === 'calc' && solved.note).toBe('required')
  })
})
