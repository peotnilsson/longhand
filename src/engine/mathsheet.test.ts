import { describe, expect, it } from 'vitest'
import katex from 'katex'
import { clearCache, evaluateSheet } from '.'
import { ENTRIES } from '../reference'

const run = (source: string) => {
  clearCache()
  return evaluateSheet(source)
}

describe('maths written to be read, in a sheet', () => {
  it('typesets a math line and evaluates nothing', () => {
    const [line] = run("math y'' - y' - 2y = x\n")
    expect(line).toMatchObject({ kind: 'math', tex: "y'' - y' - 2 y = x" })
  })

  it('does not need anything on the line to be defined', () => {
    const lines = run('math lim(x -> 0, sin(x)/x) = 1\n')
    expect(lines.some((line) => line.kind === 'error')).toBe(false)
  })

  it('reads a system written over several lines as one brace', () => {
    const lines = run("math {\n  y'' - y' - 2y = x\n  y(0) = 2, y'(0) = 0\n}\nz = 1 mm\n")
    expect(lines[0].kind).toBe('math')
    expect(lines[0].kind === 'math' && lines[0].tex).toContain('\\begin{cases}')
    // the rows belong to the block, and the sheet carries on after it
    expect(lines[1].kind).toBe('blank')
    expect(lines[4].kind).toBe('calc')
  })

  it('keeps what comes before the brace, for a piecewise function over several lines', () => {
    const [line] = run('math f(x) = {\n  x^2 if x < 0\n  2x if x >= 0\n}\n')
    expect(line.kind === 'math' && line.tex).toMatch(/^f\(x\) = \\begin\{cases\}/)
  })

  it('lines an aligned derivation up', () => {
    const [line] = run('align\n  r^2 - r - 2 = 0\n  <=> r = 2 or r = -1\nend\n')
    expect(line.kind === 'math' && line.tex).toContain('\\begin{aligned}')
  })

  it('says so when a block never closes, instead of swallowing the sheet', () => {
    const [line] = run('math {\n  x = 1\n')
    expect(line.kind).toBe('error')
    expect(line.kind === 'error' && line.message).toMatch(/never closed/)
    const [aligned] = run('align\n  x = 1\n')
    expect(aligned.kind === 'error' && aligned.message).toMatch(/never ends/)
  })

  it('reports a line that will not parse, with the reason', () => {
    const [line] = run('math (x + 1\n')
    expect(line.kind).toBe('error')
  })

  it('still lets a variable be called math', () => {
    const [line] = run('math = 3\n')
    expect(line.kind).toBe('calc')
  })

  it('closes the block the moment } is typed, like a table does', () => {
    clearCache()
    evaluateSheet('math {\n  x = 1\n  y = 2\n\nz = 1 mm\n')
    const lines = evaluateSheet('math {\n  x = 1\n  y = 2\n}\nz = 1 mm\n')
    expect(lines[0].kind).toBe('math')
    expect(lines[4].kind).toBe('calc')
  })
})

describe('the help page', () => {
  /**
   * The engine accepting a line is not the same as KaTeX drawing it. Every
   * example the help page typesets is drawn here with errors switched on, so
   * a translation that produces TeX KaTeX does not know fails the build.
   */
  for (const entry of ENTRIES.filter((candidate) => candidate.preview && candidate.example)) {
    it(`typesets every line of the ${entry.id} example`, () => {
      for (const line of run(entry.example!)) {
        if (line.kind === 'error') throw new Error(`${line.source}: ${line.message}`)
        if (line.kind === 'math') {
          expect(() => katex.renderToString(line.tex, { throwOnError: true, displayMode: true })).not.toThrow()
        }
      }
    })
  }
})
