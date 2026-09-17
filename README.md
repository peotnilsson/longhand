# Longhand

An engineering calculation sheet in the browser. Write maths in plain text with units;
it evaluates, checks that dimensions are consistent, and renders each line the way an
engineer writes it on paper: formula, then numbers substituted in, then the result.

## Run it

You need Node.js installed (nodejs.org, LTS version).

```bash
npm install
npm run dev
```

Open the URL it prints (usually http://localhost:5173). Edit the left pane; the right
pane updates as you type.

To get a PDF: `Cmd/Ctrl + P`. The print stylesheet hides the editor pane.

## Syntax

```
# Heading
## Smaller heading
// A line of prose

b     = 300 mm          assignment with units
W     = b*h^2/6         formula using earlier values
sigma = M_Ed/W  -> MPa  force the display unit
```

Anything mathjs can parse works: `sqrt`, `sin`, `log`, `pi`, `e`, powers, parentheses.
Symbol names with underscores become subscripts (`M_Ed` renders as M with subscript Ed).
Greek names become Greek letters (`sigma`, `alpha`, `Delta`).

## How it works

Three files matter.

- `src/engine.ts` — the whole product. Parses each line with mathjs, evaluates it against
  a shared scope, then renders three stages: the symbolic formula, the same expression tree
  with every symbol replaced by its value, and the result. That middle stage is the point:
  it makes a calculation checkable by eye.
- `src/App.tsx` — two panes, KaTeX rendering, nothing clever.
- `src/App.css` — including the print stylesheet, because a calculation sheet is a document.

## Syntax

```
# Heading                      ## smaller heading
// prose

b      = 300 mm                assignment with units
b      = 300 mm +- 2 mm        with a tolerance (or the ± character)
W      = b*h^2/6               formula; result keeps the units you wrote
sigma  = M_Ed/W  -> MPa        -> forces a display unit
sigma <= f_ck                  a check: renders OK / NOT OK with the margin
A(d)   = pi*d^2/4              your own function
import "steel-formulas"        pull in another sheet's definitions

table                          one row per case, computed columns carry formulas
  section | bw     | hw     | Wt = bw*hw^2/6 | ok = M_Ed/Wt <= f_ck
  A       | 300 mm | 500 mm
  B       | 250 mm | 450 mm
end

plot sigma vs b from 200 mm to 400 mm
```

## How it works

- `src/engine/units.ts` — units as written. mathjs keeps the unit list but simplifies it
  for display, turning 250 kN*m into 250 kJ. We read it back and display in the units the
  user typed, unless they are *incoherent* (mixing m and mm, as a stress does) or land the
  number at an unreadable magnitude — then mathjs's own choice is better.
- `src/engine/uncertainty.ts` — first-order propagation. Partial derivatives are taken
  symbolically with mathjs `derivative()`, then combined in quadrature (statistical) or as
  an absolute sum (worst case). Contribution shares are shares of variance in quadrature
  mode, so they sum to 100%.
- `src/engine/tex.ts` — rendering. Variables italic, units upright, real subscripts.
- `src/engine/sheet.ts` — the language: assignments, checks, function definitions, tables,
  plots, imports. Also the incremental cache: evaluation is strictly sequential, so
  everything above the first edited line is reused, clamped back to the start of any
  `table` block. Verified equal to a cold run on every edit shape.
- `src/editor.tsx` — CodeMirror: highlighting, error gutter, inline results, autocomplete.
- `src/Plot.tsx` — hand-written SVG. No charting library.

## Still to do

1. **Page numbering.** "Page 3 of 7" needs Paged.js; browsers cannot put counters in
   `@page` margin boxes. Left out deliberately — Paged.js rewrites the DOM and fights a
   live React tree, so it wants its own print-only view rather than a bolt-on.
2. **Table cell units as TeX.** Table cells are plain text, so they read `mm^3` rather
   than mm³.
3. **Correlated inputs.** Propagation assumes independence, which is the usual assumption
   but not always the right one.
4. **Plot: multiple series, log axes, shaded tolerance bands.**
5. **Cloud sync, sharing, collaboration.** Only once someone asks.

## Rules

- Use it for your own coursework every week. The day you stop reaching for it, something is wrong.
- Never build a feature you have not personally needed.
