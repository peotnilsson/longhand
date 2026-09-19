# Longhand

An engineering calculation sheet in the browser. Write maths in plain text with units; it
evaluates, checks that dimensions are consistent, and renders each line the way an engineer
writes it on paper: formula, then the numbers substituted in, then the result.

Live: https://longhand-six.vercel.app — the landing page at `/`, the tool at `/app`, the
reference at `/docs`, the verification suite at `/verification`, the privacy note at
`/privacy`.

## Run it

You need Node.js installed (nodejs.org, LTS version).

```bash
npm install
npm run dev     # http://localhost:5173 (landing), /app, /docs
npm test        # the engine, store and documentation tests
npm run build   # production build, what Vercel runs
npm run verify  # the browser pass: build, run `npx vite preview --port 4173`, then this
```

Five pages are built from one project: `index.html` is the landing page, `app.html` the
tool, `docs.html` the reference, `verification.html` the verification suite and
`privacy.html` the privacy note. `vite.config.ts` rewrites the clean URLs in dev and
preview so local URLs match what `vercel.json`'s `cleanUrls` serves in production.

Every push runs the same three commands in GitHub Actions (`.github/workflows/ci.yml`):
lint, tests, build, then the Playwright pass against a preview server.

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

Deleting is undoable: a bar offers to put the sheet — or the whole project, with its
sheets — back where it was. Settings → Data can also **keep a copy on disk**: choose a file
once and every change is written to it, which is the answer to a cleared browser. Chrome and
Edge support that; Safari and Firefox do not, and there Export backup is the way.

The Help panel in the toolbar is the syntax reference, and adds a worked example sheet on
request. Alt+N makes a sheet, Alt+[ and Alt+] move between them, Alt+P, Alt+H and Alt+, open
the panels, Cmd/Ctrl+S saves the sheet as a file, and Escape closes whatever is open. The profile button at the foot of the sidebar holds your name — which goes in the
title block of new projects — and says plainly what an account would be for, since there
isn't one.

## The reference is a module, not a page

`src/reference.ts` holds every command, its one-line meaning, the longer explanation and a
runnable example. The docs page renders it, the app's Help button points at that page, and
`src/reference.test.ts` runs every example through the engine. Documentation that is not
run is documentation that is wrong — this arrangement replaced a syntax list written out by
hand in two places, which had already started to drift.

`src/examples.ts` holds four worked calculations — a steel beam against a section table, a
pump duty point that solves Colebrook, a wall U-value with an uncertain insulation
thickness, and a density measurement with its error budget. They are the landing page's
gallery, they open in the app from `/app?example=beam`, and the same test insists each one
evaluates with no errors and lands on its hand-checked numbers.

## Syntax

```
# Heading                      ## smaller heading
// prose

b      = 300 mm                assignment with units
b      = 300 mm  // drawing A-102     a note on the line it explains
b      = 300 mm +- 2 mm        with a tolerance (or the ± character)
W      = b*h^2/6               formula; result keeps the units you wrote
sigma  = M_Ed/W  -> MPa        -> forces a display unit
sigma <= f_ck                  a check: renders OK / NOT OK with the margin
A(d)   = pi*d^2/4              your own function
b_req  = solve sigma = f_ck for b     what b would meet the limit?
import "Loads"                 pull in another sheet's definitions

table                          one row per case, computed columns carry formulas
  section | bw     | hw     | Wt = bw*hw^2/6 | ok = M_Ed/Wt <= f_ck
  A       | 300 mm | 500 mm
  B       | 250 mm | 450 mm
end

table steel                    a named table's columns become data
  profile | h      | A
  IPE200  | 200 mm | 2850 mm^2
  IPE300  | 300 mm | 5380 mm^2
end

A_250 = interp(250 mm, steel.h, steel.A)      read between two rows
A_300 = lookup("IPE300", steel.profile, steel.A)
A_all = sum(steel.A)                          and max, min, mean

plot sigma vs b from 200 mm to 400 mm
```

`solve` is the one that changes what the tool is for. It answers the question an engineer
actually has — not "what stress does this section give" but "what section do I need" —
by varying the value and re-running the lines that depend on it until the two sides meet.
Nothing symbolic: it works for any expression the sheet can evaluate, including one built
through ten intermediate steps. Add `from 100 mm to 900 mm` when it needs telling where
to look.

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
- `src/engine/solve.ts` — bracketing and bisection in whatever units the variable carries.
  The sheet is sequential, so a solve starts from the scope as it stood at the variable's own
  definition and replays only the lines in between: cheap even on a long sheet.
- `src/engine/builtins.ts` — `interp` and `lookup` over a named table's columns. Reading
  outside the table is an error, never an extrapolation: silently extending someone else's
  table past its last row is how wrong numbers get into a calculation.
- `src/engine/sheet.ts` — the language: assignments, checks, function definitions, tables,
  plots, imports, forward-reference and redefinition warnings. Also the incremental cache:
  evaluation is strictly sequential, so everything above the first edited line is reused,
  clamped back to the start of any `table` block. Tested equal to a cold run on every edit
  shape.
- `src/store.ts` — projects, sheets, settings, and the migration that reads every shape
  ever written to disk. It never throws and never returns an empty store, because losing
  someone's calculations to a failed migration is the worst bug this app could have.
- `src/disk.ts` — the File System Access API: a file the user chose, written on every change,
  with the handle kept in IndexedDB so it survives a reload. The permission does not always,
  so there are three states — off, connected, and needs a click to reconnect.
- `src/editor.tsx` — CodeMirror: highlighting, error gutter, inline results, autocomplete.
- `src/Plot.tsx` — hand-written SVG. No charting library.
- `src/App.tsx` — the two panes, the sidebar, the panels, KaTeX.
- `src/reference.ts`, `src/docs/` — the reference content and the page that renders it,
  with a search that matches on what people call things elsewhere (goal seek, vlookup).
- `src/examples.ts`, `src/landing/` — the worked calculations and the landing page.
- `src/theme.css` — the palette, shared by all three pages.

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

## Printing a package

Preview whole project shows every sheet as one document with its title block and "Sheet 2 of
5". **Number the pages** then chops that into real A4 pages, each carrying its sheet's title
as a running header and "Page 3 of 7" at the foot. Browsers cannot put a counter in an
`@page` margin box, so Paged.js does the pagination — against a copy of the rendered
document, because it rewrites what it is given and must not be handed a live React tree. It
loads only when that button is pressed.

## Still to do

1. **Share by link.** The whole sheet compresses into a URL hash, so a link opens someone
   else's calculation with no account and no server. Cheapest possible distribution.
   `/app?example=` is the crude version of it that exists today.
2. **A checks summary** at the top of a printed sheet: every check with its verdict and
   margin, which is the first thing a reviewer looks for.
3. **Correlated inputs.** Propagation assumes independence, which is the usual assumption
   but not always the right one.
4. **Plot: multiple series, log axes, shaded tolerance bands.**
5. **Cloud sync, sharing, collaboration.** Only once someone asks.

## Rules

- Use it for your own coursework every week. The day you stop reaching for it, something is wrong.
- Never build a feature you have not personally needed.
- Show it to one engineer who is not you. Nothing here is proven until then.


## Verification

`src/verification.ts` holds problems whose answers are known before Longhand is asked —
closed-form results and conversions that are exact by definition. Each case is an ordinary
sheet that ends in a check, with the expected value written into it beside a note saying
where that value came from, so "verified" means the sheet ran without errors and every
check in it held.

The suite runs twice: `src/verification.test.ts` runs it on every commit, and `/verification`
runs it in the reader's browser on the build that served the page. A failure there is not a
broken test — it means Longhand has started giving a different answer to a problem whose
answer is known, which is the one class of bug this project cannot ship.

## Sharing

Share compresses the whole sheet — figures, and any sheets it imports — into the link's
fragment, the part of a URL a browser never sends to a server. So a link opens with no
account and nothing uploaded, read-only, with a button to take a copy. The cost is that the
link carries every byte: `src/share.ts` warns past 12,000 characters, where mail clients
start wrapping it.

## Counting

`src/analytics.ts` sends a handful of fixed event names with at most a few short enumerated
labels, and it builds the payload itself rather than loading a third-party script — which is
what guarantees a share link's fragment can never end up in it. It is off unless
`VITE_ANALYTICS_DOMAIN` is set (see `.env.example`), honours Do Not Track and Global Privacy
Control, and has a switch in Settings → Data.

## Licence

MIT — see `LICENSE`. `/privacy` states what is and is not stored, in ordinary words.
