import { describe, expect, it } from 'vitest'
import katex from 'katex'
import { alignToTex, mathToTex, MathSyntaxError, splitInlineMath } from './mathline'

/** Every translation has to be TeX that KaTeX actually accepts. */
const renders = (tex: string) => {
  expect(() => katex.renderToString(tex, { throwOnError: true, displayMode: true })).not.toThrow()
  return tex
}
const tex = (source: string) => renders(mathToTex(source))

describe('writing maths to be read', () => {
  it('writes an equation with derivatives the way it is printed', () => {
    expect(tex("y'' - y' - 2y = x")).toBe("y'' - y' - 2 y = x")
  })

  it('makes a system out of rows separated by semicolons', () => {
    const out = tex("{ y'' - y' - 2y = x ; y(0) = 2, y'(0) = 0 }")
    expect(out).toContain('\\begin{cases}')
    expect(out).toContain('\\\\')
  })

  it('puts the condition of a piecewise definition in its own column', () => {
    const out = tex('f(x) = { x^2 if x < 0 ; 2x if x >= 0 }')
    expect(out).toContain('& \\text{if }')
    expect(out).toContain('\\geq')
  })

  it('writes a set, not a system, when there is no semicolon', () => {
    expect(tex('{ x in RR : x > 0 }')).toBe('\\left\\{x \\in \\mathbb{R} : x > 0\\right\\}')
  })

  it('turns a slash into a fraction, dropping the brackets it no longer needs', () => {
    expect(tex('(a + b)/(c + d)')).toBe('\\frac{a + b}{c + d}')
    expect(tex('2x/3')).toBe('\\frac{2 x}{3}')
    expect(tex('1/2 x')).toBe('\\frac{1}{2} x')
  })

  it('writes powers with their exponent grouped', () => {
    expect(tex('e^(2x)')).toBe('{e}^{2 x}')
    expect(tex('e^(-x)')).toBe('{e}^{-x}')
    expect(tex('x^-1')).toBe('{x}^{-1}')
  })

  it('keeps a sign outside a power', () => {
    expect(tex('-x^2')).toBe('-{x}^{2}')
  })

  it('puts a leading minus in front of a fraction, not on top of it', () => {
    expect(tex('a = -1/2')).toBe('a = -\\frac{1}{2}')
    expect(tex('x^-1')).toBe('{x}^{-1}')
  })

  it('writes the arrows of an argument', () => {
    expect(tex('r^2 - r - 2 = 0 <=> r = 2 or r = -1')).toContain('\\iff')
    expect(tex('a => b')).toContain('\\implies')
    expect(tex('x -> 0')).toContain('\\to')
  })

  it('writes limits, including one-sided ones', () => {
    expect(tex('lim(x -> 0, sin(x)/x) = 1')).toBe('\\lim_{x \\to 0} \\frac{\\sin(x)}{x} = 1')
    expect(tex('lim(x -> 0+, ln x)')).toContain('0^{+}')
    expect(tex('lim(n -> oo, (1 + 1/n)^n) = e')).toContain('\\infty')
  })

  it('writes sums, products and integrals with their limits', () => {
    expect(tex('sum(k = 1, n, k) = n(n + 1)/2')).toContain('\\sum_{k = 1}^{n}')
    expect(tex('int(x^2, x, 0, 1) = 1/3')).toContain('\\int_{0}^{1}')
    expect(tex('int(1/x, x) = ln|x| + C')).toContain('\\, dx')
  })

  it('writes the bracket you evaluate after integrating', () => {
    expect(tex('eval(x^3/3, 0, 1)')).toContain('\\Big]_{0}^{1}')
  })

  it('writes derivatives in Leibniz notation', () => {
    expect(tex('diff(y, x) = 2x')).toBe('\\frac{dy}{dx} = 2 x')
    expect(tex('diff(y, x, 2)')).toBe('\\frac{d^{2}y}{dx^{2}}')
    expect(tex('diff(x) sin x')).toContain('\\frac{d}{dx}')
  })

  it('writes roots, absolute values and binomial coefficients', () => {
    expect(tex('sqrt(2)')).toBe('\\sqrt{2}')
    expect(tex('root(3, x)')).toBe('\\sqrt[3]{x}')
    expect(tex('|x - 1| < 2')).toBe('\\left|x - 1\\right| < 2')
    expect(tex('binom(n, k)')).toBe('\\binom{n}{k}')
  })

  it('writes the named functions upright', () => {
    expect(tex('sin^2(x) + cos^2(x) = 1')).toContain('\\sin^{2}')
    expect(tex('log_2(8) = 3')).toContain('\\log_{2}')
    expect(tex('arctan x')).toBe('\\arctan x')
  })

  it('writes subscripts, with a word set upright as a label', () => {
    expect(tex('a_(n+1) = 2a_n')).toBe('a_{n + 1} = 2 a_{n}')
    expect(tex('y_p(x)')).toBe('y_{p}(x)')
    expect(tex('M_Ed')).toBe('M_{\\mathrm{Ed}}')
  })

  it('writes intervals, including the Swedish open ones', () => {
    expect(tex('x in [0, 1)')).toContain('\\left[0, 1\\right)')
    expect(tex('x in ]0, 1[')).toContain('\\left]0, 1\\right[')
  })

  it('knows the number sets, infinity and Greek', () => {
    expect(tex('x in RR')).toBe('x \\in \\mathbb{R}')
    expect(tex('lambda^2 + 2lambda - 1')).toContain('\\lambda')
    expect(tex('x -> oo')).toContain('\\infty')
  })

  it('carries words and quoted text', () => {
    expect(tex('x = 2 eller x = -1')).toContain('\\text{eller}')
    expect(tex('"där" C "är en konstant"')).toContain('\\text{där}')
  })

  it('writes big O', () => {
    expect(tex('sin x = x - x^3/6 + ordo(x^5)')).toContain('\\mathcal{O}')
  })

  it('puts a dot between two numbers written side by side, so 2 3 is not 23', () => {
    expect(tex('2 3')).toBe('2 \\cdot 3')
  })

  it('says what is wrong rather than printing something else', () => {
    expect(() => mathToTex('(x + 1')).toThrow(MathSyntaxError)
    expect(() => mathToTex('sqrt(1, 2)')).toThrow(/sqrt takes/)
    expect(() => mathToTex('x + 1)')).toThrow(/left over/)
  })
})

describe('an aligned derivation', () => {
  it('lines the rows up on their first relation, and lets a row continue the one above', () => {
    const out = renders(alignToTex(['r^2 - r - 2 = 0', '<=> (r - 2)(r + 1) = 0', '<=> r = 2 or r = -1']))
    expect(out).toContain('\\begin{aligned}')
    expect(out).toContain('{r}^{2} - r - 2 & = 0')
    expect(out.match(/&/g)).toHaveLength(3)
  })
})

describe('maths inside a sentence', () => {
  it('cuts prose into text and maths at the dollar signs', () => {
    const pieces = splitInlineMath('Ekvationen $r^2 + 2r + 1 = 0$ har lösningen $r = -1$.')
    expect(pieces.map((piece) => (piece.tex ? 'M' : 'T')).join('')).toBe('TMTMT')
  })

  it('leaves a broken piece as text, with the reason, rather than dropping it', () => {
    const [piece] = splitInlineMath('$(x$')
    expect(piece.text).toBe('$(x$')
    expect(piece.error).toBeTruthy()
  })

  it('leaves a lone dollar sign alone', () => {
    expect(splitInlineMath('It costs 5 $ each')).toEqual([{ text: 'It costs 5 $ each' }])
  })
})
