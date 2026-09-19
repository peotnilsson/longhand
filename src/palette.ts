import { REFERENCE, type Entry, type Section } from './reference'

/**
 * Every construct in the language, insertable from the editor by typing `/`.
 *
 * Fifteen constructs were added to the language in a fortnight and the only
 * place any of them appeared was the reference page, which you have to leave
 * the sheet to read. Autocomplete did not help either: it completes a name you
 * have already started typing, and the whole problem is not knowing that
 * `iterate` or `interp2` exist to be typed.
 *
 * So the list is built from `REFERENCE` rather than written out again here.
 * The label and the description come from the documentation, and a test
 * insists that every documented construct has a snippet — add one to the
 * language and the build fails until the palette can insert it.
 *
 * The snippet syntax is CodeMirror's: `${placeholder}` is a field you tab
 * through, and two fields with the same name are edited together.
 */
export interface Snippet {
  /** The reference entry this came from, which is also its docs anchor. */
  id: string
  /** What the list shows, e.g. "check". */
  label: string
  /** The section it belongs to, shown beside the label. */
  section: string
  /** One line, straight from the reference. */
  summary: string
  /** CodeMirror snippet source, with tab-through fields. */
  template: string
  /** What the documentation says this is also called, so searching finds it. */
  keywords: string[]
  /** Lines the test needs above this one for it to mean anything. */
  preamble?: string
}

/** Sections that describe the language. "When a line will not compute" does not. */
const LANGUAGE_SECTIONS = ['writing', 'tables', 'harder']

/**
 * The lines most snippets assume above them.
 *
 * `sigma` is computed rather than given, because a snippet inserted under a
 * constant would pass a test that the same insert fails in a real sheet:
 * `solve sigma = f_ck for b` has nothing to solve if sigma does not depend
 * on b.
 */
const COMMON = `b = 300 mm
h = 500 mm
M = 250 kN*m
M_Ed = 250 kN*m
f_ck = 30 MPa
f_yd = 235 MPa
b_calc = 287.4 mm
W = b*h^2/6
sigma = M_Ed/W
`

const TABLE = `table steel
  profile | h      | A         | mass
  IPE200  | 200 mm | 2850 mm^2 | 22.4 kg/m
  IPE300  | 300 mm | 5380 mm^2 | 42.2 kg/m
  IPE400  | 400 mm | 8450 mm^2 | 66.3 kg/m
end
ok = steel.A > 3000 mm^2
`

/**
 * The snippet for each documented construct, keyed by its reference id.
 *
 * Deliberately a separate table rather than a field on `Entry`: the reference
 * shows the shortest line that explains the idea, and a snippet wants every
 * field an engineer would fill in. `b = 300 mm` reads better in the docs than
 * `${b} = ${300} ${mm}` would.
 */
const SNIPPETS: Record<string, { template: string; preamble?: string }> = {
  value: { template: '${b} = ${300 mm}' },
  formula: { template: '${W} = ${b*h^2/6}', preamble: COMMON },
  'display-unit': { template: '${sigma} = ${M/W}  -> ${MPa}', preamble: COMMON },
  rounding: { template: '${b} = ${b_calc}  -> ceil ${10 mm}', preamble: COMMON },
  'significant-figures': { template: '${M} = ${M_Ed}  -> ${3 sf}', preamble: COMMON },
  range: { template: '${i} = ${1..10}' },
  query: { template: '${sigma} = ${M_Ed/W}  ?? ${is this the right load case}', preamble: COMMON },
  'equation-number': { template: '// ${see} @${W}', preamble: COMMON },
  'page-break': { template: 'page break' },
  figure: { template: 'figure ${section_AA} "${Cross-section at A-A}"' },
  tolerance: { template: '${b} = ${300 mm} +- ${2 mm}' },
  correlate: { template: 'correlate ${b} and ${h} by ${0.8}', preamble: COMMON },
  check: { template: '${sigma} <= ${f_yd}', preamble: COMMON },
  function: { template: '${A_circle}(${d}) = ${pi*d^2/4}' },
  solve: { template: '${b_req} = solve ${sigma} = ${f_ck} for ${b}', preamble: COMMON },
  heading: { template: '# ${Heading}' },
  prose: { template: '// ${a note for whoever checks this}' },

  table: {
    template: 'table\n  ${case} | ${bw}     | ${hw}\n  ${A}    | ${300 mm} | ${500 mm}\nend',
  },
  'named-table': {
    template:
      'table ${steel}\n  ${profile} | ${h}      | ${A}\n  ${IPE300}  | ${300 mm} | ${5380 mm^2}\nend',
  },
  interp: { template: '${A_250} = interp(${250 mm}, ${steel.h}, ${steel.A})', preamble: TABLE },
  lookup: {
    template: '${A_300} = lookup("${IPE300}", ${steel.profile}, ${steel.A})',
    preamble: TABLE,
  },
  aggregate: { template: '${A_tot} = sum(${steel.A})', preamble: TABLE },
  plot: { template: 'plot ${sigma} vs ${b} from ${200 mm} to ${400 mm}', preamble: COMMON },
  import: { template: 'import "${Loads}"' },

  iterate: {
    template: '${f} = iterate ${step}(${f}) from ${0.02}',
    preamble: 'step(x) = 0.02 + x/4\n',
  },
  'solve-two': {
    template: '${b}, ${h} = solve ${b*h} = ${20000 mm^2} and ${h/b} = ${2.0} for ${b}, ${h}',
    preamble: COMMON,
  },
  choose: {
    template: '${choice} = pick(${steel.profile}, ${steel.mass}, ${ok})',
    preamble: TABLE,
  },
  statistics: {
    template: '${k} = slope(${run.x}, ${run.y})',
    preamble: 'table run\n  x | y\n  1 | 2.1\n  2 | 3.9\n  3 | 6.2\nend\n',
  },
  interp2: {
    template: '${v} = interp2(${1.5}, ${15.0}, ${t.x}, ${t.y}, ${t.z})',
    preamble: 'table t\n  x | y  | z\n  1 | 10 | 4\n  1 | 20 | 6\n  2 | 10 | 8\n  2 | 20 | 12\nend\n',
  },
  calculus: {
    template: '${W_tot} = integral(${w}, ${0 m}, ${6 m})',
    preamble: 'w(x) = 10 kN/m + x*2 kN/m^2\n',
  },
  kinds: { template: '${A_circle}(${d}: length) = ${pi*d^2/4}' },
}

const entriesOf = (section: Section): Entry[] => section.entries ?? []

/**
 * A short label, taken from the summary rather than from the code.
 *
 * The code line is what you write, not what you are looking for: somebody
 * hunting for a check does not think "sigma <= f_ck", they think "check".
 */
const LABELS: Record<string, string> = {
  value: 'value',
  formula: 'formula',
  'display-unit': 'show in a unit',
  rounding: 'round to a stock size',
  'significant-figures': 'significant figures',
  range: 'range',
  query: 'query for the checker',
  'equation-number': 'refer to an equation',
  'page-break': 'page break',
  figure: 'figure',
  tolerance: 'value with a tolerance',
  correlate: 'correlate two measurements',
  check: 'check',
  function: 'function',
  solve: 'solve for a value',
  heading: 'heading',
  prose: 'note',
  table: 'table',
  'named-table': 'named table',
  interp: 'interpolate',
  lookup: 'look up a row',
  aggregate: 'sum a column',
  plot: 'plot',
  import: 'import another sheet',
  iterate: 'iterate',
  'solve-two': 'solve two unknowns',
  choose: 'pick the best row',
  statistics: 'statistics',
  interp2: 'interpolate in two directions',
  calculus: 'integral',
  kinds: 'function with kinds',
}

export const PALETTE: Snippet[] = REFERENCE.filter((section) =>
  LANGUAGE_SECTIONS.includes(section.id),
).flatMap((section) =>
  entriesOf(section)
    .filter((entry) => entry.id in SNIPPETS)
    .map((entry) => ({
      id: entry.id,
      label: LABELS[entry.id] ?? entry.id.replace(/-/g, ' '),
      section: section.title,
      summary: entry.summary,
      template: SNIPPETS[entry.id].template,
      keywords: entry.keywords ?? [],
      preamble: SNIPPETS[entry.id].preamble,
    })),
)

/** Every construct the reference documents, so the test can insist on coverage. */
export const DOCUMENTED_CONSTRUCTS = REFERENCE.filter((section) =>
  LANGUAGE_SECTIONS.includes(section.id),
).flatMap((section) => entriesOf(section).map((entry) => entry.id))

/**
 * A snippet as CodeMirror would actually insert it, with every field left at
 * its default.
 *
 * This deliberately reimplements CodeMirror's own field syntax rather than
 * stripping the braces, because the two are not the same and the difference
 * is a bug we shipped for about an hour: `${300}` is not a field holding
 * "300", it is field *number* 300 with no content, so a snippet written that
 * way inserts `b =  mm` and the sheet below it says `b = mm`. Modelling the
 * real rule here is what lets the tests catch it.
 */
export function filled(template: string): string {
  return template.replace(
    /[#$]\{(?:(\d+)(?::([^}]*))?|([^}]*))\}/g,
    (_all, _sequence, withDefault, name) => withDefault ?? name ?? '',
  )
}

/** Fields that are nothing but digits, which insert nothing. Always a mistake. */
export const emptyFields = (template: string): string[] =>
  [...template.matchAll(/[#$]\{(\d+)\}/g)].map((match) => match[0])

/**
 * The palette, narrowed by what has been typed after the slash.
 *
 * Matching runs over the label, the summary, the section and the words the
 * reference lists as other names for the thing — so "/goal seek" finds solve
 * and "/vlookup" finds lookup, which is the point: you search for what you
 * called it before you knew what we call it. Every word has to match, the
 * same rule the reference search uses.
 */
export function filterPalette(query: string): Snippet[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return PALETTE
  return PALETTE.filter((item) => {
    const hay =
      `${item.label} ${item.summary} ${item.id} ${item.section} ${item.keywords.join(' ')}`.toLowerCase()
    return words.every((word) => hay.includes(word))
  })
}

/**
 * Whether a `/` at the cursor means "show me the palette".
 *
 * Given the text before the cursor on its own line: it does when nothing but
 * whitespace precedes the slash, because that is where a new line could
 * begin. A slash in the middle of a formula is division, and a second slash
 * starts a comment — neither is a request for a menu.
 *
 * Returned is where the slash sits and what has been typed after it, which is
 * what the editor needs to know what to replace.
 */
export function paletteAt(before: string): { from: number; query: string } | null {
  const match = /^(\s*)\/([A-Za-z ]*)$/.exec(before)
  if (!match) return null
  return { from: match[1].length, query: match[2] }
}
