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
        id: 'rounding',
        code: 'b_req = ...  -> ceil 10 mm',
        summary: 'Round to a size you can actually order.',
        detail:
          'ceil, floor and nearest take a step, with or without a unit: ceil 10 mm, nearest 25 mm, floor 0.5. Unlike the unit arrow, this changes the value and not just how it is shown — a required width rounded up to stock is the number every line below it has to use, and a rounding that only affected the printing would let the sheet say 290 mm while the arithmetic quietly carried on with 287.4 mm.',
        example:
          'b_calc = 287.4 mm\nb = b_calc  -> ceil 10 mm\nh = 500 mm\nW = b*h^2/6\n',
        keywords: ['round', 'ceil', 'floor', 'nearest', 'sizing', 'stock', 'increment', 'up'],
      },
      {
        id: 'significant-figures',
        code: 'M = ...  -> 3 sf',
        summary: 'Round to significant figures, or to decimal places.',
        detail:
          '3 sf and 2 dp both work, and both round in the unit the value reads in — three significant figures of a moment in kN·m, not of its value in joules. Like the step roundings, this changes the value. Arrows chain left to right, so a line can convert and then round: -> MPa -> 3 sf.',
        example: 'M = 172.84 kN*m  -> 3 sf\nx = 1/3  -> 2 dp\n',
        keywords: ['significant figures', 'sf', 'decimal places', 'dp', 'precision', 'round'],
      },
      {
        id: 'range',
        code: 'i = 1..10',
        summary: 'A list of numbers, and arithmetic down the whole list.',
        detail:
          'The end is included, so 1..10 is ten numbers. Add a step with "0..1 step 0.25". A range holds plain numbers: the quantity comes from multiplying it by something with units, which keeps one rule instead of a second unit system inside brackets. Multiplying or dividing element by element uses .* and ./ — a plain * between two lists is their dot product, which is what a load combination usually wants. Powers are element-wise, so a formula written for one value works down a list unchanged. sum, max, min and mean reduce a list to a number.',
        example:
          'i = 1..4\nw = i*10 kN/m\nW_tot = sum(w)\n',
        keywords: ['range', 'vector', 'list', 'series', 'load combination', 'element-wise', 'sum'],
      },
      {
        id: 'query',
        code: 'sigma = M_Ed/W   ?? is this the right load case',
        summary: "A question for whoever checks the sheet.",
        detail:
          'A `??` note is kept apart from a `//` one on purpose: "here is why" and "I am not sure about this" are different things, and a checker wants to find only the second. It prints in the margin beside the line, where a pencil note would have gone, and it travels with the sheet because it lives in the text.',
        example: 'M_Ed = 250 kN*m\nW = 1.25e7 mm^3\nsigma = M_Ed/W  // clause 6.2  ?? is 250 the right load case\n',
        keywords: ['query', 'question', 'review', 'checker', 'comment', 'margin', '??'],
      },
      {
        id: 'equation-number',
        code: '// The section modulus is @W',
        summary: 'Refer to an earlier line by its symbol, and get its equation number.',
        detail:
          'Every line that defines something is numbered in reading order, and the number prints in the margin. Writing @W anywhere in prose or in a note prints "eq. 7" — and because the reference is to the symbol rather than to a number you typed, moving a line renumbers the reference with it. The same @name syntax points at a figure and prints "Figure 2". References across sheets are deliberately not supported: a reference that silently points at the wrong line would be worse than one that was never made.',
        example: 'b = 300 mm\nW = b^3\n// The section modulus is @W\n',
        keywords: ['equation number', 'reference', 'cross-reference', 'eq', 'see', '@'],
      },
      {
        id: 'page-break',
        code: 'page break',
        summary: 'Start a new page here when the sheet is printed.',
        detail:
          'Nothing on screen; on paper the next line starts a new page. For the places where a check should not begin at the foot of a page — everything else about where pages fall is worked out for you.',
        example: 'a = 1 mm\npage break\nb = 2 mm\n',
        keywords: ['page break', 'print', 'pagination', 'new page'],
      },
      {
        id: 'figure',
        code: 'figure section_AA "Cross-section at A-A"',
        summary: 'A sketch or photograph, captioned and numbered.',
        detail:
          'Figure in the toolbar attaches an image at the cursor and writes the line for you. The words stay in the sheet and the image is kept beside it, so a photograph never lands in the middle of your text as a wall of base64. Numbering is automatic and follows the order the figures appear in. Write @section_AA anywhere in prose and it prints as "Figure 2", renumbering itself if you move things about.',
        example: 'figure section_AA "Cross-section at A-A"\n// Dimensions taken from @section_AA\n',
        keywords: ['figure', 'image', 'photo', 'sketch', 'caption', 'drawing', 'picture'],
      },
      {
        id: 'tolerance',
        code: 'b = 300 mm +- 2 mm',
        summary: 'A value with an uncertainty, which propagates downwards.',
        detail:
          'Write ± if you prefer; +- is easier to type. Every result that depends on this value gets a ± of its own, worked out from the partial derivatives of your own formula. The shares name the *measurements* the uncertainty came from rather than the intermediate values in between: a stress built from a section modulus built from a width and a height reports the width and the height, because those are the things somebody can go and measure again. Settings chooses between combining them statistically (in quadrature, the usual assumption) and worst case (straight sum, the pessimistic bound).',
        example: 'b = 300 mm +- 2 mm\nh = 500 mm +- 3 mm\nW = b*h^2/6\n',
        keywords: ['tolerance', 'uncertainty', 'error', 'propagation', 'plus minus', '±'],
      },
      {
        id: 'correlate',
        code: 'correlate b and h by 0.8',
        summary: 'Say that two measurements are not independent.',
        detail:
          'Propagation assumes the inputs are independent, which is the usual assumption and occasionally the wrong one: two dimensions measured with the same instrument move together, and a budget that ignores that understates the result. A coefficient of 1 means they move exactly together and their errors add; −1 means they move opposite ways and cancel; 0 is the default. It applies to every line below it.',
        example:
          'x = 100 mm +- 1 mm\ny = 100 mm +- 1 mm\ncorrelate x and y by 1\ns = x + y\n',
        keywords: ['correlate', 'correlation', 'independent', 'covariance', 'uncertainty'],
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
    id: 'harder',
    title: 'When one pass is not enough',
    blurb:
      'The three shapes a calculation takes when the answer is not simply the next line down: something that feeds back on itself, two things that have to be true at once, and a choice between rows.',
    entries: [
      {
        id: 'iterate',
        code: 'f = iterate step(f) from 0.02',
        summary: 'Repeat until the value stops moving.',
        detail:
          'For the cases where an input depends on the answer: effective length, iterative deflection, a friction factor that sits on both sides of its own equation. Write the step as a function of the variable and give a first guess; the value is fed back in until it settles, and the line says how many rounds that took. Add "within 1e-6" for a looser tolerance. Where `solve` can do the job it is better — it proves an answer exists by bracketing one — but some formulas read naturally as x <- g(x) and rearranging them into a root to find would mean rewriting the engineer\'s own algebra.',
        example:
          'Re_D = 1e5\nrr = 0.001\nstep(f) = (-2*log10(rr/3.7 + 2.51/(Re_D*sqrt(f))))^-2\nf = iterate step(f) from 0.02\n',
        keywords: ['iterate', 'converge', 'fixed point', 'loop', 'colebrook', 'implicit'],
      },
      {
        id: 'solve-two',
        code: 'b, h = solve A = 20000 mm^2 and r = 2 for b, h',
        summary: 'Two equations, two unknowns.',
        detail:
          'Both variables need a value above the line: those values say what kind of quantity each one is and where to start looking. Everything in between is re-run as the pair is varied, so the unknowns can be several steps up the chain from the equations. If the two equations turn out to say the same thing, the line says so rather than returning one of the infinitely many answers.',
        example:
          'b = 100 mm\nh = 100 mm\nA = b*h\nr = h/b\nb, h = solve A = 20000 mm^2 and r = 2 for b, h\n',
        keywords: ['solve', 'two unknowns', 'simultaneous', 'newton', 'system'],
      },
      {
        id: 'choose',
        code: 'choice = pick(steel.profile, steel.mass, ok)',
        summary: 'The lightest row that still passes.',
        detail:
          'A table with a verdict column already answers "which of these work". These answer the question after it: `smallest` and `largest` give the value, `pick` gives the label from another column of the same table, and `count_where` says how many passed. Leave the verdict column out to consider every row.',
        example:
          'W_req = 500e3 mm^3\ntable steel\n  profile | W_el        | mass\n  IPE200  | 194e3 mm^3  | 22.4 kg/m\n  IPE300  | 557e3 mm^3  | 42.2 kg/m\n  IPE400  | 1160e3 mm^3 | 66.3 kg/m\nend\nok = steel.W_el >= W_req\nchoice = pick(steel.profile, steel.mass, ok)\nm = smallest(steel.mass, ok)\n',
        keywords: ['pick', 'smallest', 'largest', 'lightest', 'optimise', 'minimise', 'choose', 'section'],
      },
      {
        id: 'statistics',
        code: 'k = slope(run.x, run.y)',
        summary: 'Mean, spread and a straight line through a column.',
        detail:
          '`mean`, `sd` and `sem` over a named table\'s column, and `slope`, `intercept` and `r2` through two of them. The standard deviation is the sample form, with n − 1 in the denominator, because a set of readings is a sample and not the population. All of them carry units: the slope of millimetres against seconds comes out in mm/s.',
        example:
          'table run\n  t     | y\n  1 s   | 2.1 mm\n  2 s   | 3.9 mm\n  3 s   | 6.2 mm\n  4 s   | 7.8 mm\nend\nm = mean(run.y)\ns = sd(run.y)\nk = slope(run.t, run.y)\nq = r2(run.t, run.y)\n',
        keywords: ['mean', 'average', 'standard deviation', 'sd', 'regression', 'fit', 'slope', 'r2', 'statistics'],
      },
      {
        id: 'interp2',
        code: 'v = interp2(x, y, t.x, t.y, t.z)',
        summary: 'Interpolation into a table with two entry arguments.',
        detail:
          'A code table printed as a grid — a row per thickness, a column per temperature — arrives here as three equal-length columns, because that is how a table block holds them. The grid is recovered from the values in the first two. Asking for a point outside it is an error rather than an extrapolation, the same as with `interp`.',
        example:
          'table k\n  t      | T       | lambda\n  50 mm  | 0 degC  | 0.035 W/(m*K)\n  50 mm  | 40 degC | 0.039 W/(m*K)\n  150 mm | 0 degC  | 0.031 W/(m*K)\n  150 mm | 40 degC | 0.035 W/(m*K)\nend\nv = interp2(100 mm, 20 degC, k.t, k.T, k.lambda)\n',
        keywords: ['interp2', 'bilinear', 'two dimensional', 'grid', 'table', 'interpolate'],
      },
      {
        id: 'calculus',
        code: 'W = integral(w, 0 m, 6 m)',
        summary: 'Area under one of your own functions, and its slope at a point.',
        detail:
          '`integral(f, a, b)` integrates a function you defined between two limits, by adaptive Simpson — adaptive because a load that is flat over most of a span and steep at one end is the normal case. `deriv(f, x)` is the slope at a point, by a central difference. Both carry units: integrating kN/m over metres gives kN.',
        example: 'w(x) = 2 kN/m^2*x\nW = integral(w, 0 m, 6 m) -> kN\ns = deriv(w, 3 m) -> kN/m^2\n',
        keywords: ['integral', 'integrate', 'area under', 'derivative', 'deriv', 'slope at', 'calculus'],
      },
      {
        id: 'kinds',
        code: 'A(d: length) = pi*d^2/4',
        summary: 'Say what kind of quantity a function takes.',
        detail:
          'Without it, calling A(20 kN) computes something and the mistake shows up several lines later as a stress in strange units — if it shows up at all. With it the call itself stops, naming the argument and what it expected. The kinds are: ' +
          'number, ratio, factor, length, area, volume, mass, time, force, moment, pressure, stress, energy, power, temperature, angle, velocity, acceleration, density, frequency, load.',
        example: 'A(d: length) = pi*d^2/4\na = A(20 mm) -> mm^2\n',
        keywords: ['dimensions', 'kind', 'type', 'argument', 'function', 'check', 'signature'],
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
        heading: 'Temperature differences are refused, not just discouraged',
        text: 'A difference of 22 degrees is 22 K, not 22 degC — degC is a point on a scale and K is an interval. Multiplying by an absolute temperature silently drops the 273.15, so 0.17 W/(m²K) × 22 degC gives exactly what 22 K would, and the answer is out by a factor of thirteen with nothing about it looking wrong. So the engine stops that line and says so. Adding and subtracting temperatures is untouched: T_2 − T_1 is the normal way to get a difference, and it still works.',
      },
      {
        heading: 'Units your own field uses',
        text: 'Write `unit ksi = 1000 psi` and the sheet has it from there on. The definition is checked before anything is defined, so a typo leaves the vocabulary as it was, and defining the same unit twice is harmless because a sheet re-runs as you type. Defining a unit does not change how anything else is displayed — Longhand chooses display units from its own short list per dimension rather than by searching, which is what makes this safe.',
      },
      {
        heading: 'Constants without looking them up',
        text: 'Write `import "Constants"` for g_n, the gas constant, Stefan–Boltzmann, the standard atmosphere and the rest — exact, because since 2019 they are defined rather than measured — plus nominal densities and elastic moduli. There are deliberately no partial safety factors in it: those depend on the code, the national annex and the design situation, and a stale one sitting in a shared sheet is invisible. Write those in the sheet that uses them, where a checker can see them.',
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
        id: 'shadowed-unit',
        code: 'm = smallest(steel.mass, ok)',
        summary: 'A variable named like a unit takes that name over.',
        detail:
          'Names in a sheet win over units, which is what lets you call a width b without arguing with bytes. The cost is that a variable called m, s, A, N, T or K means your value from that line down, so "42.2 kg/m" afterwards reads as kilograms per your m. It usually shows up as "Units do not match" a line or two later. Give the variable a longer name — m_pick, A_gross — and the unit goes back to meaning what it says.',
        keywords: ['shadow', 'unit name', 'variable name', 'units do not match', 'clash'],
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
        heading: 'The checks, first',
        text: 'Every check in a sheet is listed at the top of the document with its verdict and its margin, and on screen each row jumps to the line it came from. A printed package gets the same list for every sheet at once, on its own page at the front — which is the page a reviewer reads first and the only one some of them read. A verdict column inside a table contributes one row saying how many of its rows held.',
      },
      {
        heading: 'What a printed sheet says about itself',
        text: 'Every printed page carries the build that produced it, and every sheet ends with a line saying that Longhand is a calculation aid and that the author and checker named in the title block remain responsible. A calculation that goes into a submission has to be reproducible and has to say what it does not claim.',
      },
      {
        heading: 'Draft or issued',
        text: 'A project is a draft until you say otherwise, and a draft prints PRELIMINARY across every page. A draft and an issued calculation otherwise look identical on paper, and that is how a draft ends up in a submission. The Project panel also takes a footer line — your firm, a job number — printed under every sheet beside the build stamp.',
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
      {
        heading: 'History',
        text: 'History keeps snapshots of the sheet you are on — one taken automatically every so often while you work, and one whenever you press Save a revision. Opening a snapshot shows a line-by-line diff against the sheet as it stands, which is how "what changed since revision B" gets answered. Restoring takes a snapshot of where you are first, so looking through history can never be the thing that loses work.',
      },
      {
        heading: 'In from a spreadsheet, out as Markdown',
        text: 'Symbols → Paste a spreadsheet range turns whatever is on the clipboard into a table block at the cursor: Excel and Google Sheets both copy tab-separated text, and retyping twenty rows of section properties is the most tedious thing about starting a sheet. What comes out is an ordinary table you can edit. Export as Markdown writes the sheet out for a report appendix, with the tables as Markdown tables and the queries marked.',
      },
      {
        heading: 'Sharing a sheet by link',
        text: 'Share compresses the whole calculation, figures and all, into the link itself, after the # — the part of an address a browser never sends to a server. So a link opens without an account and without anything being uploaded, and it opens read-only with a button to make a copy. The other side of that: anyone holding the link can read the sheet, and whatever you send it through holds it too. A link is a snapshot, so changing the sheet afterwards does not change what an already-sent link opens.',
      },
      {
        heading: 'Proving the cache is honest',
        text: 'Longhand reuses everything above the first line you edited, which is what keeps a long sheet responsive. Settings → Trust → Recalculate from scratch throws that away, runs the sheet again from nothing and says whether the two agree line for line.',
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
      { id: 'k-share', code: 'Alt + S', summary: 'Share this sheet as a link.' },
      { id: 'k-history', code: 'Alt + R', summary: 'History and revisions.' },
      { id: 'k-symbols', code: 'Alt + Y', summary: 'Symbols — every name, and what depends on it.' },
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
