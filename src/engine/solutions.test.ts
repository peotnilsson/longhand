import { describe, expect, it } from 'vitest'
import katex from 'katex'
import { clearCache, evaluateSheet } from '.'

const run = (source: string) => {
  clearCache()
  return evaluateSheet(source)
}
const draws = (tex: string) =>
  expect(() => katex.renderToString(tex, { throwOnError: true, displayMode: true })).not.toThrow()

describe('a differential equation, solved', () => {
  const sheet = `y = ode y'' - y' - 2y = x, y(0) = 2, y'(0) = 0 for x from 0 to 3
exact(x) = 3/4*exp(2*x) + exp(-x) - x/2 + 1/4
`
  it('agrees with the solution worked out by hand, to far more figures than a sheet prints', () => {
    const lines = run(`${sheet}e1 = abs(y(1) - exact(1))\ne2 = abs(y(2.9) - exact(2.9)) / exact(2.9)\n`)
    const value = (index: number) => Number((lines[index] as any).summary.replace(/^= /, ''))
    expect(value(2)).toBeLessThan(1e-8)
    expect(value(3)).toBeLessThan(1e-9)
  })

  it('meets its initial conditions, including the slope', () => {
    const lines = run(`${sheet}a = y(0)\nd = deriv(y, 0)\n`)
    expect((lines[2] as any).summary).toBe('= 2')
    expect(Math.abs(Number((lines[3] as any).summary.replace(/^= /, '')))).toBeLessThan(1e-6)
  })

  it('solves a first-order equation too, in any variable', () => {
    const lines = run("u = ode u' = -u, u(0) = 1 for t from 0 to 2\nv = u(1)\n")
    expect((lines[1] as any).summary).toBe('= 0.3679')
  })

  it('can be plotted like any other function', () => {
    const lines = run(`${sheet}plot y(x) vs x from 0 to 2\n`)
    expect(lines[2].kind).toBe('plot')
  })

  it('says which condition is missing', () => {
    const [line] = run("z = ode z'' + z = 0, z(0) = 1 for x from 0 to 1\n")
    expect(line.kind === 'error' && line.message).toMatch(/z'\(0\) is missing/)
  })

  it('refuses a condition at the far end, and says why', () => {
    const [line] = run("z = ode z'' + z = 0, z(0) = 1, z(1) = 0 for x from 0 to 1\n")
    expect(line.kind === 'error' && line.message).toMatch(/boundary value problem/)
  })

  it('will not be read outside the interval it was solved on', () => {
    const lines = run(`${sheet}w = y(4)\n`)
    expect(lines[2].kind === 'error' && lines[2].message).toMatch(/only solved/)
  })

  it('prints the problem as it is set, in a brace', () => {
    const [line] = run(sheet)
    expect(line.kind === 'definition' && line.tex).toContain('\\begin{cases}')
    if (line.kind === 'definition') draws(line.tex)
  })
})

describe('symbolic working, shown', () => {
  it('prints a derivative as a formula', () => {
    const [line] = run('show diff(x^2*sin(x), x)\n')
    expect(line.kind === 'math' && line.summary).toBe('= 2 * x * sin(x) + x ^ 2 * cos(x)')
    if (line.kind === 'math') draws(line.tex)
  })

  it('takes ln the way people write it', () => {
    const [line] = run('show diff(ln(x), x)\n')
    expect(line.kind === 'math' && line.summary).toBe('= 1 / x')
  })

  it('simplifies a difference of squares all the way', () => {
    const [line] = run('show simplify((x + 1)^2 - (x - 1)^2)\n')
    expect(line.kind === 'math' && line.summary).toBe('= 4 * x')
  })

  it('writes exp as a power of e', () => {
    const [line] = run('show diff(exp(2*x), x)\n')
    expect(line.kind === 'math' && line.tex).toContain('{{e}}^{')
  })

  it('leaves x as a symbol even when the sheet has given it a value', () => {
    const lines = run('x = 3\nshow diff(x^3, x)\n')
    expect(lines[1].kind === 'math' && lines[1].summary).toBe('= 3 * x ^ 2')
  })
})

describe('the parts of a solution', () => {
  it('reads a), b) as parts of the exercise', () => {
    const [line] = run('a) Visa att $y = x e^(-x)$ löser ekvationen.\n')
    expect(line).toMatchObject({ kind: 'part', label: 'a' })
  })

  it('boxes the answer', () => {
    const [line] = run('svar y(x) = 3/4 e^(2x)\n')
    expect(line.kind === 'math' && line.tex).toMatch(/^\\boxed\{/)
    if (line.kind === 'math') draws(line.tex)
  })

  it('still lets a variable be called svar', () => {
    const [line] = run('svar = 3\n')
    expect(line.kind).toBe('calc')
  })

  it('numbers a labelled equation and resolves a reference to it the textbook way', () => {
    const lines = run("math #ode y'' - y' - 2y = x\nb = 2\n// Enligt @ode och @b.\n")
    expect(lines[0]).toMatchObject({ kind: 'math', equation: 1, name: 'ode' })
    expect(lines[2].kind === 'prose' && lines[2].text).toBe('Enligt (1) och eq. 2.')
  })
})

describe('matrices and complex numbers', () => {
  it('prints a small matrix as a matrix', () => {
    const lines = run('A = [1, 2; 3, 4]\nB = inv(A)\n')
    expect(lines[0].kind === 'calc' && lines[0].summary).toBe('= [1, 2; 3, 4]')
    expect(lines[1].kind === 'calc' && lines[1].tex).toContain('\\begin{bmatrix}-2 & 1')
    if (lines[1].kind === 'calc') draws(lines[1].tex)
  })

  it('gives a characteristic equation its complex roots', () => {
    const [line] = run('c = roots(1, 2, 5)\n')
    expect(line.kind === 'calc' && line.summary).toBe('= [-1 + 2i, -1 - 2i]')
    if (line.kind === 'calc') draws(line.tex)
  })

  it('gives real roots as plain numbers, in the order the polynomial is written', () => {
    const [line] = run('r = roots(1, -1, -2)\n')
    expect(line.kind === 'calc' && line.summary).toBe('= [2, -1]')
  })

  it('writes a complex number without a gap in it', () => {
    const [line] = run('z = 2 + 3i\n')
    expect(line.kind === 'calc' && line.tex).toBe('{z} = 2+3i')
  })
})
