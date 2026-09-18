# Longhand

An engineering calculation sheet in the browser. Write maths in plain text with units; it
evaluates, checks that dimensions are consistent, and renders each line the way an engineer
writes it on paper: formula, then the numbers substituted in, then the result.

Live: https://longhand-six.vercel.app

## Run it

You need Node.js installed (nodejs.org, LTS version).

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # the engine and store tests
npm run build   # production build, what Vercel runs
```

Edit the left pane; the right pane updates as you type. `Cmd/Ctrl + P` prints the sheet —
the print stylesheet hides the editor, because a calculation sheet is a document.

## Projects and sheets

A project is what an engineer actually delivers: several sheets sharing one title block,
printed as one package with "Sheet 2 of 5" on each. Sheets carry no metadata of their
own — the title block belongs to the project.

Everything lives in `localStorage` under `longhand:store`. There is no account and no
server. That means two things worth knowing: a cleared browser is a lost sheet, so
Settings → Data exports the whole store as JSON and tells you how old the last backup is;
and a save that fails (private mode, quota) now says so in a banner instead of letting you
carry on typing into nothing.

`import "Other sheet"` pulls in the definitions from another sheet in the same project, by
name — so two sheets with the same name shadow each other. The project panel warns when
that happens.

Deleting a sheet asks twice and then lands you on the sheet *above* it, so clearing several
is press, confirm, press, confirm without the button moving under your hand. The last sheet
in a project will not delete.

The frame is fixed and the contents scroll inside it: the sidebar, the toolbar and an open
panel stay put while the code and the document scroll on their own, each in its own pane.
The button of an open panel stays outlined, so the toolbar says which one is showing.
Handing the editor a definite height also hands scrolling to CodeMirror, which then renders
only the lines in view — a 200-line sheet builds 41 lines of DOM instead of 201.

The Help panel in the toolbar is the syntax reference, and adds a worked example sheet on
request. The profile button at the foot of the sidebar holds your name — which goes in the
title block of new projects — and says plainly what an account would be for, since there
isn't one.

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
import "Loads"                 pull in another sheet's definitions

table                          one row per case, computed columns carry formulas
  section | bw     | hw     | Wt = bw*hw^2/6 | ok = M_Ed/Wt <= f_ck
  A       | 300 mm | 500 mm
  B       | 250 mm | 450 mm
end

plot sigma vs b from 200 mm to 400 mm
```

Anything mathjs can parse works: `sqrt`, `sin`, `log`, `pi`, `e`, powers, parentheses.
Underscores become subscripts (`M_Ed` renders as M with subscript Ed); Greek names become
Greek letters (`sigma`, `alpha`, `Delta`).

## How it works

- `src/engine/units.ts` — units as written. mathjs keeps the unit list but simplifies it
  for display, turning 250 kN*m into 250 kJ. We read it back and show the units you typed,
  unless they are *incoherent* (mixing m and mm, as a stress does) or the number lands at
  an unreadable magnitude — then mathjs's own choice is better. `formatColumn` does the
  same job for a whole table column at once, so a column shares one unit, one notation and
  one decimal count, and whole numbers stay whole: nobody writes a 300 mm width as 300.0.
- `src/engine/uncertainty.ts` — first-order propagation. Partial derivatives are taken
  symbolically with mathjs `derivative()`, then combined in quadrature (statistical) or as
  an absolute sum (worst case). Contribution shares are shares of variance in quadrature
  mode, so they sum to 100%.
- `src/engine/tex.ts` — rendering. Variables italic, units upright, real subscripts. A
  formatted number is carried into TeX exactly as it was formatted rather than re-rendered
  by mathjs, which had a second opinion about notation — so a value and its ± never appear
  in two different forms on the same line. Scientific notation starts at 1e5, everywhere.
- `src/engine/sheet.ts` — the language: assignments, checks, function definitions, tables,
  plots, imports, forward-reference and redefinition warnings. Also the incremental cache:
  evaluation is strictly sequential, so everything above the first edited line is reused,
  clamped back to the start of any `table` block. Tested equal to a cold run on every edit
  shape.
- `src/store.ts` — projects, sheets, settings, and the migration that reads every shape
  ever written to disk. It never throws and never returns an empty store, because losing
  someone's calculations to a failed migration is the worst bug this app could have.
- `src/editor.tsx` — CodeMirror: highlighting, error gutter, inline results, autocomplete.
- `src/Plot.tsx` — hand-written SVG. No charting library.
- `src/App.tsx` — the two panes, the sidebar, the panels, KaTeX.

## Speed

`node perf.mjs` (after `npx esbuild src/engine/index.ts --format=esm --outfile=eng.mjs
--bundle --external:mathjs`) measures the engine on a sheet of nothing but tolerance
propagation, which is the expensive case:

```
 123 lines | cold 355ms | edit near end 2ms | edit at top 170ms
 363 lines | cold 630ms | edit near end 2ms | edit at top 523ms
 603 lines | cold 988ms | edit near end 2ms | edit at top 740ms
```

The cache is what matters: the ordinary edit is 2ms at any length. The worst case — an edit
on the first line of a 600-line sheet — is still most of a second, so the app evaluates
`useDeferredValue(source)`. Typing renders immediately and the results catch up in a pass
React is allowed to abandon, dimmed while they are behind.

## Still to do

1. **Page numbering.** "Page 3 of 7" needs Paged.js; browsers cannot put counters in
   `@page` margin boxes. Left out deliberately — Paged.js rewrites the DOM and fights a
   live React tree, so it wants its own print-only view rather than a bolt-on.
2. **Autosave to a real file.** The File System Access API can write to a chosen `.lh` file,
   which would end the localStorage worry, but it needs a user gesture plus a handle kept
   in IndexedDB and cannot be verified headlessly. Worth doing carefully, by hand.
3. **Correlated inputs.** Propagation assumes independence, which is the usual assumption
   but not always the right one.
4. **Plot: multiple series, log axes, shaded tolerance bands.**
5. **Keyboard shortcuts** for new sheet, print, and switching sheets.
6. **Cloud sync, sharing, collaboration.** Only once someone asks.

## Rules

- Use it for your own coursework every week. The day you stop reaching for it, something is wrong.
- Never build a feature you have not personally needed.
- Show it to one engineer who is not you. Nothing here is proven until then.
