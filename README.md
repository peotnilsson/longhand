# Calcsheet

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

## Known problems worth solving (this is the roadmap)

1. **Moments become energy.** `250 kN*m` is stored by mathjs as `250 kJ`, because a newton-metre
   and a joule are dimensionally identical. An engineer never wants to see a bending moment
   written in kilojoules. Fixing this properly means tracking *engineering quantity kind*
   (moment, torque, energy, stress) alongside SI dimension — something no general-purpose
   maths library does, and one of the real reasons this product can be better than the
   incumbents rather than merely prettier.
2. **Number formatting.** `1.25e+7 mm^3` should read `12.5 · 10^6 mm³` or be auto-scaled to a
   sensible prefix. Engineers have conventions here and nobody follows them.
3. **No dependency graph.** Lines are evaluated top to bottom on every keystroke. Fine now,
   too slow for a 500-line sheet, and it can't tell you what depends on what.
4. **No tolerances.** `b = 300 mm ± 2 mm` propagating through to the result, plus a sensitivity
   breakdown showing which input dominates. This is the feature none of the paid tools have.
5. **No persistence.** Save and load `.calc` files, autosave to localStorage.
6. **Editor is a textarea.** Swap in CodeMirror 6 for syntax highlighting and error gutters.
7. **Report furniture.** Title block, author, date, revision, page numbers in the print output.

## Rules

- Use it for your own coursework every week. The day you stop reaching for it, something is wrong.
- Never build a feature you have not personally needed.
- v1 has no accounts, no cloud, no collaboration, no plotting, no matrices. Keep it that way
  until real users ask.
