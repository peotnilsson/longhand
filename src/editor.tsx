import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import {
  autocompletion,
  snippetCompletion,
  startCompletion,
  type CompletionContext,
} from '@codemirror/autocomplete'
import { keymap } from '@codemirror/view'
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint'
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search'
import { BUILTIN_NAMES, unitNames, type Line } from './engine'
import { filterPalette, paletteAt } from './palette'
import { track } from './analytics'

const KEYWORDS = ['table', 'end', 'plot', 'import', 'solve', 'for', 'vs', 'from', 'to']

/** A deliberately small tokenizer — this is a calculation sheet, not a language. */
const sheetLanguage = StreamLanguage.define<{ afterNumber: boolean }>({
  name: 'longhand',
  startState: () => ({ afterNumber: false }),
  token(stream, state) {
    if (stream.sol()) {
      state.afterNumber = false
      if (stream.match(/^\s*#.*/)) return 'heading'
    }
    if (stream.match('//')) {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.match(/^->/) || stream.match(/^(?:\u00b1|\+-)/)) {
      state.afterNumber = false
      return 'operator'
    }
    if (stream.match(/^"[^"]*"/)) return 'string'
    if (stream.match(new RegExp(`^\\b(?:${KEYWORDS.join('|')})\\b`))) {
      state.afterNumber = false
      return 'keyword'
    }
    if (stream.match(/^\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/)) {
      state.afterNumber = true
      return 'number'
    }
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      // An identifier straight after a number is a unit: "300 mm", "250 kN*m".
      // Anywhere else it is a variable, so a beam height h is not read as hours.
      return state.afterNumber ? 'unit' : 'variableName'
    }
    if (stream.match(/^[=,()|]/)) {
      state.afterNumber = false
      return 'operator'
    }
    if (stream.match(/^[-+*/^]/)) return 'operator'
    stream.next()
    return null
  },
  tokenTable: { unit: tags.unit },
})

class ResultWidget extends WidgetType {
  text: string
  tone: string

  constructor(text: string, tone: string) {
    super()
    this.text = text
    this.tone = tone
  }

  eq(other: ResultWidget) {
    return other.text === this.text && other.tone === this.tone
  }

  toDOM() {
    const span = document.createElement('span')
    span.className = `cm-result ${this.tone}`.trim()
    span.textContent = this.text
    return span
  }

  ignoreEvent() {
    return true
  }
}

function buildDecorations(view: EditorView, results: Line[]): DecorationSet {
  const decorations = []
  for (let number = 1; number <= view.state.doc.lines; number += 1) {
    const result = results[number - 1]
    if (!result) continue

    let text = ''
    let tone = ''
    if (result.kind === 'calc') text = result.summary
    else if (result.kind === 'check') {
      text = result.summary
      tone = result.pass ? 'pass' : 'fail'
    } else if (
      result.kind === 'definition' ||
      result.kind === 'table' ||
      result.kind === 'plot'
    ) {
      text = result.summary
    }
    if (!text) continue

    const line = view.state.doc.line(number)
    decorations.push(
      Decoration.widget({ widget: new ResultWidget(text, tone), side: 1 }).range(line.to),
    )
  }
  return Decoration.set(decorations)
}

/** Shows each line's result greyed at the end of the line, like a REPL. */
const inlineResults = (results: Line[]) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, results)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = buildDecorations(update.view, results)
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  )

const errorGutter = (results: Line[]) =>
  linter((view) => {
    const diagnostics: Diagnostic[] = []
    for (let number = 1; number <= view.state.doc.lines; number += 1) {
      const result = results[number - 1]
      if (!result) continue
      const line = view.state.doc.line(number)

      if (result.kind === 'error') {
        diagnostics.push({
          from: line.from,
          to: line.to,
          severity: 'error',
          message: result.message,
        })
      } else if (
        (result.kind === 'calc' || result.kind === 'definition' || result.kind === 'table') &&
        result.warning
      ) {
        diagnostics.push({
          from: line.from,
          to: line.to,
          severity: 'warning',
          message: result.warning,
        })
      }
    }
    return diagnostics
  })


/**
 * The `/` palette: every construct in the language, one keystroke from an
 * empty line.
 *
 * It only offers itself where a new line could begin, so a division sign in
 * the middle of a formula is left alone and `//` — a comment — is not a
 * palette at all, because the second slash is not a letter.
 *
 * Choosing an item inserts a snippet with tab-through fields, which is the
 * part that matters: seeing `interp2` in a list tells you it exists, and
 * getting its five arguments laid out in order tells you how to use it
 * without leaving the sheet.
 */
const paletteSource = (context: CompletionContext) => {
  const line = context.state.doc.lineAt(context.pos)
  const before = line.text.slice(0, context.pos - line.from)
  const at = paletteAt(before)
  if (!at) return null

  // Our own filtering rather than CodeMirror's, which only ever sees the
  // label: "/goal seek" has to find solve, and the words that make that work
  // are in the documentation, not in the name.
  const shown = filterPalette(at.query)

  return {
    from: line.from + at.from,
    filter: false,
    options: shown.map((item, index) => {
      const option = snippetCompletion(item.template, {
        label: `/${item.label}`,
        info: item.summary,
        type: 'keyword',
        // Reading order, not alphabetical: the palette is the reference page
        // with the prose taken out, and that order was chosen for a reason.
        boost: shown.length - index,
      })
      const insert = option.apply as (
        view: EditorView,
        completion: typeof option,
        from: number,
        to: number,
      ) => void
      // Counted without saying which one: whether the palette is used at all
      // is the question, and a construct name is closer to the sheet than
      // anything else we send.
      return {
        ...option,
        apply: (view: EditorView, completion: typeof option, from: number, to: number) => {
          track('palette used')
          insert(view, completion, from, to)
        },
      }
    }),
  }
}

const completion = autocompletion({
  override: [
    paletteSource,
    (context: CompletionContext) => {
      const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*$/)
      if (!word || (word.from === word.to && !context.explicit)) return null

      const defined = new Set<string>()
      const text = context.state.doc.toString()
      for (const match of text.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(|=)/gm)) {
        defined.add(match[1])
      }

      return {
        from: word.from,
        options: [
          ...[...defined].map((label) => ({ label, type: 'variable', boost: 2 })),
          ...KEYWORDS.map((label) => ({ label, type: 'keyword', boost: 1 })),
          ...BUILTIN_NAMES.map((label) => ({ label, type: 'function', boost: 1 })),
          ...unitNames().map((label) => ({ label, type: 'constant' })),
        ],
      }
    },
  ],
})

/**
 * Find and replace, with the panel at the top of the editor.
 *
 * "Where was `f_yd` defined" and "rename every `gamma_M0` to `gamma_M1`" are
 * both questions you ask constantly on a long sheet and could not ask here at
 * all. CodeMirror's own search is exactly right for it, and putting the panel
 * at the top keeps it away from the results that run down the right.
 */
const findAndReplace = [
  search({ top: true }),
  highlightSelectionMatches(),
  keymap.of(searchKeymap),
]

/** Ctrl/Cmd-Enter opens the palette wherever the cursor is, slash or not. */
const paletteKeys = keymap.of([
  {
    key: 'Mod-Enter',
    run: (view) => {
      const line = view.state.doc.lineAt(view.state.selection.main.head)
      const before = line.text.slice(0, view.state.selection.main.head - line.from)
      if (!/^\s*$/.test(before)) return false
      view.dispatch({ changes: { from: view.state.selection.main.head, insert: '/' },
        selection: { anchor: view.state.selection.main.head + 1 } })
      startCompletion(view)
      return true
    },
  },
])

/**
 * Restrained but real colour: enough to tell a unit from a variable at a
 * glance, nothing decorative. The values are CSS variables so a single
 * highlight style serves both themes.
 */
const highlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--syn-heading)', fontWeight: '600' },
  { tag: tags.comment, color: 'var(--syn-comment)' },
  { tag: tags.keyword, color: 'var(--syn-keyword)', fontWeight: '600' },
  { tag: tags.number, color: 'var(--syn-number)' },
  { tag: tags.unit, color: 'var(--syn-unit)' },
  { tag: tags.string, color: 'var(--syn-string)' },
  { tag: tags.operator, color: 'var(--syn-operator)' },
  { tag: tags.variableName, color: 'var(--syn-variable)' },
])

const theme = EditorView.theme({
  '&': { fontSize: '14px', backgroundColor: 'var(--editor-bg)', color: 'var(--ink)' },
  '.cm-scroller': { backgroundColor: 'var(--editor-bg)' },
  '.cm-content': {
    fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
    padding: '12px 0',
    caretColor: 'var(--ink)',
  },
  '.cm-line': { lineHeight: '2', padding: '0 12px' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: 'var(--faint)' },
  '.cm-activeLine': { backgroundColor: 'var(--hover)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-cursor': { borderLeftColor: 'var(--ink)' },
  '.cm-result': {
    marginLeft: '1.5em',
    padding: '0 6px',
    borderRadius: '4px',
    fontSize: '12px',
    color: 'var(--faint)',
    backgroundColor: 'var(--chip-bg)',
  },
  '.cm-result.pass': { color: 'var(--pass)', backgroundColor: 'var(--pass-bg)' },
  '.cm-result.fail': { color: 'var(--error)', backgroundColor: 'var(--error-bg)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-tooltip': {
    backgroundColor: 'var(--paper)',
    border: '1px solid var(--rule)',
    color: 'var(--ink)',
  },
  '.cm-panels': { backgroundColor: 'var(--paper)', color: 'var(--ink)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--rule)' },
  '.cm-panel.cm-search': { padding: '6px 8px', fontSize: '12px' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': {
    font: 'inherit',
    color: 'var(--ink)',
    backgroundColor: 'var(--editor-bg)',
    border: '1px solid var(--rule)',
    borderRadius: '4px',
    padding: '2px 6px',
  },
  '.cm-panel.cm-search label': { color: 'var(--muted)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--chip-bg)' },
  '.cm-searchMatch': { backgroundColor: 'var(--chip-bg)', outline: '1px solid var(--rule)' },
  '.cm-searchMatch-selected': { backgroundColor: 'var(--pass-bg)' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--hover)',
    color: 'var(--ink)',
  },
})

export function Editor({
  value,
  results,
  onChange,
  readOnly = false,
  onReady,
}: {
  value: string
  results: Line[]
  onChange: (next: string) => void
  /** A shared link opens the sheet to be read, not edited. */
  readOnly?: boolean
  /** Hands the view out so the app can insert a line where the cursor is. */
  onReady?: (view: EditorView) => void
}) {
  const extensions = useMemo(
    () => [
      sheetLanguage,
      syntaxHighlighting(highlight),
      theme,
      // A formula should never need horizontal scrolling to read, and an
      // unwrapped line widens the whole grid past a phone viewport.
      EditorView.lineWrapping,
      completion,
      paletteKeys,
      findAndReplace,
      lintGutter(),
      errorGutter(results),
      inlineResults(results),
    ],
    [results],
  )

  return (
    <CodeMirror
      className="editor"
      value={value}
      onChange={onChange}
      extensions={extensions}
      readOnly={readOnly}
      onCreateEditor={(view) => onReady?.(view)}
      theme="none"
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        autocompletion: false,
        highlightActiveLine: true,
        bracketMatching: true,
        closeBrackets: false,
      }}
    />
  )
}
