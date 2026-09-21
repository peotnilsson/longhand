import { describe, expect, it } from 'vitest'
import { clearCache, evaluateSheet } from '.'

const withEnd = (endLine: string) => `# Sections
M_Ed = 250 kN*m
f_ck = 30 MPa
table
  section | bw     | hw     | Wt = bw*hw^2/6 | st = M_Ed/Wt | ok = st <= f_ck
  A       | 300 mm | 500 mm
  B       | 250 mm | 450 mm
  C       | 200 mm | 350 mm
${endLine}

// The other question
b_req = 200 mm

table steel
  profile | h
  IPE200  | 200 mm
end
`

const tableAt = (source: string, index = 0) =>
  evaluateSheet(source).filter((line) => line.kind === 'table')[index] as Extract<
    ReturnType<typeof evaluateSheet>[number],
    { kind: 'table' }
  >

describe('typing the end of a table', () => {
  /**
   * The bug this pins: the incremental cache found the block an edit belonged
   * to by reading backwards from the edited line, and stopped at once when
   * that line was itself the `end`. So typing the last letter of `end` reused
   * the table as it had been a keystroke earlier — unterminated, having
   * swallowed every line down to the next table's end — and the sheet stayed
   * wrong until something above it changed.
   */
  it('closes the table the moment the d is typed', () => {
    clearCache()
    const open = tableAt(withEnd('en'))
    expect(open.rows.length).toBeGreaterThan(3)

    const closed = tableAt(withEnd('end'))
    expect(closed.rows.map((row) => row[0].text)).toEqual(['A', 'B', 'C'])
  })

  it('opens it again when the d is deleted', () => {
    clearCache()
    tableAt(withEnd('end'))
    expect(tableAt(withEnd('en')).rows.length).toBeGreaterThan(3)
  })

  it('gets the same answer from the cache as from nothing', () => {
    clearCache()
    evaluateSheet(withEnd('e'))
    evaluateSheet(withEnd('en'))
    const warm = JSON.stringify(evaluateSheet(withEnd('end')))
    clearCache()
    expect(JSON.stringify(evaluateSheet(withEnd('end')))).toBe(warm)
  })
})

describe('a table that runs past where it should end', () => {
  it('says which line broke it, rather than only filling cells with errors', () => {
    clearCache()
    const table = tableAt(withEnd('// forgot the end'))
    expect(table.warning).toMatch(/Line \d+ does not look like a row/)
    expect(table.warning).toContain('end')
  })

  it('says nothing when the table is fine', () => {
    clearCache()
    expect(tableAt(withEnd('end')).warning).toBeUndefined()
  })

  it('says so when the sheet ends before the table does', () => {
    clearCache()
    const table = tableAt('table\n  a | b\n  1 | 2\nx = 1 mm\n')
    expect(table.warning).toMatch(/never ends/)
  })
})

describe('a verdict column', () => {
  it('carries its margin row by row, the way a check line does', () => {
    clearCache()
    const table = tableAt(withEnd('end'))
    const ok = table.rows.map((row) => row[row.length - 1])
    expect(ok[0]).toMatchObject({ text: 'OK', margin: '33.3% spare' })
    expect(ok[2].text).toBe('NOT OK')
    expect(ok[2].margin).toMatch(/over the limit/)
  })

  it('agrees with the same comparison written as a check line', () => {
    clearCache()
    const lines = evaluateSheet('M = 250 kN*m\nW = 1.25e7 mm^3\nst = M/W\nf = 30 MPa\nst <= f\n')
    const check = lines.find((line) => line.kind === 'check')
    const table = tableAt(
      'M = 250 kN*m\nf = 30 MPa\ntable\n  W          | st = M/W | ok = st <= f\n  1.25e7 mm^3\nend\n',
    )
    expect(check && check.kind === 'check' && check.margin).toBe(table.rows[0][2].margin)
  })

  it('has no margin to give for a comparison that is not a ratio', () => {
    clearCache()
    const table = tableAt('table\n  a | same = a == 2\n  2\nend\n')
    expect(table.rows[0][1].verdict).toBe('pass')
    expect(table.rows[0][1].margin).toBeUndefined()
  })
})
