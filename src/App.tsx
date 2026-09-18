import { useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { evaluateSheet, sheetTitle, type Line, type ToleranceMode } from './engine'
import { Editor } from './editor'
import { Plot } from './Plot'
import './App.css'

const EXAMPLE = `# Beam check - section A-A

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

// And a sweep shows sensitivity
plot sigma vs b from 200 mm to 400 mm
`

interface Meta {
  project: string
  author: string
  revision: string
  checkedBy: string
}

interface Sheet {
  id: string
  name: string
  source: string
  meta: Meta
}

type Theme = 'system' | 'light' | 'dark'

interface Settings {
  theme: Theme
  /** Pre-fills the title block of new sheets. */
  author: string
  project: string
}

interface Store {
  sheets: Sheet[]
  activeId: string
  precision: number
  mode: ToleranceMode
  settings: Settings
}

const KEY = 'longhand:store'
const emptyMeta = (): Meta => ({ project: '', author: '', revision: 'A', checkedBy: '' })
const defaultSettings = (): Settings => ({ theme: 'system', author: '', project: '' })
const newId = () => Math.random().toString(36).slice(2, 10)

function loadStore(): Store {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as Store
      if (parsed.sheets?.length) {
        return { ...parsed, settings: { ...defaultSettings(), ...parsed.settings } }
      }
    }
    // migrate the single-sheet version
    const legacy = localStorage.getItem('longhand:source')
    if (legacy) {
      const id = newId()
      return {
        sheets: [{ id, name: sheetTitle(legacy), source: legacy, meta: emptyMeta() }],
        activeId: id,
        precision: 4,
        mode: 'quadrature',
        settings: defaultSettings(),
      }
    }
  } catch {
    /* blocked storage - start fresh */
  }
  const id = newId()
  return {
    sheets: [{ id, name: 'Beam check', source: EXAMPLE, meta: emptyMeta() }],
    activeId: id,
    precision: 4,
    mode: 'quadrature',
    settings: defaultSettings(),
  }
}

const slug = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'calculation'

function Rendered({ line }: { line: Line }) {
  switch (line.kind) {
    case 'blank':
      return <div className="blank" />

    case 'heading':
      return <h2 className={`heading h${line.level}`}>{line.text}</h2>

    case 'prose':
      return <p className="prose">{line.text}</p>

    case 'note':
      return <p className="note">{line.text}</p>

    case 'error':
      return (
        <div className="error">
          <code>{line.source}</code>
          <span className="error-message">{line.message}</span>
        </div>
      )

    case 'definition':
      return (
        <div className="calc-block">
          <Tex tex={line.tex} className="calc definition" />
          {line.warning && <p className="warning">{line.warning}</p>}
        </div>
      )

    case 'check':
      return (
        <div className={`check ${line.pass ? 'pass' : 'fail'}`}>
          <Tex tex={line.tex} className="calc" />
          <div className="verdict">
            <span className="badge">{line.pass ? 'OK' : 'NOT OK'}</span>
            {line.margin && <span className="margin">{line.margin}</span>}
          </div>
        </div>
      )

    case 'table':
      return (
        <div className="table-scroll">
        <table className="sheet-table">
          <thead>
            <tr>
              {line.headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {line.rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className={cell.verdict ?? ''}>
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )

    case 'plot':
      return <Plot data={line.data} />

    case 'calc':
      return (
        <div className="calc-block">
          <Tex tex={line.tex} className="calc" />
          {line.tolerance && (
            <div className="tolerance">
              <span className="sigma">{line.tolerance.text}</span>
              {line.tolerance.contributions.length > 1 && (
                <span className="shares">
                  {line.tolerance.contributions
                    .map((share) => `${share.name} ${Math.round(share.share * 100)}%`)
                    .join(' · ')}
                </span>
              )}
            </div>
          )}
          {line.warning && <p className="warning">{line.warning}</p>}
        </div>
      )
  }
}

function Tex({ tex, className }: { tex: string; className: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: true, throwOnError: false }),
    [tex],
  )
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

export default function App() {
  const [store, setStore] = useState<Store>(loadStore)
  const [panel, setPanel] = useState<'none' | 'meta' | 'settings'>('none')
  const backupInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(store))
    } catch {
      /* blocked storage - the session still works, it just will not persist */
    }
  }, [store])

  useEffect(() => {
    const root = document.documentElement
    if (store.settings.theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', store.settings.theme)
  }, [store.settings.theme])

  const active = store.sheets.find((sheet) => sheet.id === store.activeId) ?? store.sheets[0]

  const libraries = useMemo(() => {
    const map: Record<string, string> = {}
    for (const sheet of store.sheets) {
      if (sheet.id !== active.id) map[sheet.name] = sheet.source
    }
    return map
  }, [store.sheets, active.id])

  const lines = useMemo(
    () =>
      evaluateSheet(active.source, {
        precision: store.precision,
        mode: store.mode,
        libraries,
      }),
    [active.source, store.precision, store.mode, libraries],
  )

  const title = useMemo(() => sheetTitle(active.source), [active.source])

  // The title block already shows the sheet's title, so the heading it came
  // from would print it a second time. Skip that one line only.
  const titleLine = useMemo(
    () => lines.findIndex((line) => line.kind === 'heading' && line.text === title),
    [lines, title],
  )

  const update = (patch: Partial<Sheet>) =>
    setStore((current) => ({
      ...current,
      sheets: current.sheets.map((sheet) =>
        sheet.id === active.id ? { ...sheet, ...patch } : sheet,
      ),
    }))

  const addSheet = () => {
    const id = newId()
    setStore((current) => ({
      ...current,
      activeId: id,
      sheets: [
        ...current.sheets,
        {
          id,
          name: `Sheet ${current.sheets.length + 1}`,
          source: '# New calculation\n\n',
          meta: {
            ...emptyMeta(),
            author: current.settings.author,
            project: current.settings.project,
          },
        },
      ],
    }))
  }

  const duplicateSheet = () => {
    const id = newId()
    setStore((current) => ({
      ...current,
      activeId: id,
      sheets: [...current.sheets, { ...active, id, name: `${active.name} copy` }],
    }))
  }

  const deleteSheet = () => {
    if (store.sheets.length === 1) return
    setStore((current) => {
      const remaining = current.sheets.filter((sheet) => sheet.id !== active.id)
      return { ...current, sheets: remaining, activeId: remaining[0].id }
    })
  }

  const save = () => {
    const url = URL.createObjectURL(new Blob([active.source], { type: 'text/plain' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${slug(title)}.calc`
    link.click()
    URL.revokeObjectURL(url)
  }

  const setSettings = (patch: Partial<Settings>) =>
    setStore((current) => ({ ...current, settings: { ...current.settings, ...patch } }))

  const exportAll = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'longhand-backup.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const importAll = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      try {
        const parsed = JSON.parse(await file.text()) as Store
        if (parsed.sheets?.length) {
          setStore({ ...parsed, settings: { ...defaultSettings(), ...parsed.settings } })
        }
      } catch {
        /* not a backup file - leave everything as it is */
      }
    }
    event.target.value = ''
  }

  const open = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const source = await file.text()
      const id = newId()
      setStore((current) => ({
        ...current,
        activeId: id,
        sheets: [
          ...current.sheets,
          { id, name: file.name.replace(/\.[^.]+$/, ''), source, meta: emptyMeta() },
        ],
      }))
    }
    event.target.value = ''
  }

  return (
    <div className="app">
      <aside className="sheets">
        <div className="sheets-head">
          <span className="brand">Longhand</span>
          <button className="icon" onClick={addSheet} title="New sheet">
            +
          </button>
        </div>
        <ul>
          {store.sheets.map((sheet) => (
            <li key={sheet.id}>
              <button
                className={sheet.id === active.id ? 'sheet current' : 'sheet'}
                onClick={() => setStore((current) => ({ ...current, activeId: sheet.id }))}
              >
                {sheet.name}
              </button>
            </li>
          ))}
        </ul>
        <div className="sheets-foot">
          <button onClick={duplicateSheet}>Duplicate</button>
          <button onClick={deleteSheet} disabled={store.sheets.length === 1}>
            Delete
          </button>
        </div>
      </aside>

      <div className="editor-pane">
        <div className="toolbar">
          <input
            className="sheet-name"
            value={active.name}
            onChange={(event) => update({ name: event.target.value })}
            aria-label="Sheet name"
          />
          <div className="toolbar-actions">
            <button
              className={panel === 'meta' ? 'on' : ''}
              onClick={() => setPanel((current) => (current === 'meta' ? 'none' : 'meta'))}
            >
              Title block
            </button>
            <button
              className={panel === 'settings' ? 'on' : ''}
              onClick={() => setPanel((current) => (current === 'settings' ? 'none' : 'settings'))}
            >
              Settings
            </button>
            <button onClick={() => fileInput.current?.click()}>Open</button>
            <button onClick={save}>Save</button>
            <button onClick={() => window.print()}>Print</button>
            <label className="field">
              sig&nbsp;figs
              <select
                value={store.precision}
                onChange={(event) =>
                  setStore((current) => ({ ...current, precision: Number(event.target.value) }))
                }
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              tolerance
              <select
                value={store.mode}
                onChange={(event) =>
                  setStore((current) => ({
                    ...current,
                    mode: event.target.value as ToleranceMode,
                  }))
                }
              >
                <option value="quadrature">statistical</option>
                <option value="worst">worst case</option>
              </select>
            </label>
          </div>
          <input ref={fileInput} type="file" accept=".calc,.txt,text/plain" onChange={open} hidden />
        </div>

        {panel === 'meta' && (
          <div className="panel meta-editor">
            {(
              [
                ['project', 'Project'],
                ['author', 'Author'],
                ['revision', 'Revision'],
                ['checkedBy', 'Checked by'],
              ] as [keyof Meta, string][]
            ).map(([field, caption]) => (
              <label key={field}>
                {caption}
                <input
                  value={active.meta[field]}
                  onChange={(event) =>
                    update({ meta: { ...active.meta, [field]: event.target.value } })
                  }
                />
              </label>
            ))}
          </div>
        )}

        {panel === 'settings' && (
          <div className="panel settings">
            <label>
              Appearance
              <select
                value={store.settings.theme}
                onChange={(event) => setSettings({ theme: event.target.value as Theme })}
              >
                <option value="system">Follow the system</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <label>
              Your name
              <input
                value={store.settings.author}
                placeholder="goes on new sheets"
                onChange={(event) => setSettings({ author: event.target.value })}
              />
            </label>
            <label>
              Default project
              <input
                value={store.settings.project}
                placeholder="goes on new sheets"
                onChange={(event) => setSettings({ project: event.target.value })}
              />
            </label>
            <div className="settings-data">
              <span className="settings-caption">
                Everything is stored in this browser only.
              </span>
              <div className="settings-buttons">
                <button onClick={exportAll}>Export backup</button>
                <button onClick={() => backupInput.current?.click()}>Restore backup</button>
              </div>
            </div>
            <input
              ref={backupInput}
              type="file"
              accept="application/json,.json"
              onChange={importAll}
              hidden
            />
          </div>
        )}

        <Editor
          value={active.source}
          results={lines}
          onChange={(source) => update({ source })}
        />
      </div>

      <div className="output-pane">
        <div className="sheet-page">
          <div className="title-block">
            <div className="title-block-main">
              <strong>{title}</strong>
              {active.meta.project && <span>{active.meta.project}</span>}
            </div>
            <dl>
              {active.meta.author && (
                <>
                  <dt>Author</dt>
                  <dd>{active.meta.author}</dd>
                </>
              )}
              {active.meta.checkedBy && (
                <>
                  <dt>Checked</dt>
                  <dd>{active.meta.checkedBy}</dd>
                </>
              )}
              <dt>Rev</dt>
              <dd>{active.meta.revision || '-'}</dd>
              <dt>Date</dt>
              <dd>{new Date().toLocaleDateString('sv-SE')}</dd>
            </dl>
          </div>
          {lines.map((line, index) =>
            index === titleLine ? null : <Rendered key={index} line={line} />,
          )}
        </div>
      </div>
    </div>
  )
}
