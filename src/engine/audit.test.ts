import { describe, expect, it } from 'vitest'
import { clearCache, evaluateSheet } from '.'

/**
 * Five ways the engine used to give a confident wrong answer.
 *
 * Every one of these was found by reading the code rather than by using the
 * app, which is the point: none of them announced itself. They are pinned
 * here because a wrong number that looks deliberate is the worst thing this
 * program can do.
 */

const run = (source: string) => {
  clearCache()
  return evaluateSheet(source)
}
const table = (source: string) => {
  const line = run(source).find((candidate) => candidate.kind === 'table')
  if (line?.kind !== 'table') throw new Error('no table')
  return { headers: line.headers, rows: line.rows.map((row) => row.map((cell) => cell.text)) }
}
const summary = (source: string, index: number) => {
  const line = run(source)[index]
  return 'summary' in line ? line.summary : `${line.kind}: ${'message' in line ? line.message : ''}`
}

describe('a column of very different magnitudes', () => {
  it('does not print a real value as zero', () => {
    const { rows } = table('table\n  v\n  1000\n  0.002\n  25\nend\n')
    expect(rows.flat()).toEqual(['1.000e3', '2.000e-3', '2.500e1'])
  })

  it('keeps a small value when the column is written plainly', () => {
    const { rows } = table('table\n  v\n  1.5\n  0.25\nend\n')
    expect(rows.flat()).toEqual(['1.500', '0.250'])
  })

  it('still writes whole numbers whole', () => {
    const { rows } = table('table\n  v\n  300\n  250\nend\n')
    expect(rows.flat()).toEqual(['300', '250'])
  })
})

describe('a computed column that is not the last one', () => {
  it('puts every value under its own heading', () => {
    const { headers, rows } = table('table\n  A = b*2 | b | h\n  | 10 | 20\nend\n')
    expect(headers).toEqual(['A', 'b', 'h'])
    expect(rows).toEqual([['20', '10', '20']])
  })

  it('still reads a row that only gives the plain columns, in order', () => {
    const { rows } = table('table\n  b | h | A = b*h\n  10 | 20\nend\n')
    expect(rows).toEqual([['10', '20', '200']])
  })

  it('leaves a half-written row blank rather than failing it', () => {
    const { rows } = table('table\n  b | h\n  10\nend\n')
    expect(rows).toEqual([['10', '—']])
  })
})

describe('an absolute temperature where a difference was meant', () => {
  it('is refused inside a table, not only on a line of its own', () => {
    const { rows } = table('U = 0.17 W/(m^2*K)\ntable\n  dT | q = U*dT\n  22 degC\nend\n')
    expect(rows[0][1]).toMatch(/not a difference/)
  })

  it('is refused in a plot', () => {
    const line = run('U = 0.17 W/(m^2*K)\nplot U*T vs T from 1 degC to 22 degC\n')[1]
    expect(line.kind).toBe('error')
  })

  it('lets the same calculation through in kelvin', () => {
    const { rows } = table('U = 0.17 W/(m^2*K)\ntable\n  dT | q = U*dT\n  22 K\nend\n')
    expect(rows[0][1]).toBe('3.740 W/m^2')
  })
})

describe('a matrix raised to a power', () => {
  it('is a matrix power, not the element-wise one the page does not show', () => {
    expect(summary('M = [1, 2; 3, 4]\nP = M^2\n', 1)).toBe('= [7, 10; 15, 22]')
  })

  it('leaves a list element by element, which is what a sheet wants', () => {
    expect(summary('d = [1, 2, 3]\nA = d^2\n', 1)).toBe('= [1, 4, 9]')
  })

  it('leaves an ordinary quantity alone', () => {
    expect(summary('b = 300 mm\nW = b^3\n', 1)).toBe('= 2.7e7 mm^3')
  })
})

describe('defining a unit', () => {
  /**
   * `unit m = 1 m` used to take metres apart for the whole browser session:
   * every sheet in every project then read "Undefined symbol mm", with the
   * error pointing at the line that defined it rather than at the damage.
   */
  it('never breaks a unit that already means something', () => {
    expect(summary('unit m = 1 m\n', 0)).not.toMatch(/error/)
    expect(summary('b = 300 mm\nc = 2 km\n', 0)).toBe('= 300 mm')
    expect(summary('b = 300 mm\nc = 2 km\n', 1)).toBe('= 2 km')
  })

  it('refuses to change one, and says why', () => {
    const line = run('unit mm = 2 m\n')[0]
    expect(line.kind).toBe('error')
    expect(line.kind === 'error' && line.message).toMatch(/already means/)
  })

  it('still defines a new one', () => {
    expect(summary('unit klf2 = 1000 lbf/ft\nv = 2 klf2\n', 1)).toContain('kN/m')
  })
})

describe('solving and iterating', () => {
  /**
   * These ran on a second, separate copy of mathjs, so every unit Longhand
   * adds — ksi, kip, klf, psf — and every unit a sheet defines was invisible
   * to them. The failure looked like "no value of b makes this true".
   */
  it('knows the units Longhand adds', () => {
    expect(summary('b = 2\nf = b * 1 ksi\nx = solve f = 10 ksi for b\n', 2)).toBe('= 10')
  })

  it('knows a unit the sheet defined', () => {
    expect(
      summary('unit klf2 = 1000 lbf/ft\nb = 2\nf = b * 1 klf2\nx = solve f = 10 klf2 for b\n', 3),
    ).toBe('= 10')
  })

  it('can replay a line that uses a range', () => {
    expect(
      summary('i = 1..3\nw = i*10 kN/m\nb = 2\nt = sum(w)*b\nx = solve t = 120 kN/m for b\n', 4),
    ).toBe('= 2')
  })
})

describe('arithmetic that has no answer', () => {
  it('is an error, not a printed Infinity', () => {
    const line = run('x = 1/0\n')[0]
    expect(line.kind).toBe('error')
    expect(line.kind === 'error' && line.message).toMatch(/infinity/i)
  })

  it('says so for not-a-number too', () => {
    expect(run('x = 0/0\n')[0].kind).toBe('error')
  })

  it('catches it through units', () => {
    expect(run('L = 5 m\nx = L/0 m\n')[1].kind).toBe('error')
  })

  it('leaves ordinary arithmetic alone', () => {
    expect(summary('x = 1/3\n', 0)).toBe('= 0.3333')
  })
})

describe('a line the parser cannot get through', () => {
  it('says what to do instead of "maximum call stack size exceeded"', () => {
    const long = `x = ${Array.from({ length: 2000 }, (_unused, index) => index).join(' + ')}\n`
    const line = run(long)[0]
    expect(line.kind === 'error' && line.message).toMatch(/break it into a few named steps/)
  })
})

describe('a name that is also a unit', () => {
  /**
   * `a = b` above `b = 2 mm` is one barn, silently — b is a unit mathjs knows.
   * The line looks like an ordinary result and there is nothing to notice.
   */
  it('says which one was used when the other is defined below', () => {
    const line = run('a = b\nb = 2 mm\n')[0]
    expect(line.kind === 'calc' && line.warning).toMatch(/b here is the unit/)
  })

  it('says nothing when the name is defined above, as it should be', () => {
    const line = run('b = 2 mm\na = b\n')[1]
    expect(line.kind === 'calc' && line.warning).toBeUndefined()
  })
})
