/**
 * Mathematics written to be read, not computed.
 *
 * Everything else in Longhand renders what it has just worked out. A written
 * solution needs the other thing as well: the equation you are about to
 * solve, the system with its big brace, the chain of ⇔ that gets you from the
 * characteristic polynomial to its roots, the limit you are claiming. None of
 * that is an assignment, and forcing it through the calculator either fails
 * (`y'' - y' - 2y = x` is not something to evaluate) or says something false.
 *
 * So this is a small translator from the way people type maths in a plain
 * text box into TeX, in the spirit of AsciiMath: `x^2`, `a/b`, `sqrt(x)`,
 * `lim(x -> 0, sin(x)/x)`, `int(f(x), x, 0, 1)`, `<=>`, `{ a ; b }` for a
 * system. It never evaluates anything and knows nothing about units: a line
 * written with `math` is a statement on the page, and the only thing that can
 * go wrong with it is that it does not parse.
 *
 * Deliberately its own small parser rather than mathjs: mathjs rightly
 * refuses `y''`, `=>`, `]0, 1[` and a chain of equals signs, which are exactly
 * the things a written solution is made of.
 */

import { normaliseForTypesetting } from './source'

export class MathSyntaxError extends Error {}

// ---------------------------------------------------------------- tokens

type Token =
  | { t: 'num'; v: string }
  | { t: 'id'; v: string }
  | { t: 'str'; v: string }
  | { t: 'op'; v: string }
  | { t: 'raw'; v: string }

/** Longest first, so `<=>` is never read as `<=` followed by `>`. */
const OPERATORS = [
  '<==>', '<=>', '==>', '<==', '|->', '...', '!=', '<=', '>=', '=>', '->', '<-', '~=', '+-', '-+', ':=',
  '(', ')', '[', ']', '{', '}', '|', ',', ';', ':', '+', '-', '*', '/', '^', '_', '=', '<', '>', "'", '!', '&',
]

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let at = 0
  while (at < source.length) {
    const rest = source.slice(at)
    const space = rest.match(/^\s+/)
    if (space) {
      at += space[0].length
      continue
    }
    const number = rest.match(/^\d+(?:\.\d+)?/)
    if (number) {
      tokens.push({ t: 'num', v: number[0] })
      at += number[0].length
      continue
    }
    const word = rest.match(/^[A-Za-zÅÄÖåäö][A-Za-zÅÄÖåäö0-9]*/)
    if (word) {
      tokens.push({ t: 'id', v: word[0] })
      at += word[0].length
      continue
    }
    if (rest[0] === '"') {
      const close = rest.indexOf('"', 1)
      if (close < 0) throw new MathSyntaxError('A quoted piece of text is never closed — add the second ".')
      tokens.push({ t: 'str', v: rest.slice(1, close) })
      at += close + 1
      continue
    }
    const operator = OPERATORS.find((candidate) => rest.startsWith(candidate))
    if (operator) {
      tokens.push({ t: 'op', v: operator })
      at += operator.length
      continue
    }
    // Anything else — ∞, ≤, π typed directly — goes through untouched, and
    // KaTeX knows what to do with most of it.
    tokens.push({ t: 'raw', v: rest[0] })
    at += 1
  }
  return tokens
}

// ---------------------------------------------------------------- vocabulary

const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi',
  'varphi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma',
  'Upsilon', 'Phi', 'Psi', 'Omega',
])

/** Set upright, the way they are printed: sin x, not s·i·n·x. */
const NAMED = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'coth', 'ln', 'log', 'lg', 'exp', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'dim', 'arg',
])

/** Names KaTeX has its own command for; the rest go through \operatorname. */
const TEX_NATIVE = new Set([
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
  'coth', 'ln', 'log', 'lg', 'exp', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'dim', 'arg',
])

const CONSTANTS: Record<string, string> = {
  oo: '\\infty',
  infty: '\\infty',
  RR: '\\mathbb{R}',
  NN: '\\mathbb{N}',
  ZZ: '\\mathbb{Z}',
  QQ: '\\mathbb{Q}',
  CC: '\\mathbb{C}',
  emptyset: '\\emptyset',
  dots: '\\dots',
  infinity: '\\infty',
  forall: '\\forall',
  exists: '\\exists',
  circ: '\\circ',
  partial: '\\partial',
  nabla: '\\nabla',
}

/** Written between the halves of a statement: "x = 2 or x = -1". */
const WORDS: Record<string, string> = {
  and: 'and', or: 'or', if: 'if', for: 'for', where: 'where', then: 'then', else: 'otherwise',
  och: 'och', eller: 'eller', om: 'om', för: 'för', där: 'där', då: 'då', så: 'så', annars: 'annars',
  alla: 'alla',
}

const RELATIONS: Record<string, string> = {
  '=': '=',
  '!=': '\\neq',
  '<': '<',
  '>': '>',
  '<=': '\\leq',
  '>=': '\\geq',
  '~=': '\\approx',
  ':=': '\\coloneqq',
  '<=>': '\\iff',
  '<==>': '\\iff',
  '=>': '\\implies',
  '==>': '\\implies',
  '<==': '\\impliedby',
  '->': '\\to',
  '<-': '\\leftarrow',
  '|->': '\\mapsto',
  in: '\\in',
  notin: '\\notin',
  sub: '\\subset',
  subeq: '\\subseteq',
  sube: '\\subseteq',
  cup: '\\cup',
  union: '\\cup',
  cap: '\\cap',
  inter: '\\cap',
  supset: '\\supset',
  propto: '\\propto',
  setminus: '\\setminus',
  approx: '\\approx',
  sim: '\\sim',
  equiv: '\\equiv',
}

/** Wide relations get room around them, the way a typeset derivation does. */
const WIDE = new Set(['\\iff', '\\implies', '\\impliedby'])

const isRelation = (token: Token | undefined): boolean =>
  !!token &&
  ((token.t === 'op' && token.v in RELATIONS) || (token.t === 'id' && token.v in RELATIONS))

// ---------------------------------------------------------------- nodes

/** A translated piece, and — if it was a bracketed group — what was inside. */
interface Piece {
  tex: string
  inner?: string
  /** True for a bare number, so two numbers side by side get a · between them. */
  number?: boolean
}

/** Contents that are tall enough to need \left( … \right). */
const tall = (tex: string): boolean => /\\frac|\\sum|\\int|\\prod|\\lim|\\sqrt|\\begin|\\binom/.test(tex)

const paren = (open: string, inner: string, close: string): string =>
  tall(inner) ? `\\left${open}${inner}\\right${close}` : `${open}${inner}${close}`

/** What goes inside a ^{…} or a \frac{…}{…}: the group without its brackets. */
const bare = (piece: Piece): string => piece.inner ?? piece.tex

// ---------------------------------------------------------------- parser

class Parser {
  private tokens: Token[]
  private at = 0
  /** Inside |…| a bar closes the absolute value instead of opening another. */
  private bars = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek(offset = 0): Token | undefined {
    return this.tokens[this.at + offset]
  }

  private next(): Token {
    const token = this.tokens[this.at]
    if (!token) throw new MathSyntaxError('The line ends in the middle of an expression.')
    this.at += 1
    return token
  }

  private isOp(value: string, offset = 0): boolean {
    const token = this.peek(offset)
    return token?.t === 'op' && token.v === value
  }

  private expect(value: string, what: string): void {
    if (!this.isOp(value)) {
      const found = this.peek()
      throw new MathSyntaxError(
        `Expected ${value} to close ${what}${found ? `, found ${found.v}` : ' before the end of the line'}.`,
      )
    }
    this.at += 1
  }

  done(): boolean {
    return this.at >= this.tokens.length
  }

  /**
   * A statement: expressions joined by relations and words, and separated by
   * commas — "y(0) = 2, y'(0) = 0", "r = 2 or r = -1", "x -> 0".
   *
   * `stop` names the tokens that end it without being consumed, which is how
   * a function's arguments and a system's rows find their own ends.
   */
  statement(stop: string[] = []): string {
    return this.statementParts(stop).parts.join(' ')
  }

  /** The same, keeping track of where the first relation came, for aligning on it. */
  statementParts(stop: string[] = []): { parts: string[]; firstRelation: number } {
    const parts: string[] = []
    let firstRelation = -1
    const stops = (token: Token | undefined) =>
      !token || (token.t === 'op' && stop.includes(token.v)) || (this.bars > 0 && token.t === 'op' && token.v === '|')

    while (!stops(this.peek())) {
      const token = this.peek()!
      if (isRelation(token)) {
        this.at += 1
        if (firstRelation < 0) firstRelation = parts.length
        const tex = RELATIONS[token.v]
        parts.push(WIDE.has(tex) ? `\\quad ${tex} \\quad` : ` ${tex} `)
        continue
      }
      if (token.t === 'id' && token.v in WORDS) {
        this.at += 1
        parts.push(`\\quad\\text{${WORDS[token.v]}}\\quad `)
        continue
      }
      if (token.t === 'op' && token.v === ',') {
        this.at += 1
        parts.push(',\\ ')
        continue
      }
      if (token.t === 'op' && token.v === ':') {
        this.at += 1
        parts.push(' : ')
        continue
      }
      parts.push(this.expression())
    }
    return { parts, firstRelation }
  }

  /** Parts are joined with a space: TeX ignores it, and it keeps \quad off the next letter. */

  /** Sums and differences. */
  expression(): string {
    let tex = this.term().tex
    const closes = (offset: number) => {
      const token = this.peek(offset)
      return !token || (token.t === 'op' && [',', ')', ']', '[', ';', '}'].includes(token.v))
    }
    for (;;) {
      // A sign with nothing after it: the side of a one-sided limit, x -> 0+.
      if ((this.isOp('+') || this.isOp('-')) && closes(1)) {
        tex += ` ${this.next().v}`
        return tex
      }
      if (this.isOp('+')) {
        this.at += 1
        tex += ' + ' + this.term().tex
      } else if (this.isOp('-')) {
        this.at += 1
        tex += ' - ' + this.term().tex
      } else if (this.isOp('+-')) {
        this.at += 1
        tex += ' \\pm ' + this.term().tex
      } else if (this.isOp('-+')) {
        this.at += 1
        tex += ' \\mp ' + this.term().tex
      } else {
        return tex
      }
    }
  }

  /**
   * Products and quotients, written or implied.
   *
   * `2x/3` is two-x over three and `1/2 x` is a half times x: implied
   * multiplication binds exactly as tightly as a written one and both read
   * left to right, which is how the line is read aloud.
   */
  term(): Piece {
    // A leading minus belongs to the whole product: -1/2 is minus a half, as
    // printed, not a fraction with -1 on top.
    if (this.isOp('-')) {
      this.at += 1
      return { tex: `-${this.term().tex}` }
    }
    let left = this.unary()
    for (;;) {
      if (this.isOp('*')) {
        this.at += 1
        left = { tex: `${left.tex} \\cdot ${this.unary().tex}` }
      } else if (this.isOp('/')) {
        this.at += 1
        const right = this.unary()
        left = { tex: `\\frac{${bare(left)}}{${bare(right)}}` }
      } else if (this.startsFactor()) {
        const right = this.unary()
        const joint = left.number && right.number ? ' \\cdot ' : ' '
        left = { tex: `${left.tex}${joint}${right.tex}` }
      } else {
        return left
      }
    }
  }

  /** Whether the next token can begin a factor multiplied by juxtaposition. */
  private startsFactor(): boolean {
    const token = this.peek()
    if (!token) return false
    if (token.t === 'num' || token.t === 'str' || token.t === 'raw') return true
    if (token.t === 'id') return !(token.v in WORDS) && !(token.v in RELATIONS)
    if (token.t === 'op') {
      // Not '[': in ]0, 1[ that bracket closes the interval, and nobody writes
      // a product as x[…] in a written solution.
      if (token.v === '(' || token.v === '{') return true
      if (token.v === '|') return this.bars === 0
    }
    return false
  }

  private unary(): Piece {
    if (this.isOp('-')) {
      this.at += 1
      return { tex: `-${this.unary().tex}` }
    }
    if (this.isOp('+-')) {
      this.at += 1
      return { tex: `\\pm ${this.unary().tex}` }
    }
    return this.power()
  }

  /** Powers are right-associative and bind tighter than a sign: -x^2 is -(x²). */
  private power(): Piece {
    const base = this.postfix(this.primary())
    if (this.isOp('^')) {
      this.at += 1
      const exponent = this.isOp('-') ? this.unary() : this.power()
      return { tex: `{${base.tex}}^{${bare(exponent)}}` }
    }
    return base
  }

  /** Primes, subscripts, factorials and a call's argument list, in that order. */
  private postfix(piece: Piece): Piece {
    let result = piece
    for (;;) {
      if (this.isOp("'")) {
        let primes = ''
        while (this.isOp("'")) {
          this.at += 1
          primes += "'"
        }
        result = { tex: `${result.tex}${primes}` }
      } else if (this.isOp('_')) {
        this.at += 1
        result = { tex: `${result.tex}_{${this.subscript()}}` }
      } else if (this.isOp('!')) {
        this.at += 1
        result = { tex: `${result.tex}!` }
      } else if (this.isOp('(') && !result.number && result.inner === undefined) {
        // f(x), y'(0), y_p(x): a name followed directly by brackets is a call.
        this.at += 1
        const args = this.list(')', 'the argument list')
        result = { tex: `${result.tex}${paren('(', args.join(', '), ')')}` }
      } else {
        return result
      }
    }
  }

  /** a_n, a_(n+1), M_Ed — a word as a subscript is set upright, as a label. */
  private subscript(): string {
    const token = this.peek()
    if (token?.t === 'id' && token.v.length > 1 && !GREEK.has(token.v) && !(token.v in CONSTANTS)) {
      this.at += 1
      return `\\mathrm{${token.v}}`
    }
    const piece = this.primary()
    return bare(piece)
  }

  /** Comma-separated statements up to a closing bracket. */
  private list(close: string, what: string): string[] {
    const items: string[] = []
    if (this.isOp(close)) {
      this.at += 1
      return items
    }
    for (;;) {
      items.push(this.statement([',', close]))
      if (this.isOp(',')) {
        this.at += 1
        continue
      }
      this.expect(close, what)
      return items
    }
  }

  private primary(): Piece {
    const token = this.next()

    if (token.t === 'num') return { tex: token.v, number: true }
    if (token.t === 'str') return { tex: `\\text{${token.v}}` }
    if (token.t === 'raw') return { tex: token.v === '∞' ? '\\infty' : token.v }

    if (token.t === 'op') {
      switch (token.v) {
        case '(':
          return this.bracketed('(')
        case '[':
          return this.bracketed('[')
        case ']':
          // ]0, 1[ — the open interval as it is written in Sweden and France.
          return this.bracketed(']')
        case '{':
          return this.braced()
        case '|': {
          this.bars += 1
          const inner = this.statement(['|'])
          this.bars -= 1
          this.expect('|', 'the absolute value')
          return { tex: `\\left|${inner}\\right|` }
        }
        case '...':
          return { tex: '\\dots' }
        case '-':
          return { tex: `-${this.power().tex}` }
        case ')':
        case ']':
        case '}':
          throw new MathSyntaxError(`There is a ${token.v} with nothing open before it — something is left over.`)
        default:
          throw new MathSyntaxError(`Did not expect ${token.v} here.`)
      }
    }

    return this.word(token.v)
  }

  /** ( … ), [ … ], ] … [ — a group, or an interval when there is a comma in it. */
  private bracketed(open: string): Piece {
    const items: string[] = []
    for (;;) {
      items.push(this.statement([',', ')', ']', '[']))
      if (this.isOp(',')) {
        this.at += 1
        continue
      }
      break
    }
    const close = this.peek()
    if (!close || close.t !== 'op' || ![')', ']', '['].includes(close.v)) {
      throw new MathSyntaxError(`A ${open} is never closed.`)
    }
    this.at += 1
    const inner = items.join(', ')
    // A plain group keeps its brackets but hands its inside to ^ and / so
    // that e^(2x) is e^{2x} and (a+b)/(c+d) is a fraction without them.
    if (items.length === 1 && open === '(' && close.v === ')') {
      return { tex: paren('(', inner, ')'), inner }
    }
    const left = open === '(' ? '(' : open === '[' ? '[' : ']'
    const right = close.v === ')' ? ')' : close.v === ']' ? ']' : '['
    return { tex: `\\left${left}${inner}\\right${right}` }
  }

  /**
   * { … }: a system or a piecewise definition when it holds a ";", otherwise
   * a set — `{ x in RR : x > 0 }`.
   */
  private braced(): Piece {
    const rows: string[] = []
    for (;;) {
      rows.push(this.caseRow())
      if (this.isOp(';')) {
        this.at += 1
        continue
      }
      break
    }
    this.expect('}', 'the { … }')
    if (rows.length === 1) return { tex: `\\left\\{${rows[0].replace(' & ', ' ')}\\right\\}` }
    return { tex: `\\begin{cases} ${rows.join(' \\\\ ')} \\end{cases}` }
  }

  /** One row of a system; "x^2 if x < 0" puts the condition in its own column. */
  private caseRow(): string {
    const value = this.statement([';', '}'])
    const split = value.match(/^(.*?)\\quad\\text\{(if|om|för|for|då|när)\}\\quad (.*)$/)
    return split ? `${split[1]} & \\text{${split[2]} } ${split[3]}` : value
  }

  /** A name: a constant, a Greek letter, a named function, or a special form. */
  private word(name: string): Piece {
    if (name in CONSTANTS && !(name === 'inf' && this.isOp('('))) return { tex: CONSTANTS[name] }
    if (name === 'inf' && !this.isOp('(')) return { tex: '\\infty' }
    if (GREEK.has(name)) return { tex: `\\${name}` }

    if (this.isOp('(')) {
      const special = this.special(name)
      if (special) return special
    }

    if (NAMED.has(name)) return this.named(name)

    // Anything else is letters in maths italic — xy is x times y on paper
    // too, and a name like "total" reads as one word in italics.
    return { tex: name }
  }

  /** sin x, sin(x), sin^2(x), log_2(x). */
  private named(name: string): Piece {
    let tex = TEX_NATIVE.has(name) ? `\\${name}` : `\\operatorname{${name}}`
    if (this.isOp('_')) {
      this.at += 1
      tex += `_{${this.subscript()}}`
    }
    if (this.isOp('^')) {
      this.at += 1
      tex += `^{${bare(this.power())}}`
    }
    if (this.isOp('(')) {
      this.at += 1
      const args = this.list(')', `the argument of ${name}`)
      return { tex: `${tex}${paren('(', args.join(', '), ')')}` }
    }
    // sin x: the argument is the next factor, as it is written.
    if (this.startsFactor()) return { tex: `${tex} ${this.power().tex}` }
    return { tex }
  }

  /** The forms that are not a name followed by its arguments in brackets. */
  private special(name: string): Piece | null {
    const args = () => {
      this.at += 1
      return this.list(')', `${name}(…)`)
    }
    const need = (list: string[], counts: number[], usage: string) => {
      if (!counts.includes(list.length)) {
        throw new MathSyntaxError(`${name} takes ${usage}.`)
      }
      return list
    }

    switch (name) {
      case 'sqrt': {
        const [x] = need(args(), [1], 'one argument: sqrt(x)')
        return { tex: `\\sqrt{${x}}` }
      }
      case 'root': {
        const [n, x] = need(args(), [2], 'two: root(n, x) for the n-th root of x')
        return { tex: `\\sqrt[${n}]{${x}}` }
      }
      case 'abs': {
        const [x] = need(args(), [1], 'one argument: abs(x)')
        return { tex: `\\left|${x}\\right|` }
      }
      case 'frac': {
        const [a, b] = need(args(), [2], 'two: frac(a, b)')
        return { tex: `\\frac{${a}}{${b}}` }
      }
      case 'binom': {
        const [n, k] = need(args(), [2], 'two: binom(n, k)')
        return { tex: `\\binom{${n}}{${k}}` }
      }
      case 'floor': {
        const [x] = need(args(), [1], 'one argument: floor(x)')
        return { tex: `\\left\\lfloor ${x} \\right\\rfloor` }
      }
      case 'ceil': {
        const [x] = need(args(), [1], 'one argument: ceil(x)')
        return { tex: `\\left\\lceil ${x} \\right\\rceil` }
      }
      case 'bar':
      case 'hat':
      case 'vec':
      case 'dot':
      case 'ddot':
      case 'tilde': {
        const [x] = need(args(), [1], `one argument: ${name}(x)`)
        return { tex: `\\${name === 'bar' ? 'overline' : name}{${x}}` }
      }
      case 'text': {
        // text(...) keeps everything inside as words, spaces and all.
        this.at += 1
        const words: string[] = []
        let depth = 1
        while (depth > 0) {
          const token = this.next()
          if (token.t === 'op' && token.v === '(') depth += 1
          if (token.t === 'op' && token.v === ')') depth -= 1
          if (depth > 0) words.push(token.v)
        }
        return { tex: `\\text{${words.join(' ')}}` }
      }
      case 'lim': {
        // lim(x -> 0, sin(x)/x), and x -> 0+ for a one-sided limit.
        const [under, body] = need(args(), [2], 'two: lim(x -> a, expression)')
        const sided = under.replace(/ \+ ?$/, '^{+}').replace(/ - ?$/, '^{-}')
        return { tex: `\\lim_{${sided}} ${body}` }
      }
      case 'sum':
      case 'prod': {
        // sum(k = 1, n, a_k) and sum(k = 1, oo, 1/k^2)
        const list = args()
        if (list.length === 2) {
          return { tex: `\\${name}_{${list[0]}} ${list[1]}` }
        }
        const [from, to, body] = need(list, [3], `three: ${name}(k = 1, n, term)`)
        return { tex: `\\${name}_{${from}}^{${to}} ${body}` }
      }
      case 'int': {
        // int(f(x), x) and int(f(x), x, a, b)
        const list = args()
        if (list.length === 2) return { tex: `\\int ${list[0]} \\, d${list[1]}` }
        const [body, variable, from, to] = need(list, [4], 'two or four: int(f(x), x) or int(f(x), x, a, b)')
        return { tex: `\\int_{${from}}^{${to}} ${body} \\, d${variable}` }
      }
      case 'diff': {
        // diff(y, x) is dy/dx, diff(y, x, 2) the second derivative, and
        // diff(x) alone is the operator d/dx.
        const list = args()
        if (list.length === 1) return { tex: `\\frac{d}{d${list[0]}}` }
        const [what, variable, order] = need(list, [2, 3], 'diff(y, x) or diff(y, x, 2)')
        if (!order) return { tex: `\\frac{d${what}}{d${variable}}` }
        return { tex: `\\frac{d^{${order}}${what}}{d${variable}^{${order}}}` }
      }
      case 'eval': {
        // eval(F(x), a, b) — the bracket with limits you write after integrating.
        const [body, from, to] = need(args(), [3], 'three: eval(F(x), a, b)')
        return { tex: `\\Big[ ${body} \\Big]_{${from}}^{${to}}` }
      }
      case 'ordo': {
        const [x] = need(args(), [1], 'one argument: ordo(x^3)')
        return { tex: `\\mathcal{O}\\left(${x}\\right)` }
      }
      default:
        return null
    }
  }
}

// ---------------------------------------------------------------- entry points

/** One statement as TeX. Throws MathSyntaxError with a message a person can act on. */
export function mathToTex(source: string): string {
  const parser = new Parser(tokenize(normaliseForTypesetting(source)))
  const tex = parser.statement()
  if (!parser.done()) {
    throw new MathSyntaxError('Something is left over at the end — a bracket closed too many times?')
  }
  return tex.replace(/\s+/g, ' ').trim()
}

/**
 * An aligned derivation: one row per line, lined up on the first relation.
 * A row that starts with a relation continues the one above it:
 *
 *     r^2 - r - 2 = 0
 *       <=> (r - 2)(r + 1) = 0
 *       <=> r = 2 or r = -1
 */
export function alignToTex(rows: string[]): string {
  const lines = rows.map((row) => {
    const parser = new Parser(tokenize(normaliseForTypesetting(row)))
    const { parts, firstRelation } = parser.statementParts()
    if (!parser.done()) {
      throw new MathSyntaxError('Something is left over at the end — a bracket closed too many times?')
    }
    const tidy = (tex: string) => tex.replace(/\s+/g, ' ').trim()
    if (firstRelation < 0) return `& ${tidy(parts.join(' '))}`
    // The ⇔ that starts a continued row lines up with the = above it, so it
    // loses the room it would have in the middle of a line.
    const right = tidy(parts.slice(firstRelation).join(' ')).replace(/^\\quad /, '')
    return `${tidy(parts.slice(0, firstRelation).join(' '))} & ${right}`
  })
  return `\\begin{aligned} ${lines.join(' \\\\ ')} \\end{aligned}`
}

/**
 * Prose with $…$ in it, cut into text and maths.
 *
 * The way a written solution mixes the two — "Den karakteristiska
 * ekvationen $r^2 + 2r + 1 = 0$ har lösningen $r = -1$" — and the reason a
 * comment line needed it: a solution that can only put maths on lines of its
 * own reads like a list of equations rather than an argument.
 */
export function splitInlineMath(text: string): { text?: string; tex?: string; error?: string }[] {
  const pieces: { text?: string; tex?: string; error?: string }[] = []
  const pattern = /\$([^$]+)\$/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    if (match.index! > last) pieces.push({ text: text.slice(last, match.index) })
    try {
      pieces.push({ tex: mathToTex(match[1]) })
    } catch (error) {
      pieces.push({ text: match[0], error: error instanceof Error ? error.message : String(error) })
    }
    last = match.index! + match[0].length
  }
  if (last < text.length) pieces.push({ text: text.slice(last) })
  return pieces
}
