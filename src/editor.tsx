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
import { StreamLanguage } from '@codemirror/language'
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete'
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint'
import { unitNames, type Line } from './engine'

const KEYWORDS = ['table', 'end', 'plot', 'import', 'vs', 'from', 'to']

/** A deliberately small tokenizer — this is a calculation sheet, not a language. */
const sheetLanguage = StreamLanguage.define({
  name: 'longhand',
  token(stream) {
    if (stream.sol() && stream.match(/^\s*#.*/)) return 'heading'
    if (stream.match('//')) {
      stream.skipToEnd()
      return 'comment'
    }
    if (stream.match(/^->/) || stream.match(/^(?:±|\+-)/)) return 'operator'
    if (stream.match(/^"[^"]*"/)) return 'string'
    if (stream.match(new RegExp(`^\\b(?:${KEYWORDS.join('|')})\\b`))) return 'keyword'
    if (stream.match(/^\d+(?:\.\d+)?(?:[eE][-+]?\d+)?/)) return 'number'
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) return 'variableName'
    stream.next()
    return null
  },
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
      if (result?.kind !== 'error') continue
      const line = view.state.doc.line(number)
      diagnostics.push({
        from: line.from,
        to: line.to,
        severity: 'error',
        message: result.message,
      })
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
          ...unitNames().map((label) => ({ label, type: 'constant' })),
        ],
      }
    },
  ],
})

const theme = EditorView.theme({
  '&': { fontSize: '14px', backgroundColor: 'transparent' },
  '.cm-content': { fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', padding: '12px 0' },
  '.cm-line': { lineHeight: '2', padding: '0 12px' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', color: '#b8b5ae' },
  '.cm-activeLine': { backgroundColor: 'rgba(0,0,0,0.025)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-result': {
    marginLeft: '1.5em',
    padding: '0 6px',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#8a8780',
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  '.cm-result.pass': { color: '#1b6e3c', backgroundColor: 'rgba(27,110,60,0.08)' },
  '.cm-result.fail': { color: '#b3261e', backgroundColor: 'rgba(179,38,30,0.08)' },
  '&.cm-focused': { outline: 'none' },
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
    () => [sheetLanguage, theme, completion, lintGutter(), errorGutter(results), inlineResults(results)],
    [results],
  )

  return (
    <CodeMirror
      className="editor"
      value={value}
      onChange={onChange}
      extensions={extensions}
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
