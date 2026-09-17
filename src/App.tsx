import { useMemo, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { evaluateSheet, type Line } from './engine'
import './App.css'

const EXAMPLE = `# Beam check - section A-A

// Inputs
b     = 300 mm
h     = 500 mm
M_Ed  = 250 kN*m      -> kN*m
f_ck  = 30 MPa

// Section modulus and bending stress
W     = b*h^2/6       -> mm^3
sigma = M_Ed/W        -> MPa

// Utilisation
util  = sigma/f_ck

// Try breaking it - this is a dimension error:
// wrong = b + M_Ed
`

function Rendered({ line }: { line: Line }) {
  if (line.kind === 'blank') return <div className="blank" />

  if (line.kind === 'heading') {
    return <h2 className={`heading h${line.level}`}>{line.text}</h2>
  }

  if (line.kind === 'prose') {
    return <p className="prose">{line.text}</p>
  }

  if (line.kind === 'error') {
    return (
      <div className="error">
        <code>{line.source}</code>
        <span className="error-message">{line.message}</span>
      </div>
    )
  }

  const html = katex.renderToString(line.tex, {
    displayMode: true,
    throwOnError: false,
  })
  return <div className="calc" dangerouslySetInnerHTML={{ __html: html }} />
}

export default function App() {
  const [source, setSource] = useState(EXAMPLE)
  const lines = useMemo(() => evaluateSheet(source), [source])

  return (
    <div className="app">
      <div className="editor-pane">
        <div className="pane-label">Source</div>
        <textarea
          className="editor"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          spellCheck={false}
        />
      </div>

      <div className="output-pane">
        <div className="pane-label no-print">Calculation</div>
        <div className="sheet">
          {lines.map((line, index) => (
            <Rendered key={index} line={line} />
          ))}
        </div>
      </div>
    </div>
  )
}
