/**
 * Everything the documentation says about the language, in one place.
 *
 * The docs page renders this, the app's Help button points at that page, and a
 * test runs every `example` through the engine and insists it evaluates. So
 * the reference cannot quietly drift away from what the language does — which
 * is exactly what happened when the same syntax was written out by hand in the
 * Help panel and again in the README.
 */

export interface Entry {
  /** Anchor, so a link can point straight at one command. */
  id: string
  code: string
  /** One line: what it is. */
  summary: string
  /** The paragraph you want when the one-liner is not enough. */
  detail?: string
  /** A sheet that stands on its own. Tested. */
  example?: string
  /** Extra words a search should match. */
  keywords?: string[]
}

export interface Prose {
  heading?: string
  text: string
}

export interface Section {
  id: string
  title: string
  blurb?: string
  entries?: Entry[]
  prose?: Prose[]
}

export const REFERENCE: Section[] = [
  {
    id: 'writing',
    title: 'Writing a sheet',
    blurb:
      'One line at a time, top to bottom. A line is an assignment, a check, a function, a table, a heading or a note — and a symbol means whatever the line above said it means.',
    entries: [
      {
        id: 'value',
        code: 'b = 300 mm',
        summary: 'A value with a unit.',
        detail:
          'Any unit mathjs knows works: mm, m, kN, MPa, kg, s, K, degC, l, W, and the SI prefixes on all of them. A number on its own is fine too — a factor of 1.35 has no units and does not need any.',
        example: 'b = 300 mm\nn = 1.35\n',
        keywords: ['assignment', 'variable', 'unit', 'mm', 'kN', 'MPa'],
      },
      {
        id: 'formula',
        code: 'W = b*h^2/6',
        summary: 'A formula built from values above it.',
        detail:
          'This is the line that makes the tool worth using: it renders as the symbolic formula, then the same formula with your numbers substituted in, then the result. That middle step is what makes a calculation checkable by eye — a reviewer can see the numbers that went in without recomputing anything.',
        example: 'b = 300 mm\nh = 500 mm\nW = b*h^2/6\n',
        keywords: ['formula', 'expression', 'substitution', 'symbolic'],
      },
      {
        id: 'display-unit',
        code: 'sigma = M/W  -> MPa',
        summary: 'The arrow forces the unit the result is shown in.',
        detail:
          'Without it the result is shown in the units it was built from. With it you get the unit you asked for, and an error if that unit is the wrong kind of quantity — a length cannot be shown in MPa, and saying so is more useful than a number that looks fine.',
        example: 'M = 250 kN*m\nW = 1.25e7 mm^3\nsigma = M/W  -> MPa\n',
        keywords: ['arrow', 'convert', 'display unit', 'show in'],
      },
      {
        id: 'tolerance',
        code: 'b = 300 mm +- 2 mm',
        summary: 'A value with an uncertainty, which propagates downwards.',
        detail:
          'Write ± if you prefer; +- is easier to type. Every result that depends on this value gets a ± of its own, worked out from the partial derivatives of your own formula, and results with more than one uncertain input also show which input each share of the uncertainty came from. Settings chooses between combining them statistically (in quadrature, the usual assumption) and worst case (straight sum, the pessimistic bound). The shares are attributed to the quantities named on that line, so to see which original measurement dominates, look at the line where those measurements were combined.',
        example: 'b = 300 mm +- 2 mm\nh = 500 mm +- 3 mm\nW = b*h^2/6\n',
        keywords: ['tolerance', 'uncertainty', 'error', 'propagation', 'plus minus', '±'],
      },
      {
        id: 'check',
        code: 'sigma <= f_ck',
        summary: 'A check: renders as OK or NOT OK with the margin.',
        detail:
          'Also >=, <, >, == and !=. The verdict shows how much room is left — "33.3% spare" — or how far over it is, which is the number you actually report. A check is a line of its own and assigns nothing.',
        example: 'sigma = 20 MPa\nf_ck = 30 MPa\nsigma <= f_ck\n',
        keywords: ['check', 'verify', 'limit', 'OK', 'NOT OK', 'margin', 'utilisation'],
      },
      {
        id: 'function',
        code: 'A(d) = pi*d^2/4',
        summary: 'Your own function, called like any other.',
        detail:
          'Call it with units — A(20 mm) — and it keeps them. Useful when the same expression appears three times in a sheet and you want one place to be wrong.',
        example: 'A(d) = pi*d^2/4\nA_bar = A(20 mm)\n',
        keywords: ['function', 'definition', 'reuse'],
      },
      {
        id: 'solve',
        code: 'b_req = solve sigma = f_ck for b',
        summary: 'The reverse question: what value of b makes the two sides equal?',
        detail:
          'Not "what stress does this section give" but "what section do I need". Nothing symbolic happens: it tries a value of b, re-runs the lines that depend on it, and closes in until the two sides meet — so it works through any number of intermediate steps and in whatever unit b carries. Add "from 100 mm to 900 mm" when it needs telling where to look, which is also how you pick between two roots. If the two sides never cross it says so instead of returning a number.',
        example:
          'M = 250 kN*m\nf_ck = 30 MPa\nh = 500 mm\nb = 300 mm\nW = b*h^2/6\nsigma = M/W\nb_req = solve sigma = f_ck for b\n',
        keywords: ['solve', 'goal seek', 'root', 'inverse', 'required', 'back calculate', 'for'],
      },
      {
        id: 'heading',
        code: '# Heading',
        summary: 'A heading. The first one becomes the sheet title.',
        detail:
          'That title appears in the printed title block and in the sidebar, so the first heading is worth writing properly. ## gives a smaller heading for sections within a sheet.',
        example: '# Beam check\n## Loading\n',
        keywords: ['heading', 'title', 'section'],
      },
      {
        id: 'prose',
        code: '// a note',
        summary: 'A line of prose, for the reasoning a reviewer needs.',
        detail:
          'Everything a calculation needs that is not arithmetic: which code clause, which drawing, why this load case. A note can also sit at the end of a line of maths.',
        example: 'b = 300 mm    // from drawing A-102, rev C\n',
        keywords: ['comment', 'prose', 'note', 'text'],
      },
    ],
  },

  {
    id: 'tables',
    title: 'Many cases at once',
    blurb:
      'A table checks ten sections in the space of one, and a named table becomes data the rest of the sheet can read.',
    entries: [
      {
        id: 'table',
        code: 'table … end',
        summary: 'One row per case, one column per quantity.',
        detail:
          'The first row is the header. A header cell containing an = is a computed column: its formula runs for every row, using that row\'s own values. A computed column holding a comparison prints OK or NOT OK per row. Every column is formatted as a whole, so a column shares one unit, one notation and one number of decimals.',
        example:
          'M_Ed = 250 kN*m\nf_ck = 30 MPa\n\ntable\n  section | bw     | hw     | Wt = bw*hw^2/6 | ok = M_Ed/Wt <= f_ck\n  A       | 300 mm | 500 mm\n  B       | 250 mm | 450 mm\nend\n',
        keywords: ['table', 'rows', 'cases', 'sections', 'batch'],
      },
      {
        id: 'named-table',
        code: 'table steel',
        summary: 'Give a table a name and its columns become lists.',
        detail:
          'A named table publishes every column as steel.<column>: quantities where the cell held a quantity, the label itself where it held a name. That is what interp, lookup, sum, max, min and mean read. An unnamed table stays a table and puts nothing into the sheet.',
        example:
          'table steel\n  profile | h      | A\n  IPE200  | 200 mm | 2850 mm^2\n  IPE300  | 300 mm | 5380 mm^2\nend\n\nA_all = sum(steel.A)\n',
        keywords: ['named table', 'columns', 'data', 'array', 'list'],
      },
      {
        id: 'interp',
        code: 'interp(250 mm, steel.h, steel.A)',
        summary: 'Read between two rows of a named table.',
        detail:
          'Linear interpolation down a pair of columns. The x column may run up or down, which is how printed tables come. Asking for a point outside the table is an error rather than an extrapolation: silently extending someone else\'s table past its last row is how wrong numbers get into a calculation.',
        example:
          'table steel\n  profile | h      | A\n  IPE200  | 200 mm | 2850 mm^2\n  IPE300  | 300 mm | 5380 mm^2\nend\n\nA_250 = interp(250 mm, steel.h, steel.A)\n',
        keywords: ['interp', 'interpolate', 'between', 'table lookup'],
      },
      {
        id: 'lookup',
        code: 'lookup("IPE300", steel.profile, steel.A)',
        summary: 'Pick the row with that label.',
        detail:
          'Case and surrounding spaces are ignored. If the label is not there, the error lists what is — which is more useful than a blank.',
        example:
          'table steel\n  profile | h      | A\n  IPE200  | 200 mm | 2850 mm^2\n  IPE300  | 300 mm | 5380 mm^2\nend\n\nA_300 = lookup("IPE300", steel.profile, steel.A)\n',
        keywords: ['lookup', 'vlookup', 'by name', 'row', 'profile'],
      },
      {
        id: 'aggregate',
        code: 'sum(steel.A)',
        summary: 'And max, min, mean — a column is an ordinary list of values.',
        detail:
          'Anything mathjs does to an array works on a named column, units included.',
        example:
          'table loads\n  case | q\n  G    | 6 kN/m\n  Q    | 9 kN/m\nend\n\nq_total = sum(loads.q)\nq_worst = max(loads.q)\n',
        keywords: ['sum', 'max', 'min', 'mean', 'total', 'average'],
      },
      {
        id: 'plot',
        code: 'plot sigma vs b from 200 mm to 400 mm',
        summary: 'Sweep one input and draw the result.',
        detail:
          'Everything downstream of b is recomputed at each of 48 points. Useful for showing that a result is comfortably flat, or alarmingly not.',
        example:
          'M = 250 kN*m\nh = 500 mm\nb = 300 mm\nsigma = M/(b*h^2/6)\nplot sigma vs b from 200 mm to 400 mm\n',
        keywords: ['plot', 'graph', 'sweep', 'sensitivity', 'chart'],
      },
      {
        id: 'import',
        code: 'import "Loads"',
        summary: 'Bring in the definitions from another sheet in the same project.',
        detail:
          'By name, so two sheets with the same name shadow each other — the project panel warns when that happens. Import puts the other sheet\'s values into scope without printing it, which is how one set of loads feeds five checks.',
        keywords: ['import', 'reuse', 'another sheet', 'shared'],
      },
    ],
  },

  {
    id: 'units',
    title: 'Units and numbers',
    prose: [
      {
        heading: 'Units stay as you wrote them',
        text: 'A bending moment of 250 kN·m stays kN·m instead of collapsing into kJ, and mm·mm² stays mm³. mathjs keeps the unit list you built but simplifies it for display, so the sheet reads that list back and reuses it. Two cases override this. Where two units in one quantity share a dimension — metres and millimetres inside a stress — it converts, because the alternative is nonsense. And where the number lands outside a readable range, mathjs\'s own choice of unit is better than yours.',
      },
      {
        heading: 'Mixing dimensions is an error, not a surprise',
        text: 'Adding a length to a pressure stops the line and names the clash. This is the single biggest reason to use the tool rather than a spreadsheet, where the same mistake is a number with no warning attached.',
      },
      {
        heading: 'One rule for notation',
        text: 'Scientific from a hundred thousand up: 1.25·10⁷ mm³, never 12500000 mm³. The same rule serves the document, the inline results and the tables, so a value and its ± never appear in two different forms on one line. Significant figures are set in Settings and apply everywhere.',
      },
      {
        heading: 'Temperature differences',
        text: 'A difference of 22 degrees is 22 K, not 22 degC — degC is a point on a scale and K is an interval, and only one of them can be multiplied by a U-value. Write K for differences.',
      },
      {
        heading: 'Symbols read as maths',
        text: 'An underscore becomes a subscript, so M_Ed prints as M with a subscript Ed. Greek names become Greek letters: sigma, alpha, Delta, phi. Units are set upright and variables italic, the way a textbook sets them.',
      },
    ],
  },

  {
    id: 'errors',
    title: 'When a line will not compute',
    blurb: 'What each message means, and what to do about it.',
    entries: [
      {
        id: 'dimension-clash',
        code: 'Units do not match',
        summary: 'Two quantities of different kinds met at an operator.',
        detail:
          'Adding, subtracting or comparing requires the same kind of quantity. Check the line for a missing division — a force where a stress belongs is usually an area that went astray.',
        keywords: ['units do not match', 'dimension', 'error', 'clash'],
      },
      {
        id: 'undefined',
        code: 'Undefined symbol x',
        summary: 'Nothing above this line gives x a value.',
        detail:
          'A typo, or a symbol defined in another sheet you have not imported. Watch for a name that differs only in case: F_d and f_d are two symbols.',
        keywords: ['undefined', 'unknown', 'symbol', 'typo'],
      },
      {
        id: 'forward-reference',
        code: 'x is defined further down',
        summary: 'The symbol exists, but below this line.',
        detail:
          'A sheet is read top to bottom, like the page it replaces. Move the definition above the line that uses it — this message exists because reading as zero would be worse.',
        keywords: ['forward reference', 'order', 'below', 'later'],
      },
      {
        id: 'redefinition',
        code: 'b was 300 mm above',
        summary: 'A warning, not an error: this line changes b for everything below.',
        detail:
          'Perfectly legal — a staged calculation sometimes revises a value — but a reviewer reading downwards has no way to see it, so the sheet says so.',
        keywords: ['redefinition', 'twice', 'overwrite', 'warning'],
      },
      {
        id: 'no-crossing',
        code: 'The difference never changes sign',
        summary: 'solve looked and found nowhere the two sides meet.',
        detail:
          'Either there is no answer — the check cannot be satisfied by that variable at all — or the answer lies outside where it looked. Give it a range with "from … to …".',
        keywords: ['solve', 'no solution', 'sign', 'bracket', 'range'],
      },
      {
        id: 'outside-table',
        code: 'outside the table',
        summary: 'interp was asked for a point past the last row.',
        detail:
          'Deliberate: extrapolating from a table you did not write is not a calculation, it is a guess. Add the row, or use the nearest one knowingly.',
        keywords: ['interp', 'outside', 'extrapolate', 'range'],
      },
    ],
  },

  {
    id: 'projects',
    title: 'Projects and printing',
    prose: [
      {
        heading: 'A project is what you hand in',
        text: 'Several sheets sharing one title block — client, author, checker, revision — printed as one package with "Sheet 2 of 5" on each. Sheets carry no metadata of their own. The ↑ ↓ buttons in the sidebar set the order they print in, and a sheet can be moved to another project from the Project panel.',
      },
      {
        heading: 'Printing',
        text: 'Print gives you the sheet you are looking at, with the editor hidden — Cmd/Ctrl+P does the same. Project → Preview whole project shows the package as one document first, so you can check the order before committing it to paper.',
      },
      {
        heading: 'Real page numbers',
        text: 'In the package preview, Number the pages chops the document into actual A4 pages, each carrying its sheet\'s title as a running header and "Page 3 of 7" at the foot. A browser cannot put a counter in a page margin by itself, so this step does the pagination properly; it takes a moment and is worth it for something you are submitting.',
      },
    ],
  },

  {
    id: 'storage',
    title: 'Where your work is kept',
    prose: [
      {
        heading: 'In this browser, by default',
        text: 'No account, no server, nothing sent anywhere. Which also means clearing the browser clears the sheets, so there are three ways to keep a copy.',
      },
      {
        heading: 'A copy on disk',
        text: 'Settings → Data → Keep a copy on disk: choose a file once and every change is written to it, so the calculations live somewhere you can back up, sync and find in six months. Chrome and Edge support this; Safari and Firefox do not. If the browser withdraws permission the app says so and offers to reconnect rather than pretending to save.',
      },
      {
        heading: 'Backups and single sheets',
        text: 'Export backup writes the whole store — every project and sheet — as one JSON file, and Restore backup reads it back. Save writes the sheet you are on as a plain text .calc file, and Open reads one in. Settings tells you how old your last backup is.',
      },
      {
        heading: 'Undo',
        text: 'Deleting a sheet asks twice and then offers to put it back; so does deleting a project, with all its sheets. Text editing has ordinary undo inside the editor.',
      },
    ],
  },

  {
    id: 'keyboard',
    title: 'Keyboard',
    entries: [
      { id: 'k-new', code: 'Alt + N', summary: 'New sheet in this project.' },
      { id: 'k-move', code: 'Alt + [ / ]', summary: 'Previous / next sheet.' },
      { id: 'k-panels', code: 'Alt + P / H / ,', summary: 'Project, Help, Settings.' },
      { id: 'k-save', code: 'Cmd/Ctrl + S', summary: 'Save this sheet as a file.' },
      { id: 'k-print', code: 'Cmd/Ctrl + P', summary: 'Print.' },
      { id: 'k-escape', code: 'Escape', summary: 'Close whatever is open.' },
    ],
  },
]

/** Every entry, flattened, for searching. */
export const ENTRIES: (Entry & { section: string; sectionId: string })[] = REFERENCE.flatMap(
  (section) =>
    (section.entries ?? []).map((entry) => ({
      ...entry,
      section: section.title,
      sectionId: section.id,
    })),
)

/**
 * Match on everything an entry says, so searching for "goal seek", "vlookup"
 * or "±" finds the thing you meant rather than nothing.
 */
export function search(query: string): typeof ENTRIES {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ENTRIES
  return ENTRIES.filter((entry) => {
    const haystack = [
      entry.code,
      entry.summary,
      entry.detail ?? '',
      entry.section,
      ...(entry.keywords ?? []),
    ]
      .join(' ')
      .toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}

/** Sections that still have something to show after a search. */
export function filterSections(query: string): Section[] {
  if (!query.trim()) return REFERENCE
  const matches = new Set(search(query).map((entry) => entry.id))
  return REFERENCE.map((section) => ({
    ...section,
    entries: (section.entries ?? []).filter((entry) => matches.has(entry.id)),
    // Prose has nothing to match on, so a search hides it rather than
    // pretending every word in it was a hit.
    prose: [],
  })).filter((section) => (section.entries ?? []).length > 0)
}
