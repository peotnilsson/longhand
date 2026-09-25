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
  /** Show the example typeset under the code — for the maths you write to be read. */
  preview?: boolean
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
      'One line at a time, top to bottom. A line is an assignment, a check, a function, a table, a heading or a note — and a symbol means whatever the line above said it means. Everything below can be inserted from the editor by typing / on an empty line, so none of it has to be memorised.',
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
          'The first row is the header. A header cell containing an = is a computed column: its formula runs for every row, using that row\'s own values — so a row only gives values for the plain columns, in order, and the computed ones fill themselves in. A computed column holding a comparison prints OK or NOT OK per row with its margin underneath, "33.3% spare", worked out exactly as a check line would; there is no need for a margin column of your own. Every column is formatted as a whole, so a column shares one unit, one notation and one number of decimals. The block needs end on a line of its own after the last row — without it the table reads on into the lines below, and says so under the table.',
        example:
          'M_Ed = 250 kN*m\nf_ck = 30 MPa\n\ntable\n  section | bw     | hw     | Wt = bw*hw^2/6 | ok = M_Ed/Wt <= f_ck\n  A       | 300 mm | 500 mm\n  B       | 250 mm | 450 mm\nend\n',
        keywords: ['table', 'rows', 'cases', 'sections', 'batch', 'margin', 'spare', 'utilisation', 'end'],
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
        id: 'ode',
        code: "y = ode y'' - y' - 2y = x, y(0) = 2, y'(0) = 0 for x from 0 to 3",
        summary: 'Solve a differential equation, and get the solution as a function.',
        detail:
          "The equation first, then one condition per derivative below its order, all at the start of the interval. The solution goes into the sheet as a function: call it, plot it, differentiate it with deriv, or check a solution worked out by hand against it. It is solved numerically — fourth-order Runge–Kutta on two thousand steps — so it works for any equation that can be solved for its highest derivative, linear or not, but gives numbers rather than a formula. Plain numbers only: divide units out first.",
        example:
          "y = ode y'' - y' - 2y = x, y(0) = 2, y'(0) = 0 for x from 0 to 3\nexact(x) = 3/4*exp(2*x) + exp(-x) - x/2 + 1/4\nabs(y(1) - exact(1)) <= 1e-6\n",
        keywords: ['ode', 'differential equation', 'differentialekvation', 'initial value', 'begynnelsevärde', 'runge kutta', 'numeric'],
      },
      {
        id: 'roots',
        code: 'r = roots(1, -1, -2)',
        summary: 'The roots of a polynomial, complex ones included.',
        detail:
          'Coefficients highest power first, the order the polynomial is written in: roots(1, -1, -2) for r² − r − 2. Up to a cubic. A characteristic equation with no real roots gets its complex pair, -1 + 2i and -1 − 2i, and complex numbers work in the rest of the sheet: 2 + 3i, abs, re, im, arg, conj.',
        example: 'r = roots(1, -1, -2)\nc = roots(1, 2, 5)\nz = 2 + 3i\nm = abs(z)\n',
        keywords: ['roots', 'rötter', 'polynomial', 'characteristic equation', 'karakteristisk', 'complex', 'komplex', 'i', 'quadratic'],
      },
      {
        id: 'matrix',
        code: 'A = [1, 2; 3, 4]',
        summary: 'A matrix: rows separated by semicolons.',
        detail:
          'Printed as a matrix, not a count of its rows. det(A), inv(A), transpose(A) and A*B work as on paper, and A*[1; 1] is a matrix times a column. A system of equations in matrix form is solved with lusolve(A, b).',
        example: 'A = [1, 2; 3, 4]\nd = det(A)\nB = inv(A)\nx = lusolve(A, [5; 6])\n',
        keywords: ['matrix', 'matris', 'determinant', 'inverse', 'invers', 'linear algebra', 'linjär algebra', 'system', 'vector'],
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
    id: 'maths',
    title: 'Writing out a solution',
    blurb:
      'Everything above is worked out. A written solution also needs mathematics that is only stated — the equation you are about to solve, a system with its big brace, the chain of ⇔ from a polynomial to its roots, the limit you are claiming. A line starting with math is typeset and never evaluated, so it can say anything. It is written the way you would type maths in a plain text box: x^2, a/b, sqrt(x), <=>. Put $…$ inside a // comment for maths in the middle of a sentence.',
    entries: [
      {
        id: 'math-line',
        code: "math y'' - y' - 2y = x",
        summary: 'An equation, typeset and not computed.',
        detail:
          "Primes are written as they are printed — y', y'', f'(x) — and so are subscripts: y_p, a_n, a_(n+1). A slash becomes a fraction, dropping the brackets it no longer needs: (a+b)/(c+d). Powers group their exponent: e^(2x), x^-1. Numbers and letters side by side multiply, so 2y and (r-2)(r+1) mean what they look like. Nothing on the line has to be defined anywhere, because nothing on it is worked out.",
        example: "math y'' - y' - 2y = x\nmath y_p(x) = a x + b\nmath e^(2x) (r - 2)(r + 1) = (a + b)/(c + d)\n",
        keywords: ['equation', 'display', 'formula', 'typeset', 'latex', 'derivative', 'prime', 'ode', 'show'],
        preview: true,
      },
      {
        id: 'math-system',
        code: 'math { … ; … }',
        summary: 'A system of equations, with the big brace.',
        detail:
          'Rows inside { } are separated by semicolons. For a longer one, end the math line with { and put each row on a line of its own, closed by } on its own line. Without a semicolon, { } is a set: { x in RR : x > 0 }.',
        example:
          "math { y'' - y' - 2y = x ; y(0) = 2, y'(0) = 0 }\n\nmath {\n  x + y = 3\n  x - y = 1\n}\n",
        keywords: ['system', 'brace', 'cases', 'initial value problem', 'begynnelsevärdesproblem', 'ekvationssystem', '{'],
        preview: true,
      },
      {
        id: 'math-piecewise',
        code: 'math f(x) = { x^2 if x < 0 ; 2x if x >= 0 }',
        summary: 'A function defined piece by piece.',
        detail:
          'The word if — or om — puts each condition in a column of its own, the way a piecewise definition is printed.',
        example: 'math f(x) = { x^2 if x < 0 ; 2x om x >= 0 }\nmath |x| = { x if x >= 0 ; -x if x < 0 }\n',
        keywords: ['piecewise', 'cases', 'styckvis', 'absolute value', 'definition'],
        preview: true,
      },
      {
        id: 'math-align',
        code: 'align … end',
        summary: 'A derivation, lined up on its = and ⇔.',
        detail:
          'One step per line, aligned on the first relation. A line that starts with a relation — = , <=>, => — continues the one above it, which is how a chain of equivalences or a long calculation is written out.',
        example:
          'align\n  r^2 - r - 2 = 0\n  <=> (r - 2)(r + 1) = 0\n  <=> r = 2 or r = -1\nend\n',
        keywords: ['align', 'derivation', 'steps', 'chain', 'equivalence', 'ekvivalens', 'uträkning'],
        preview: true,
      },
      {
        id: 'math-inline',
        code: '// The roots are $r = 2$ and $r = -1$.',
        summary: 'Maths in the middle of a sentence.',
        detail:
          'Anything between two $ in a comment is typeset in the line, with the same writing as a math line. A written solution is an argument, and an argument that can only put maths on lines of its own reads like a list of equations.',
        example: '// The characteristic equation $r^2 - r - 2 = 0$ has the roots $r = 2$ and $r = -1$.\n',
        keywords: ['inline', 'dollar', 'sentence', 'text', 'prose', '$'],
        preview: true,
      },
      {
        id: 'math-parts',
        code: 'a) Visa att …',
        summary: 'The parts of an exercise: a), b), c).',
        detail:
          'A line starting with a letter and a closing bracket is a part of the exercise, printed with the letter in bold. The rest of the line is text, and takes $…$ maths like a comment does.',
        example: "a) Visa att $y = x e^(-x)$ löser ekvationen.\nb) Bestäm den allmänna lösningen.\n",
        keywords: ['part', 'deluppgift', 'a)', 'b)', 'exercise', 'uppgift', 'question'],
        preview: true,
      },
      {
        id: 'math-answer',
        code: 'svar y(x) = 3/4 e^(2x) + e^(-x)',
        summary: 'The answer, boxed.',
        detail:
          'svar — or answer — typesets the rest of the line like a math line and draws a box round it, which is how the result is marked at the end of a solution.',
        example: 'svar y(x) = 3/4 e^(2x) + e^(-x) - x/2 + 1/4\n',
        keywords: ['answer', 'svar', 'box', 'boxed', 'result', 'final'],
        preview: true,
      },
      {
        id: 'math-number',
        code: "math #ode y'' - y' - 2y = x",
        summary: 'Number an equation, and refer to it with @.',
        detail:
          'A label after math — or after align, or before the { of a system — numbers the line in the margin, in the same sequence as the calculation lines. Writing @ode in a comment then prints (1), and moving the line renumbers every reference to it.',
        example: "math #ode y'' - y' - 2y = x\n// Den karakteristiska ekvationen till @ode är $r^2 - r - 2 = 0$.\n",
        keywords: ['equation number', 'label', 'reference', 'ekvationsnummer', 'numbered', '@', 'tag'],
        preview: true,
      },
      {
        id: 'math-show',
        code: 'show diff(x^2*sin(x), x)',
        summary: 'A derivative worked out symbolically, and printed.',
        detail:
          'show diff(f, x) prints d/dx f = the derivative, as a formula rather than a number; diff(f, x, 2) is the second derivative. show simplify(f) and show expand(f) print a simplified or multiplied-out form. The letters are symbols: x stays x even if a line above gave it a value. Functions are written with brackets, sin(x) and ln(x), and multiplication with *.',
        example: 'show diff(x^2*sin(x), x)\nshow diff(ln(x)/x, x)\nshow expand((x + 1)^3)\nshow simplify((x + 1)^2 - (x - 1)^2)\n',
        keywords: ['symbolic', 'derivative', 'derivera', 'simplify', 'förenkla', 'expand', 'utveckla', 'show', 'cas'],
      },
      {
        id: 'math-logic',
        code: 'math a <=> b => c',
        summary: 'Equivalence, implication, and the rest of the argument.',
        detail:
          '<=> is ⇔, => is ⇒, <== is ⇐, -> is →, |-> is ↦, != is ≠, <= and >= are ≤ and ≥, ~= is ≈. The words and, or, if, och, eller, om, då, där, för are set as words with room around them, and anything else in quotes is text: "for all" x.',
        example: 'math x^2 = 4 <=> x = 2 or x = -2\nmath f: x |-> x^2\nmath x > 0 => sqrt(x^2) = x\n',
        keywords: ['implies', 'iff', 'equivalent', 'arrow', 'logic', 'implikation', 'ekvivalens', 'or', 'and', 'text'],
        preview: true,
      },
      {
        id: 'math-sets',
        code: 'math x in ]0, 1[',
        summary: 'Sets, number systems and intervals.',
        detail:
          'RR, NN, ZZ, QQ, CC are ℝ, ℕ, ℤ, ℚ, ℂ. in, notin, sub, subeq, cup (or union), cap, setminus, forall and exists are the set and logic relations. Intervals are written with whatever brackets they have: [0, 1), (0, 1] and the ]0, 1[ used in Swedish texts all work. oo is ∞ and emptyset is ∅.',
        example: 'math x in ]0, 1[ sub RR\nmath A = { x in RR : x^2 < 4 } = ]-2, 2[\nmath [0, oo) cup emptyset\n',
        keywords: ['set', 'interval', 'real numbers', 'mängd', 'intervall', 'RR', 'infinity', 'oändlighet'],
        preview: true,
      },
      {
        id: 'math-paste',
        code: 'math σ ≤ f_yd',
        summary: 'Paste the symbols themselves and they are read.',
        detail:
          'A line copied out of a lecture handout arrives with real mathematical characters in it, so those are what they look like: ≤ ≥ ≠ ≈ ≡, − × · ÷ ±, → ← ↦ ⇒ ⇔, ∈ ∉ ⊂ ⊆ ∪ ∩ ∖ ∅ ∀ ∃, ∞, √, °, m², f′(x), … and the Greek alphabet. Nothing has to be transliterated first, and there is no difference between a pasted ≤ and a typed <=. The same holds on lines that are computed, where 2 m × 3 and 10 µm work as written.',
        example: 'math σ ≤ f_yd\nmath ∀ x ∈ ℝ: x² ≥ 0\nmath lim_(x → ∞) 1/x = 0\nmath √2 ≈ 1.414\n',
        keywords: ['paste', 'unicode', 'copy', 'symbol', 'klistra in', 'tecken', 'grekiska', 'degree', 'grader'],
        preview: true,
      },
      {
        id: 'math-functions',
        code: 'math sin^2 x + cos^2 x = 1',
        summary: 'sin, ln, arctan and the rest, set upright.',
        detail:
          'sin, cos, tan, cot, arcsin, arccos, arctan, sinh, cosh, tanh, ln, log, exp, max, min, sup, inf are printed the way they are in a book. They take brackets or not — sin x and sin(x) — a power before the argument, sin^2 x, and a base, log_2(x). Greek letters are written out: alpha, lambda, theta, pi, Omega.',
        example: 'math sin^2 x + cos^2 x = 1\nmath log_2(8) = 3\nmath arctan x + arctan(1/x) = pi/2\n',
        keywords: ['trigonometry', 'logarithm', 'ln', 'arctan', 'greek', 'lambda', 'theta', 'funktion'],
        preview: true,
      },
      {
        id: 'math-roots',
        code: 'math sqrt(x), root(3, x), |x|',
        summary: 'Roots, absolute values, binomials and factorials.',
        detail:
          'sqrt(x) and root(n, x) for the n-th root. |x| or abs(x) for the absolute value, with bars that grow with what is inside them. binom(n, k) is the binomial coefficient, n! a factorial, floor(x) and ceil(x) the integer parts. bar(z), hat(x), vec(v) and dot(x) put marks over a letter.',
        example: 'math sqrt(x^2) = |x|\nmath binom(n, k) = n!/(k! (n - k)!)\nmath root(3, 27) = 3\n',
        keywords: ['square root', 'root', 'absolute', 'belopp', 'binomial', 'factorial', 'fakultet', 'rot'],
        preview: true,
      },
      {
        id: 'math-limits',
        code: 'math lim(x -> 0, sin(x)/x) = 1',
        summary: 'A limit, written with its arrow underneath.',
        detail:
          'lim(x -> a, expression). A one-sided limit ends the arrow with a sign, x -> 0+ or x -> 0-, and a limit at infinity uses oo.',
        example:
          'math lim(x -> 0, sin(x)/x) = 1\nmath lim(x -> 0+, x ln x) = 0\nmath lim(n -> oo, (1 + 1/n)^n) = e\n',
        keywords: ['limit', 'gränsvärde', 'lim', 'infinity', 'one-sided', 'standardgränsvärde'],
        preview: true,
      },
      {
        id: 'math-derivatives',
        code: 'math diff(y, x) = 2x',
        summary: 'Derivatives, with primes or in Leibniz notation.',
        detail:
          "y', f''(x) and so on for primes. diff(y, x) is dy/dx, diff(y, x, 2) the second derivative, and diff(x) on its own is the operator d/dx put in front of something.",
        example: "math diff(y, x) = y'\nmath diff(y, x, 2) + y = 0\nmath diff(x) sin x = cos x\n",
        keywords: ['derivative', 'derivata', 'leibniz', 'dy/dx', 'prime', 'differentiate'],
        preview: true,
      },
      {
        id: 'math-integrals',
        code: 'math int(x^2, x, 0, 1) = 1/3',
        summary: 'Integrals, and the bracket you evaluate afterwards.',
        detail:
          'int(f(x), x) is the indefinite integral, int(f(x), x, a, b) runs from a to b, and b may be oo for an improper integral. eval(F(x), a, b) is the [F(x)] from a to b written after finding a primitive.',
        example:
          'math int(x^2, x, 0, 1) = eval(x^3/3, 0, 1) = 1/3\nmath int(1/x, x) = ln|x| + C\nmath int(e^(-x), x, 0, oo) = 1\n',
        keywords: ['integral', 'primitive', 'primitiv funktion', 'antiderivative', 'improper', 'generaliserad'],
        preview: true,
      },
      {
        id: 'math-sums',
        code: 'math sum(k = 1, n, k) = n(n + 1)/2',
        summary: 'Sums, series and products.',
        detail:
          'sum(k = 1, n, term) with the index, the upper limit and the term, and oo for a series. prod works the same way.',
        example: 'math sum(k = 1, n, k) = n(n + 1)/2\nmath sum(k = 0, oo, x^k) = 1/(1 - x)\nmath prod(k = 1, n, k) = n!\n',
        keywords: ['sum', 'series', 'serie', 'summa', 'geometric', 'product', 'sigma'],
        preview: true,
      },
      {
        id: 'math-ordo',
        code: 'math e^x = 1 + x + ordo(x^2)',
        summary: 'Big O, for Taylor expansions.',
        detail:
          'ordo(x^n) is the 𝒪(xⁿ) of a Taylor or Maclaurin expansion. Written out as ordo so that a function of your own called O is still a function.',
        example: 'math sin x = x - x^3/6 + ordo(x^5)\nmath e^x = 1 + x + x^2/2 + ordo(x^3)\n',
        keywords: ['ordo', 'big o', 'taylor', 'maclaurin', 'stora ordo'],
        preview: true,
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
        heading: 'Paste from a document and it still works',
        text: 'A calculation is usually copied out of something typeset — a lecture PDF, a Word document, a message — so what arrives is not the characters a keyboard makes. A minus sign that is not a hyphen (2 − 1), a multiplication sign (2 × 3), a middle dot, a non-breaking space between a number and its unit, a squared metre written m², a micro sign in 10 µm, 45° and 20 °C, ≤ and ≥ in a check, ± before a tolerance, curly quotes, and 2**3 from a spreadsheet: each of those has exactly one sensible reading, and it is read that way. Quoted text is left exactly as typed, because those are your words.',
      },
      {
        heading: 'The two that have to be written out',
        text: 'A decimal comma and a space inside a long number are the two cases where guessing would be worse than asking, because 1,5 and max(1,5) cannot be told apart and neither can 1 000 and two numbers side by side. Write 1.5 and 1000 — or 1e3 — and the line says so if you forget.',
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
        heading: 'Signing a sheet off',
        text: 'The Project panel can sign the sheet you are on as checked. What gets stored is your name and a SHA-256 fingerprint of the sheet\'s text, so the claim is about that exact text rather than about a name in a box: edit a line afterwards and the sheet says, on screen and on paper, that the signature no longer applies. It is not proof of who you are — anyone at this browser could type any name, the way anyone with a pen could. What it rules out is the one thing a pen cannot, a signature quietly outliving a change to the numbers above it.',
      },
      {
        heading: 'Into somebody else\'s report',
        text: 'A calculation is often an appendix to a report written elsewhere. Symbols → Take it elsewhere exports the sheet for Word, as LaTeX, or as Markdown, and all three carry the formulas as formulas — MathML that Word turns into its own equations, \\[ … \\] for LaTeX — so what arrives is text the receiving document can renumber and correct rather than a picture of text. The LaTeX file compiles on its own and marks the body between two comments, for lifting into an existing document.',
      },
      {
        heading: 'Printing',
        text: 'Print gives you the sheet you are looking at, with the editor hidden — Cmd/Ctrl+P does the same. Project → Preview whole project shows the package as one document first, so you can check the order before committing it to paper. A table of six columns or more is printed on a landscape page of its own, because the common wide table — one row per load case, one column per quantity — is unreadable squeezed into portrait.',
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
        heading: 'It works with no network',
        text: 'Longhand keeps a copy of itself in the browser, so it opens and computes on a site with no coverage, on a train, or on a machine that is not allowed out to the internet. Nothing about the calculation needed a network in the first place — this only means the program does not either.',
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
        heading: 'In from a spreadsheet',
        text: 'Three ways in, all producing an ordinary table block you can edit rather than an attachment: Symbols → Paste a spreadsheet range turns whatever is on the clipboard into one — Excel and Google Sheets both copy tab-separated text — the Table button opens a CSV, and dropping a .csv straight onto the editor does the same. Excel\'s own .xlsx is not read: save it as CSV first, because guessing at a workbook is how you get a table of wrong numbers. Retyping twenty rows of section properties was the most tedious thing about starting a sheet.',
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
      {
        id: 'k-palette',
        code: '/',
        summary: 'On an empty line: a list of every construct, inserted for you.',
        detail:
          'The palette is this page with the prose taken out. Type a word after the slash to narrow it — "table", "tolerance", "unknowns" — and what gets inserted is the line with its fields laid out, which you tab through. It is the fastest way to use something you have read about here once and cannot quite remember.',
        keywords: ['palette', 'slash', 'insert', 'snippet', 'template', 'command'],
      },
      {
        id: 'k-palette-key',
        code: 'Cmd/Ctrl + Enter',
        summary: 'The same palette, without typing the slash first.',
      },
      {
        id: 'k-commands',
        code: 'Cmd/Ctrl + K',
        summary: 'Everything the app can do, searchable.',
        detail:
          'The other half of the slash palette: that one writes a line, this one runs the app. Switch to any sheet or project by name, print, share, export, sign, open any panel. Nothing lives only here — everything in it is a button somewhere too.',
        keywords: ['command palette', 'actions', 'switch sheet', 'go to', 'cmd k'],
      },
      {
        id: 'k-find',
        code: 'Cmd/Ctrl + F',
        summary: 'Find and replace inside the sheet.',
        detail:
          'Renaming a symbol across two hundred lines is find and replace, and until there was one the only option was to do it by eye. The Symbols panel answers the other half of the same question: click a name there to jump to the line that defines it, and the names in its dependency list jump too.',
        keywords: ['find', 'search', 'replace', 'rename', 'jump to definition'],
      },
      {
        id: 'k-new',
        code: 'Alt + N',
        summary: 'New sheet in this project. On a Mac, Control + Option + N.',
        detail:
          'The shortcuts below use Alt on Windows and Linux, and Control + Option on a Mac — where Option on its own is how you type π, ß and ≤, so it cannot be a shortcut. Everything they do is also in the ⌘K palette, which is the same on every machine.',
        keywords: ['alt', 'option', 'control', 'mac', 'shortcut', 'genväg'],
      },
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
