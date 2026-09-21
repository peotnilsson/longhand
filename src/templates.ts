/**
 * The example project a browser that has never opened Longhand is given.
 *
 * A blank sheet is the worst first impression a calculation tool can make:
 * everything it can do is invisible, and the first thing you have to do is
 * remember syntax you have never seen. So the first thing anyone sees is a
 * project of finished sheets — short ones, each showing a different way of
 * working — with "Start here" open.
 *
 * They are examples, not a wizard. Adding a sheet gives you an empty one, the
 * way it always did; these are here to be read, copied from and deleted.
 */
export interface Example {
  id: string
  /** The sheet's name in the sidebar. */
  name: string
  /** One line: what this one shows. */
  summary: string
  source: string
}

const TOUR_SOURCE = `# Beam check - section A-A

// Inputs, with manufacturing tolerances
b     = 300 mm +- 2 mm
h     = 500 mm +- 3 mm
M_Ed  = 250 kN*m
f_ck  = 30 MPa

// Results keep the units you wrote: mm*mm^2 stays mm^3,
// and a moment stays kN*m instead of collapsing into kJ
W     = b*h^2/6
sigma = M_Ed/W

// A check renders as a verdict with the margin
sigma <= f_ck

// Your own functions
A_circle(d) = pi*d^2/4
A_bar = A_circle(20 mm)

// A table checks many sections at once
table
  section | bw     | hw     | Wt = bw*hw^2/6 | st = M_Ed/Wt | ok = st <= f_ck
  A       | 300 mm | 500 mm
  B       | 250 mm | 450 mm
  C       | 200 mm | 350 mm
end

// The other question: what width would just about do?
b_req = solve sigma = f_ck for b

// A named table becomes data you can read between the rows of
table steel
  profile | h      | A
  IPE200  | 200 mm | 2850 mm^2
  IPE300  | 300 mm | 5380 mm^2
  IPE400  | 400 mm | 8450 mm^2
end

A_250 = interp(250 mm, steel.h, steel.A)
A_300 = lookup("IPE300", steel.profile, steel.A)

// And a sweep shows sensitivity
plot sigma vs b from 200 mm to 400 mm
`

const STARTER_SOURCE = `# Start here

// Longhand reads a sheet top to bottom, one line at a time. Edit anything
// and the page redraws as you type. Nothing you write leaves this browser.

## Inputs

b     = 300 mm
h     = 500 mm
M_Ed  = 250 kN*m
f_yd  = 235 MPa

## Calculation

// A formula prints three times: as symbols, with your numbers substituted
// in, and as the result. That middle line is what makes a calculation
// checkable by eye.

W     = b*h^2/6
sigma = M_Ed/W  -> MPa

## Check

// A comparison becomes a verdict, with the margin worked out for you.

sigma <= f_yd

// Try it: change h to 400 mm and watch the check fail.

## What else

// Press / on an empty line for the full list of things you can write —
// tables, your own functions, plots, tolerances, solving backwards.
`

const STUDY_SOURCE = `# Parameter study

M_Ed = 250 kN*m
f_yd = 235 MPa

// One row per case, one column per quantity. A column with an "=" in its
// heading is worked out for every row.

table
  case | bw     | hw     | Wt = bw*hw^2/6 | st = M_Ed/Wt | ok = st <= f_yd
  A    | 300 mm | 500 mm
  B    | 250 mm | 450 mm
  C    | 200 mm | 350 mm
end

// And the same question drawn rather than tabulated:

b = 300 mm
h = 500 mm
W = b*h^2/6
sigma = M_Ed/W

plot sigma vs b from 200 mm to 400 mm
`

const MEASUREMENT_SOURCE = `# Measured quantity

// A value written with a tolerance carries it downwards: every result
// below shows its own uncertainty, and the panel says which measurement
// is responsible for most of it.

d     = 20.0 mm +- 0.1 mm
L     = 1.200 m +- 2 mm
F     = 12.4 kN +- 0.2 kN

A     = pi*d^2/4
sigma = F/A       -> MPa
eps   = 0.0012

E     = sigma/eps -> GPa
`

const DESIGN_SOURCE = `# Sizing to a limit

// The reverse question: not "is this section big enough" but "what is the
// smallest one that works".

M_Ed = 250 kN*m
f_yd = 235 MPa
h    = 500 mm

b     = 300 mm
W     = b*h^2/6
sigma = M_Ed/W

b_calc = solve sigma = f_yd for b

// Round up to something you can actually order, then check the rounded
// section rather than the exact one.

b_req = b_calc  -> ceil 10 mm
W_req = b_req*h^2/6
s_req = M_Ed/W_req  -> MPa

s_req <= f_yd
`

export const EXAMPLE_SHEETS: Example[] = [
  {
    id: 'starter',
    name: 'Start here',
    summary: 'A short worked check, with the language explained as it goes.',
    source: STARTER_SOURCE,
  },
  {
    id: 'study',
    name: 'Parameter study',
    summary: 'A table of cases and a plot of one input against the result.',
    source: STUDY_SOURCE,
  },
  {
    id: 'measurement',
    name: 'Measured quantity',
    summary: 'Values with tolerances, propagated to the answer.',
    source: MEASUREMENT_SOURCE,
  },
  {
    id: 'design',
    name: 'Sizing to a limit',
    summary: 'Solve backwards for a dimension, round it to stock, re-check.',
    source: DESIGN_SOURCE,
  },
  {
    id: 'tour',
    name: 'Everything at once',
    summary: 'The demonstration sheet: tables, functions, solving, plots.',
    source: TOUR_SOURCE,
  },
]

/** The sheet that is open when the project appears. */
export const STARTER = EXAMPLE_SHEETS[0]

/** The name of the project they all live in. */
export const EXAMPLE_PROJECT = 'Example project'

/** What "+ Sheet" gives you: a clean page with a title to overwrite. */
export const BLANK_SHEET = '# New calculation\n\n'

export const findExampleSheet = (id: string): Example | undefined =>
  EXAMPLE_SHEETS.find((example) => example.id === id)
