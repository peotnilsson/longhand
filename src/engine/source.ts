/**
 * Line-level text handling, shared by the evaluator and the solver so they
 * always read a line the same way.
 */

/**
 * Split a trailing note off a line of maths:
 *
 *   b = 300 mm    // from drawing A-102, rev C
 *
 * A calculation carries its reasons — which drawing, which clause, which load
 * case — and they belong on the line they explain rather than above it. `//`
 * cannot appear in a valid expression, so the only thing to be careful of is a
 * `//` inside a quoted string, which a lookup label can have.
 */
export function splitNote(line: string): { body: string; note?: string } {
  let quote: string | null = null

  for (let index = 0; index < line.length - 1; index += 1) {
    const character = line[index]

    if (quote) {
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '/' && line[index + 1] === '/') {
      return {
        body: line.slice(0, index).trim(),
        note: line.slice(index + 2).trim() || undefined,
      }
    }
  }

  return { body: line.trim() }
}

/**
 * Split a reviewer's query off a line:
 *
 *   sigma = M_Ed/W    ?? is this the right load case?
 *
 * Checking is most of what happens to a calculation after it is written, and
 * today it happens in pencil in the margin. A query lives in the text like a
 * note, so it survives editing and travels with the sheet, and it prints in
 * the margin where a pencil note would have gone — but it is kept apart from
 * `//`, because "here is why" and "I am not sure about this" are different
 * things and a checker wants to find only the second.
 */
export function splitQuery(line: string): { body: string; query?: string } {
  let quote: string | null = null

  for (let index = 0; index < line.length - 1; index += 1) {
    const character = line[index]

    if (quote) {
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '?' && line[index + 1] === '?') {
      return {
        body: line.slice(0, index).trim(),
        query: line.slice(index + 2).trim() || undefined,
      }
    }
  }

  return { body: line.trim() }
}

/**
 * ------------------------------------------------------------ typography
 *
 * What a person actually pastes.
 *
 * A calculation is usually copied out of something: a PDF of a lecture, a
 * Word document, a table in a browser, a message from a colleague. All of
 * those are typeset, so what arrives is not the ASCII a parser expects —
 * it is a minus sign that is not a hyphen (2 − 1), a multiplication sign
 * (2 × 3), a non-breaking space between a number and its unit, a squared
 * metre written with a superscript two, a micro sign that is not the Greek
 * letter, a degree symbol, smart quotes.
 *
 * Every one of those used to be a syntax error on a line the person could
 * see nothing wrong with, which is the worst kind of error a tool can give.
 * The characters have exactly one sensible reading each, so they are read
 * that way instead, in one place, for every line that is evaluated.
 *
 * Two things are deliberately left alone. Quoted text is a person's own
 * words and is never rewritten; and a comma between digits is not touched,
 * because 1,5 and max(1,5) cannot be told apart — that one gets an error
 * message that says what to write instead.
 */

/** Runs of digits written as superscripts: m² becomes m^2, s⁻¹ becomes s^-1. */
const SUPERSCRIPTS: Record<string, string> = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-',
}

const SUPERSCRIPT_RUN = new RegExp(`[${Object.keys(SUPERSCRIPTS).join('')}]+`, 'g')

const superscripts = (text: string): string =>
  text.replace(SUPERSCRIPT_RUN, (run) => `^${[...run].map((char) => SUPERSCRIPTS[char]).join('')}`)

/** One character in, one meaning out, for the arithmetic the engine evaluates. */
const FOR_CALCULATION: Record<string, string> = {
  // Spaces that are not the space bar: paste artefacts, every one of them.
  '\u00a0': ' ', '\u2007': ' ', '\u2008': ' ', '\u2009': ' ', '\u200a': ' ', '\u202f': ' ',
  '\u2002': ' ', '\u2003': ' ', '\u200b': '',
  // Dashes. Only the hyphen-minus subtracts.
  '−': '-', '–': '-', '—': '-', '\u2010': '-', '\u2011': '-',
  // Products and quotients.
  '×': '*', '⋅': '*', '·': '*', '∙': '*', '∗': '*',
  '÷': '/', '∕': '/', '⁄': '/',
  // Comparisons, which is what a check is made of.
  '≤': '<=', '≥': '>=', '≠': '!=', '≪': '<', '≫': '>',
  // A tolerance.
  '±': '+-',
  // Quotes, as a word processor writes them.
  '“': '"', '”': '"', '„': '"', '‘': "'", '’': "'", '′': "'",
  // The micro sign is not the Greek letter, and neither is what mathjs wants.
  'µ': 'u', 'μ': 'u',
}

const CALCULATION_PATTERN = new RegExp(`[${Object.keys(FOR_CALCULATION).join('')}]`, 'g')

/**
 * Apply a rewrite to everything on a line except quoted text, which is a
 * person's own words — a label, a note in a table — and stays as typed.
 */
function outsideQuotes(line: string, rewrite: (part: string) => string): string {
  let out = ''
  let plain = ''
  let quote: string | null = null
  for (const character of line) {
    if (quote) {
      out += character
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      out += rewrite(plain) + character
      plain = ''
      quote = character
      continue
    }
    plain += character
  }
  return out + rewrite(plain)
}

/**
 * Where the maths on a line stops and a person's words begin: a `//` note or a
 * `??` query is prose and is never rewritten, the same as quoted text.
 */
function wordsStart(line: string): number {
  let quote: string | null = null
  for (let at = 0; at < line.length - 1; at += 1) {
    const character = line[at]
    if (quote) {
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    const pair = line.slice(at, at + 2)
    if (pair === '//' || pair === '??') return at
  }
  return line.length
}

/** A line of arithmetic as the engine wants to read it. */
export function normaliseForCalculation(line: string): string {
  if (!/[^\u0000-\u007f]/.test(line) && !line.includes('**')) return line
  const words = wordsStart(line)
  if (words < line.length) return normaliseForCalculation(line.slice(0, words)) + line.slice(words)
  return outsideQuotes(line, (part) => {
    let out = part.replace(CALCULATION_PATTERN, (char) => FOR_CALCULATION[char])
    out = superscripts(out)
    // A degree, with the unit it belongs to: 20 °C, or 45° of angle.
    out = out.replace(/°\s*([CF])\b/g, ' deg$1').replace(/°/g, ' deg')
    // 2**3, as a spreadsheet and half the world's programming languages write it.
    out = out.replace(/\*\*/g, '^')
    return out
  })
}

/**
 * Why a line that looks right will not parse: the two cases where the
 * character means something else here and guessing would be worse than
 * asking. Both are things a Swedish keyboard and a Swedish textbook produce.
 */
export function typographyHint(line: string): string | null {
  const body = splitNote(line).body
  const decimal = body.match(/\d,\d/)
  if (decimal) {
    return `Numbers take a point, not a comma: write ${decimal[0].replace(',', '.')} rather than ${decimal[0]}. ` +
      'A comma separates arguments here, so 1,5 would be two of them.'
  }
  const grouped = body.match(/\d[   ]\d{3}\b/)
  if (grouped) {
    return `Write a long number without spaces in it — ${grouped[0].replace(/[   ]/, '')}, not ${grouped[0]} — or as 1e6.`
  }
  return null
}

/**
 * The same characters, read for the page rather than for arithmetic.
 *
 * Presentation maths has its own vocabulary — `<=`, `->`, `in`, `oo` — and a
 * pasted ≤, → or ∞ means exactly one of those words. Rewriting them here is
 * what lets a person paste a line out of a lecture handout and have it set
 * properly instead of arriving as a character KaTeX refuses.
 *
 * Greek letters become their names, so σ is set as a mathematical σ rather
 * than as whatever the reader's font does with the character.
 */
const GREEK_LETTERS = 'αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΥΦΨΩ'
const GREEK_NAMES = [
  'alpha', 'beta', 'gamma', 'delta', 'varepsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa',
  'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'varphi', 'chi', 'psi',
  'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
]

const FOR_TYPESETTING: Record<string, string> = {
  '\u00a0': ' ', '\u2007': ' ', '\u2009': ' ', '\u202f': ' ', '\u200b': '',
  '−': '-', '–': '-', '—': '-', '\u2010': '-', '\u2011': '-',
  '×': ' * ', '⋅': ' * ', '·': ' * ', '∙': ' * ',
  '÷': '/', '∕': '/', '⁄': '/',
  '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~=', '≡': ' equiv ',
  '±': '+-',
  '∞': ' oo ',
  '→': '->', '←': '<-', '↦': '|->', '⇒': '=>', '⇐': '<==', '⇔': '<=>',
  '∈': ' in ', '∉': ' notin ', '⊂': ' sub ', '⊆': ' subeq ',
  '∪': ' cup ', '∩': ' cap ', '∖': ' setminus ', '∅': ' emptyset ',
  '∀': ' forall ', '∃': ' exists ',
  '…': '...', '⋯': '...',
  '“': '"', '”': '"', '‘': "'", '’': "'", '′': "'", '″': "''",
  'µ': 'mu ', 'μ': 'mu ',
}

for (let at = 0; at < GREEK_LETTERS.length; at += 1) {
  FOR_TYPESETTING[GREEK_LETTERS[at]] = ` ${GREEK_NAMES[at]} `
}

const TYPESETTING_PATTERN = new RegExp(
  `(${Object.keys(FOR_TYPESETTING).map((char) => char.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')).join('|')})`,
  'g',
)

/** A line of presentation maths in the vocabulary the typesetter reads. */
export function normaliseForTypesetting(line: string): string {
  if (!/[^\u0000-\u007f]/.test(line)) return line
  return outsideQuotes(line, (part) => {
    let out = part.replace(TYPESETTING_PATTERN, (char) => FOR_TYPESETTING[char])
    out = superscripts(out)
    // A root sign takes what follows it: √2, √x, √(a + b).
    out = out.replace(/√\s*(\([^)]*\)|[A-Za-z0-9_.]+)/g, (_all, inside: string) =>
      inside.startsWith('(') ? `sqrt${inside}` : `sqrt(${inside})`)
    // A degree is a superscript ring, and °C is a unit.
    out = out.replace(/°\s*([CF])\b/g, '^circ $1').replace(/°/g, '^circ ')
    return out.replace(/ {2,}/g, ' ')
  })
}
