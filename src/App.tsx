import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { evaluateSheet, sheetTitle, type Line, type ToleranceMode } from './engine'
import { Editor } from './editor'
import { Plot } from './Plot'
import {
  activeProject,
  activeSheet,
  backupAgeDays,
  duplicateNames,
  EXAMPLE,
  loadStore,
  moveSheet,
  moveSheetToProject,
  newId,
  newProject,
  removeSheet,
  saveStore,
  slug,
  type Project,
  type ProjectMeta,
  type Settings,
  type Sheet,
  type Store,
  type Theme,
} from './store'
import './App.css'

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
                      {cell.verdict ? cell.text : <Quantity text={cell.text} />}
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
              <span className="sigma">
                <Quantity text={line.tolerance.text} />
              </span>
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

/**
 * Table cells and tolerances are plain text, so "1.250e7 mm^3" would print
 * exactly like that. Render it the way it is written: 1.250·10⁷ mm³, with a
 * real micro sign. A leading "± " is passed through untouched.
 */
function Quantity({ text }: { text: string }) {
  const match = text.match(/^(±\s*)?(-?[\d.]+)(?:e([+-]?\d+))?\s*(.*)$/)
  if (!match) return <>{text}</>

  const [, prefix, mantissa, rawExponent, rawUnit] = match
  const exponent = rawExponent?.replace(/^\+/, '')
  const unit = rawUnit.replace(/\bu(?=[A-Za-zΩ])/g, '\u00b5')

  return (
    <>
      {prefix}
      {mantissa}
      {exponent && (
        <>
          ·10<sup>{exponent}</sup>
        </>
      )}
      {unit && ' '}
      {unit.split(/(\^-?\d+)/).map((part, index) =>
        part.startsWith('^') ? <sup key={index}>{part.slice(1)}</sup> : part,
      )}
    </>
  )
}

function Tex({ tex, className }: { tex: string; className: string }) {
  const html = useMemo(
    () => katex.renderToString(tex, { displayMode: true, throwOnError: false }),
    [tex],
  )
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

function TitleBlock({
  project,
  title,
  position,
}: {
  project: Project
  title: string
  position?: string
}) {
  return (
    <div className="title-block">
      <div className="title-block-main">
        <strong>{title}</strong>
        <span>
          {project.name}
          {project.meta.client && ` · ${project.meta.client}`}
        </span>
      </div>
      <dl>
        {project.meta.author && (
          <>
            <dt>Author</dt>
            <dd>{project.meta.author}</dd>
          </>
        )}
        {project.meta.checkedBy && (
          <>
            <dt>Checked</dt>
            <dd>{project.meta.checkedBy}</dd>
          </>
        )}
        <dt>Rev</dt>
        <dd>{project.meta.revision || '-'}</dd>
        <dt>Date</dt>
        <dd>{new Date().toLocaleDateString('sv-SE')}</dd>
        {position && (
          <>
            <dt>Sheet</dt>
            <dd>{position}</dd>
          </>
        )}
      </dl>
    </div>
  )
}

function SheetDocument({
  sheet,
  project,
  precision,
  mode,
  libraries,
  position,
}: {
  sheet: Sheet
  project: Project
  precision: number
  mode: ToleranceMode
  libraries: Record<string, string>
  position?: string
}) {
  const lines = useMemo(
    () => evaluateSheet(sheet.source, { precision, mode, libraries }),
    [sheet.source, precision, mode, libraries],
  )
  const title = useMemo(() => sheetTitle(sheet.source), [sheet.source])

  // The title block already shows the sheet's title, so the heading it came
  // from would print it a second time. Skip that one line only.
  const titleLine = useMemo(
    () => lines.findIndex((line) => line.kind === 'heading' && line.text === title),
    [lines, title],
  )

  return (
    <div className="sheet-page">
      <TitleBlock project={project} title={title} position={position} />
      {lines.map((line, index) =>
        index === titleLine ? null : <Rendered key={index} line={line} />,
      )}
    </div>
  )
}

/**
 * The reference. A calculation language is only worth having if you can find
 * out what it does without leaving the sheet, so this lists every line kind
 * with a real example rather than describing the app in general terms.
 */
function HelpPanel({ onExample }: { onExample: () => void }) {
  const rows: [string, string][][] = [
    [
      ['b = 300 mm', 'A value with a unit. Any unit mathjs knows: mm, kN, MPa, kg, s, degC.'],
      ['W = b*h^2/6', 'A formula. It shows the symbols, then your numbers substituted in, then the result.'],
      ['sigma = M/W -> MPa', 'The arrow forces the unit the result is shown in.'],
      ['b = 300 mm +- 2 mm', 'A tolerance. Write ± if you prefer. It propagates to everything below.'],
      ['sigma <= f_ck', 'A check. Renders as OK or NOT OK with how much margin is left.'],
      ['A(d) = pi*d^2/4', 'Your own function. Call it like any other: A(20 mm).'],
      ['# Heading', 'A heading. The first one becomes the sheet title in the title block.'],
      ['// note', 'A line of prose, for the reasoning a reviewer needs.'],
    ],
    [
      ['table', 'Starts a table: one row per case, one column per quantity.'],
      ['  s | bw | Wt = bw*h^2/6', 'The header row. A column with an = is computed for every row.'],
      ['  A | 300 mm', 'A case. Blank cells are filled by the computed columns.'],
      ['end', 'Closes the table.'],
      ['plot sigma vs b from 200 mm to 400 mm', 'Sweeps one input and draws the result.'],
      ['import "Loads"', 'Brings in the definitions from another sheet in this project, by name.'],
    ],
  ]

  return (
    <div className="panel help">
      <section>
        <h3>Lines</h3>
        <dl className="syntax">
          {rows[0].map(([code, text]) => (
            <div key={code}>
              <dt>
                <code>{code}</code>
              </dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3>Many cases at once</h3>
        <dl className="syntax">
          {rows[1].map(([code, text]) => (
            <div key={code}>
              <dt>
                <code>{code}</code>
              </dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h3>What it does for you</h3>
        <p className="hint">
          Units are kept as you wrote them: a moment stays kN·m instead of collapsing into kJ, and
          mm·mm² stays mm³. Where two units share a dimension — m and mm in a stress — it converts,
          because the alternative is nonsense. Mixing dimensions is an error, named on the line:
          adding a length to a pressure will not quietly give you a number.
        </p>
        <p className="hint">
          A symbol used before it is defined says so rather than reading as zero, and defining one
          twice warns you, since the lines below will use the second value. Underscores become
          subscripts (<code>M_Ed</code>) and Greek names become Greek letters (<code>sigma</code>,{' '}
          <code>Delta</code>).
        </p>
      </section>

      <section>
        <h3>Projects and printing</h3>
        <p className="hint">
          A project is a set of sheets with one title block, printed as one numbered package —
          Project → Preview whole project, then Print. ↑ ↓ in the sidebar set the order sheets
          print in. Print on its own prints the sheet you are looking at.
        </p>
      </section>

      <section>
        <h3>Try it</h3>
        <div className="settings-buttons">
          <button onClick={onExample}>New sheet from the example</button>
        </div>
        <p className="hint">Adds a worked beam check to this project, using every line kind above.</p>
      </section>
    </div>
  )
}

type Panel = 'none' | 'meta' | 'settings' | 'profile' | 'help'

/** "Peo Nilsson" -> "PN", "Peo" -> "P", nothing -> a neutral mark. */
const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

export default function App() {
  const [store, setStore] = useState<Store>(loadStore)
  const [panel, setPanel] = useState<Panel>('none')
  const [printingProject, setPrintingProject] = useState(false)
  const [saveFailure, setSaveFailure] = useState<'quota' | 'blocked' | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<'sheet' | 'project' | null>(null)
  const backupInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const result = saveStore(store)
    setSaveFailure(result.ok ? null : result.reason)
  }, [store])

  // A half-finished confirmation should not linger.
  useEffect(() => {
    if (!confirmingDelete) return
    const timer = setTimeout(() => setConfirmingDelete(null), 4000)
    return () => clearTimeout(timer)
  }, [confirmingDelete])

  useEffect(() => {
    const root = document.documentElement
    if (store.settings.theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', store.settings.theme)
  }, [store.settings.theme])

  const project = activeProject(store)
  const sheet = activeSheet(store)

  // Every other sheet in the project is importable by name.
  const libraries = useMemo(() => {
    const map: Record<string, string> = {}
    for (const other of project.sheets) {
      if (other.id !== sheet.id) map[other.name] = other.source
    }
    return map
  }, [project.sheets, sheet.id])

  const patchProject = (patch: Partial<Project>) =>
    setStore((current) => ({
      ...current,
      projects: current.projects.map((candidate) =>
        candidate.id === project.id ? { ...candidate, ...patch } : candidate,
      ),
    }))

  const patchSheet = (patch: Partial<Sheet>) =>
    patchProject({
      sheets: project.sheets.map((candidate) =>
        candidate.id === sheet.id ? { ...candidate, ...patch } : candidate,
      ),
    })

  const setMeta = (patch: Partial<ProjectMeta>) =>
    patchProject({ meta: { ...project.meta, ...patch } })

  const setSettings = (patch: Partial<Settings>) =>
    setStore((current) => ({ ...current, settings: { ...current.settings, ...patch } }))

  const addProject = () => {
    const created = newProject(`Project ${store.projects.length + 1}`, {
      author: store.settings.author,
    })
    setStore((current) => ({
      ...current,
      projects: [...current.projects, created],
      activeProjectId: created.id,
      activeSheetId: created.sheets[0].id,
    }))
  }

  const addSheet = (name?: string, source = '# New calculation\n\n') => {
    const id = newId()
    setStore((current) => ({
      ...current,
      activeSheetId: id,
      projects: current.projects.map((candidate) =>
        candidate.id === project.id
          ? {
              ...candidate,
              sheets: [
                ...candidate.sheets,
                { id, name: name ?? `Sheet ${candidate.sheets.length + 1}`, source },
              ],
            }
          : candidate,
      ),
    }))
  }

  const duplicateSheet = () => {
    const id = newId()
    setStore((current) => ({
      ...current,
      activeSheetId: id,
      projects: current.projects.map((candidate) =>
        candidate.id === project.id
          ? {
              ...candidate,
              sheets: [...candidate.sheets, { ...sheet, id, name: `${sheet.name} copy` }],
            }
          : candidate,
      ),
    }))
  }

  const deleteSheet = () => {
    if (project.sheets.length === 1) return
    if (confirmingDelete !== 'sheet') {
      setConfirmingDelete('sheet')
      return
    }
    setConfirmingDelete(null)
    setStore((current) => removeSheet(current, sheet.id))
  }

  const deleteProject = () => {
    if (store.projects.length === 1) return
    if (confirmingDelete !== 'project') {
      setConfirmingDelete('project')
      return
    }
    setConfirmingDelete(null)
    setStore((current) => {
      const remaining = current.projects.filter((candidate) => candidate.id !== project.id)
      return {
        ...current,
        projects: remaining,
        activeProjectId: remaining[0].id,
        activeSheetId: remaining[0].sheets[0].id,
      }
    })
  }

  const reorder = (offset: number) => setStore((current) => moveSheet(current, sheet.id, offset))

  const moveToProject = (targetId: string) =>
    setStore((current) => moveSheetToProject(current, sheet.id, targetId))

  const download = (contents: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([contents], { type }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  const save = () => download(sheet.source, `${slug(sheet.name)}.calc`, 'text/plain')

  const exportAll = () => {
    const stamped = { ...store, lastBackupAt: Date.now() }
    download(
      JSON.stringify(stamped, null, 2),
      `longhand-backup-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json',
    )
    setStore(stamped)
  }

  const importAll = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      try {
        const { migrate } = await import('./store')
        setStore(migrate(JSON.parse(await file.text())))
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
        activeSheetId: id,
        projects: current.projects.map((candidate) =>
          candidate.id === project.id
            ? {
                ...candidate,
                sheets: [
                  ...candidate.sheets,
                  { id, name: file.name.replace(/\.[^.]+$/, ''), source },
                ],
              }
            : candidate,
        ),
      }))
    }
    event.target.value = ''
  }

  /**
   * A 600-line sheet takes about 700ms to re-evaluate when the edit is on the
   * first line, because every line below it has to be redone. Evaluating the
   * deferred source keeps typing at full speed: React renders the keystroke
   * immediately and recomputes the results in a pass it is allowed to abandon
   * when the next key arrives. The results shown are then briefly one keystroke
   * behind, which `stale` says out loud instead of pretending otherwise.
   */
  const deferredSource = useDeferredValue(sheet.source)
  const stale = deferredSource !== sheet.source
  const lines = useMemo(
    () =>
      evaluateSheet(deferredSource, {
        precision: store.precision,
        mode: store.mode,
        libraries,
      }),
    [deferredSource, store.precision, store.mode, libraries],
  )

  /**
   * Show the whole package as one document and let the user look at it before
   * printing. An explicit mode beats printing straight away: they get to check
   * the order and the title blocks, and there is no timing to get wrong.
   */
  const showPackage = () => {
    setPrintingProject(true)
    setPanel('none')
  }

  const duplicates = duplicateNames(project)
  const backupAge = backupAgeDays(store)

  return (
    <div className="app">
      {saveFailure && (
        <div className="save-alert no-print">
          <strong>Not saving.</strong>{' '}
          {saveFailure === 'quota'
            ? 'This browser has run out of storage for Longhand. Export a backup now, then delete a project you no longer need.'
            : 'This browser is blocking storage, so nothing you type is being kept. Export a backup before you close the tab.'}
          <button onClick={exportAll}>Export backup</button>
        </div>
      )}

      <aside className="sheets">
        <div className="sheets-head">
          <span className="brand">Longhand</span>
          <button className="icon" onClick={addProject} title="New project">
            +
          </button>
        </div>

        <div className="tree">
          {store.projects.map((candidate) => {
            const current = candidate.id === project.id
            return (
              <div key={candidate.id} className="project">
                <button
                  className={current ? 'project-name current' : 'project-name'}
                  onClick={() =>
                    setStore((state) => ({
                      ...state,
                      activeProjectId: candidate.id,
                      activeSheetId: candidate.sheets[0].id,
                    }))
                  }
                >
                  {candidate.name}
                </button>
                {current && (
                  <ul>
                    {candidate.sheets.map((candidateSheet) => (
                      <li key={candidateSheet.id}>
                        <button
                          className={candidateSheet.id === sheet.id ? 'sheet current' : 'sheet'}
                          onClick={() =>
                            setStore((state) => ({ ...state, activeSheetId: candidateSheet.id }))
                          }
                        >
                          {candidateSheet.name}
                        </button>
                      </li>
                    ))}
                    <li>
                      <button className="sheet add" onClick={() => addSheet()}>
                        + Sheet
                      </button>
                    </li>
                  </ul>
                )}
              </div>
            )
          })}
        </div>

        <button
          className={panel === 'profile' ? 'profile-button on' : 'profile-button'}
          onClick={() => setPanel((current) => (current === 'profile' ? 'none' : 'profile'))}
        >
          <span className="avatar">{initials(store.settings.author)}</span>
          <span className="profile-label">{store.settings.author || 'Add your name'}</span>
        </button>

        <div className="sheets-foot">
          <button
            onClick={() => reorder(-1)}
            disabled={project.sheets.findIndex((s) => s.id === sheet.id) === 0}
            title="Move sheet up"
          >
            ↑
          </button>
          <button
            onClick={() => reorder(1)}
            disabled={
              project.sheets.findIndex((s) => s.id === sheet.id) === project.sheets.length - 1
            }
            title="Move sheet down"
          >
            ↓
          </button>
          <button onClick={duplicateSheet}>Duplicate</button>
          <button
            className={confirmingDelete === 'sheet' ? 'danger' : ''}
            onClick={deleteSheet}
            disabled={project.sheets.length === 1}
          >
            {confirmingDelete === 'sheet' ? 'Really?' : 'Delete'}
          </button>
        </div>
      </aside>

      <div className="editor-pane">
        <div className="toolbar">
          <input
            className="sheet-name"
            value={sheet.name}
            onChange={(event) => patchSheet({ name: event.target.value })}
            aria-label="Sheet name"
          />
          <div className="toolbar-actions">
            <button
              className={panel === 'meta' ? 'on' : ''}
              onClick={() => setPanel((current) => (current === 'meta' ? 'none' : 'meta'))}
            >
              Project
            </button>
            <button
              className={panel === 'settings' ? 'on' : ''}
              onClick={() => setPanel((current) => (current === 'settings' ? 'none' : 'settings'))}
            >
              Settings
            </button>
            <button
              className={panel === 'help' ? 'on' : ''}
              onClick={() => setPanel((current) => (current === 'help' ? 'none' : 'help'))}
            >
              Help
            </button>
            <button onClick={() => fileInput.current?.click()}>Open</button>
            <button onClick={save}>Save</button>
            <button onClick={() => window.print()}>Print</button>
          </div>
          <input ref={fileInput} type="file" accept=".calc,.txt,text/plain" onChange={open} hidden />
        </div>

        {panel === 'meta' && (
          <div className="panel">
            <section>
              <h3>Project</h3>
              <label>
                <span>Name</span>
                <input
                  value={project.name}
                  onChange={(event) => patchProject({ name: event.target.value })}
                />
              </label>
              <label>
                <span>Client</span>
                <input
                  value={project.meta.client}
                  onChange={(event) => setMeta({ client: event.target.value })}
                />
              </label>
              <label>
                <span>Author</span>
                <input
                  value={project.meta.author}
                  onChange={(event) => setMeta({ author: event.target.value })}
                />
              </label>
              <label>
                <span>Checked by</span>
                <input
                  value={project.meta.checkedBy}
                  onChange={(event) => setMeta({ checkedBy: event.target.value })}
                />
              </label>
              <label>
                <span>Revision</span>
                <input
                  value={project.meta.revision}
                  onChange={(event) => setMeta({ revision: event.target.value })}
                />
              </label>
              <p className="hint">
                Every sheet in this project shares this title block.
              </p>
            </section>

            <section>
              <h3>Sheets</h3>
              <p className="hint">
                Sheets print in the order shown in the sidebar — use ↑ and ↓ to change it.
              </p>
              {duplicates.length > 0 && (
                <p className="warning">
                  Two sheets are called {duplicates.map((name) => `"${name}"`).join(', ')}. An{' '}
                  <code>import</code> resolves by name, so only the first would be found — rename one.
                </p>
              )}
              {store.projects.length > 1 && (
                <label>
                  <span>Move this sheet to</span>
                  <select
                    value=""
                    onChange={(event) => event.target.value && moveToProject(event.target.value)}
                    disabled={project.sheets.length === 1}
                  >
                    <option value="">Choose a project…</option>
                    {store.projects
                      .filter((candidate) => candidate.id !== project.id)
                      .map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </section>

            <section>
              <h3>Package</h3>
              <p className="hint">
                {project.sheets.length} sheet{project.sheets.length === 1 ? '' : 's'} in this project.
              </p>
              <div className="settings-buttons">
                <button onClick={showPackage}>Preview whole project</button>
                <button
                  className={confirmingDelete === 'project' ? 'danger' : ''}
                  onClick={deleteProject}
                  disabled={store.projects.length === 1}
                >
                  {confirmingDelete === 'project'
                    ? `Really delete ${project.sheets.length} sheet${project.sheets.length === 1 ? '' : 's'}?`
                    : 'Delete project'}
                </button>
              </div>
            </section>
          </div>
        )}

        {panel === 'settings' && (
          <div className="panel settings">
            <section>
              <h3>Appearance</h3>
              <label>
                <span>Theme</span>
                <select
                  value={store.settings.theme}
                  onChange={(event) => setSettings({ theme: event.target.value as Theme })}
                >
                  <option value="system">Follow the system</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </section>

            <section>
              <h3>Numbers</h3>
              <label>
                <span>Significant figures</span>
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
              <label>
                <span>Tolerances</span>
                <select
                  value={store.mode}
                  onChange={(event) =>
                    setStore((current) => ({
                      ...current,
                      mode: event.target.value as ToleranceMode,
                    }))
                  }
                >
                  <option value="quadrature">Statistical</option>
                  <option value="worst">Worst case</option>
                </select>
              </label>
            </section>

            <section>
              <h3>Data</h3>
              <p className="hint">
                Everything is stored in this browser only.{' '}
                {backupAge === null
                  ? 'No backup has ever been exported.'
                  : backupAge === 0
                    ? 'Last backup: today.'
                    : `Last backup: ${backupAge} day${backupAge === 1 ? '' : 's'} ago.`}
              </p>
              <div className="settings-buttons">
                <button onClick={exportAll}>Export backup</button>
                <button onClick={() => backupInput.current?.click()}>Restore backup</button>
              </div>
            </section>

            <input
              ref={backupInput}
              type="file"
              accept="application/json,.json"
              onChange={importAll}
              hidden
            />
          </div>
        )}

        {panel === 'profile' && (
          <div className="panel">
            <section>
              <h3>You</h3>
              <label>
                <span>Your name</span>
                <input
                  value={store.settings.author}
                  onChange={(event) => setSettings({ author: event.target.value })}
                  placeholder="Peo Nilsson"
                />
              </label>
              <p className="hint">
                Goes in the title block of new projects, so a printed sheet says who did the
                calculation.
              </p>
            </section>

            <section>
              <h3>Not here yet</h3>
              {/* Named honestly rather than shown as buttons that do nothing. None of
                  this is built, and none of it is needed to do a calculation. */}
              <p className="hint">
                There is no account and no server — everything lives in this browser. An account
                would buy three things, in this order: your sheets on every machine you use,
                revision history for a sheet you have to defend, and a project two people can
                work on. Until then, Settings → Data is the backup.
              </p>
            </section>
          </div>
        )}

        {panel === 'help' && <HelpPanel onExample={() => addSheet('Example', EXAMPLE)} />}

        <Editor
          value={sheet.source}
          results={lines}
          onChange={(source) => patchSheet({ source })}
        />
      </div>

      <div
        className={
          (printingProject ? 'output-pane package' : 'output-pane') + (stale ? ' stale' : '')
        }
      >
        {printingProject && (
          <div className="package-bar no-print">
            <span>
              Package preview — {project.name}, {project.sheets.length} sheet
              {project.sheets.length === 1 ? '' : 's'}
            </span>
            <div className="package-bar-actions">
              <button onClick={() => window.print()}>Print package</button>
              <button onClick={() => setPrintingProject(false)}>Close</button>
            </div>
          </div>
        )}
        {printingProject ? (
          project.sheets.map((candidate, index) => (
            <SheetDocument
              key={candidate.id}
              sheet={candidate}
              project={project}
              precision={store.precision}
              mode={store.mode}
              libraries={Object.fromEntries(
                project.sheets
                  .filter((other) => other.id !== candidate.id)
                  .map((other) => [other.name, other.source]),
              )}
              position={`${index + 1} of ${project.sheets.length}`}
            />
          ))
        ) : (
          <SheetDocument
            sheet={{ ...sheet, source: deferredSource }}
            project={project}
            precision={store.precision}
            mode={store.mode}
            libraries={libraries}
          />
        )}
      </div>
    </div>
  )
}
