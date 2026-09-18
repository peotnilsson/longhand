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
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete'
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint'
import { BUILTIN_NAMES, unitNames, type Line } from './engine'

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
        (result.kind === 'calc' || result.kind === 'definition') &&
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

const completion = autocompletion({
  override: [
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
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    backgroundColor: 'var(--hover)',
    color: 'var(--ink)',
  },
})

export function Editor({
  value,
  results,
  onChange,
}: {
  value: string
  results: Line[]
  onChange: (next: string) => void
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
