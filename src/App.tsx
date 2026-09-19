import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import type { EditorView } from '@codemirror/view'
import {
  evaluateSheet,
  recomputeCold,
  sheetTitle,
  type ColdRun,
  type Line,
  type ToleranceMode,
} from './engine'
import { Editor } from './editor'
import { Mark } from './Mark'
import { Plot } from './Plot'
import {
  activeProject,
  activeSheet,
  backupAgeDays,
  duplicateNames,
  emptyMeta,
  loadStore,
  moveSheet,
  moveSheetToProject,
  newId,
  newProject,
  removeSheet,
  restore,
  restoreRevision,
  saveStore,
  slug,
  snapshotSheet,
  dueForSnapshot,
  deleteRevision,
  referencedFigures,
  type Deleted,
  type Revision,
  type Project,
  type ProjectMeta,
  type Settings,
  type Sheet,
  type Store,
  type Theme,
} from './store'
import { TEMPLATES } from './templates'
import { findExample } from './examples'
import { CONSTANTS_NAME, CONSTANTS_SHEET } from './constants'
import { inspect, downstream, toMarkdown, tableFromPaste } from './inspect'
import { summariseChecks, tightest, verdictLine, type SheetChecks } from './checks'
import { DISCLAIMER, buildStamp } from './build'
import { ISSUES_URL, issueUrl, mailtoUrl, optedOut, setOptedOut, start, track, trackOnce } from './analytics'
import { LONG_LINK, importedNames, shareLink, sheetFromLocation, type SharedSheet } from './share'
import { describeDiff, diffLines, withContext } from './diff'
import { figureId, figuresSize, humanSize, prepareImage, LARGE_FIGURE } from './figures'
import {
  chooseExistingFile,
  chooseNewFile,
  forgetHandle,
  permissionState,
  readFile,
  recallHandle,
  rememberHandle,
  requestPermission,
  supportsDisk,
  writeFile,
  type DiskState,
} from './disk'
import './App.css'

function Rendered({
  line,
  figures,
  anchor,
}: {
  line: Line
  /** Images for `figure` lines, held beside the sheet rather than in it. */
  figures?: Record<string, string>
  /** An id to jump to from the checks summary. */
  anchor?: string
}) {
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
          {line.note && <p className="line-note">{line.note}</p>}
          {line.query && <p className="query">{line.query}</p>}
          {line.warning && <p className="warning">{line.warning}</p>}
        </div>
      )

    case 'break':
      // Nothing on screen; on paper it is where the author asked for a new page.
      return <div className="page-break" />

    case 'figure': {
      const source = figures?.[line.id]
      return (
        <figure className="sheet-figure">
          {source ? (
            <img src={source} alt={line.caption || `Figure ${line.number}`} />
          ) : (
            <div className="figure-missing no-print">
              Figure {line.number} has no image yet. Put the cursor on this line and use{' '}
              <strong>Figure</strong> in the toolbar to attach one to <code>{line.id}</code>.
            </div>
          )}
          <figcaption>
            <strong>Figure {line.number}</strong>
            {line.caption ? ` — ${line.caption}` : ''}
          </figcaption>
        </figure>
      )
    }

    case 'check':
      return (
        <div id={anchor} className={`check ${line.pass ? 'pass' : 'fail'}`}>
          <div>
            <Tex tex={line.tex} className="calc" />
            {line.note && <p className="line-note">{line.note}</p>}
            {line.query && <p className="query">{line.query}</p>}
          </div>
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
          {line.equation !== undefined && <span className="equation">({line.equation})</span>}
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
          {line.note && <p className="line-note">{line.note}</p>}
          {line.query && <p className="query">{line.query}</p>}
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

/**
 * The verdicts, at the top, before the working.
 *
 * A reviewer opening a calculation wants one thing first: did it pass, and by
 * how much. A sheet buries that among three pages of algebra, so this puts it
 * where the eye lands — and on screen each row jumps to the line it came from,
 * which is the other half of the same problem.
 */
function ChecksSummary({
  summary,
  onJump,
  anchorFor,
}: {
  summary: SheetChecks
  onJump?: (index: number) => void
  anchorFor: (index: number) => string
}) {
  if (summary.checks.length === 0) return null
  const closest = tightest(summary)

  return (
    <section className={summary.failed ? 'checks-summary has-failure' : 'checks-summary'}>
      <header>
        <h3>Checks</h3>
        <span className={summary.failed ? 'overall fail' : 'overall pass'}>
          {verdictLine(summary)}
        </span>
      </header>
      <ol>
        {summary.checks.map((check, index) => (
          <li key={`${check.index}-${index}`} className={check.pass ? 'pass' : 'fail'}>
            <span className="what">
              {onJump ? (
                <a
                  href={`#${anchorFor(check.index)}`}
                  onClick={(event) => {
                    event.preventDefault()
                    onJump(check.index)
                  }}
                >
                  {check.label}
                </a>
              ) : (
                check.label
              )}
              {check.section && <em className="where">{check.section}</em>}
            </span>
            <span className="badge">{check.pass ? 'OK' : 'NOT OK'}</span>
            <span className="margin">{check.margin ?? ''}</span>
          </li>
        ))}
      </ol>
      {closest && !summary.failed && (
        <p className="tightest">
          Closest to the limit: <strong>{closest.label}</strong>, {closest.margin}.
        </p>
      )}
    </section>
  )
}

function SheetDocument({
  sheet,
  project,
  precision,
  mode,
  libraries,
  position,
  lines: given,
  onJump,
}: {
  sheet: Sheet
  project: Project
  precision: number
  mode: ToleranceMode
  libraries: Record<string, string>
  position?: string
  /**
   * Already-evaluated lines. The package view works them out once for the
   * whole project — it needs them for the package summary anyway — and passing
   * them in stops every sheet being evaluated twice.
   */
  lines?: Line[]
  onJump?: (index: number) => void
}) {
  const own = useMemo(
    () => (given ? null : evaluateSheet(sheet.source, { precision, mode, libraries })),
    [given, sheet.source, precision, mode, libraries],
  )
  const lines = given ?? own!
  const title = useMemo(() => sheetTitle(sheet.source), [sheet.source])
  const checks = useMemo(() => summariseChecks(sheet.source, lines), [sheet.source, lines])
  const anchorFor = useCallback((index: number) => `check-${sheet.id}-${index}`, [sheet.id])

  // The title block already shows the sheet's title, so the heading it came
  // from would print it a second time. Skip that one line only.
  const titleLine = useMemo(
    () => lines.findIndex((line) => line.kind === 'heading' && line.text === title),
    [lines, title],
  )

  return (
    <div className={project.meta.status === 'issued' ? 'sheet-page' : 'sheet-page draft'}>
      {/* A draft and an issued calculation look identical on paper otherwise,
          which is how a draft ends up in a submission. */}
      {project.meta.status !== 'issued' && <div className="watermark" aria-hidden="true">PRELIMINARY</div>}
      <TitleBlock project={project} title={title} position={position} />
      <ChecksSummary summary={checks} onJump={onJump} anchorFor={anchorFor} />
      {lines.map((line, index) =>
        index === titleLine ? null : (
          <Rendered
            key={index}
            line={line}
            figures={sheet.figures}
            anchor={line.kind === 'check' ? anchorFor(index) : undefined}
          />
        ),
      )}
      {/* Print only: which build produced this, and what it is and is not.
          A calculation that goes into a submission has to say both. */}
      <p className="sheet-foot">
        {project.meta.footer ? `${project.meta.footer} — ` : ''}
        {DISCLAIMER} {buildStamp()}
      </p>
    </div>
  )
}

/**
 * The page rules Paged.js needs, kept here rather than in App.css because they
 * are only ever handed to Paged.js: browsers cannot put a counter in an @page
 * margin box themselves, which is the whole reason this path exists.
 */
const pageCss = (): string => `
@page {
  size: A4;
  margin: 16mm 15mm 18mm;
  @top-left {
    content: string(sheet-title);
    font: 400 8.5pt ui-sans-serif, system-ui, sans-serif;
    color: #6b6b66;
    padding-bottom: 3mm;
  }
  @bottom-left {
    content: ${JSON.stringify(buildStamp())};
    font: 400 7.5pt ui-sans-serif, system-ui, sans-serif;
    color: #8a8a84;
    padding-top: 3mm;
  }
  @bottom-right {
    content: "Page " counter(page) " of " counter(pages);
    font: 400 8.5pt ui-sans-serif, system-ui, sans-serif;
    color: #6b6b66;
    padding-top: 3mm;
  }
}

.sheet-page .title-block-main strong { string-set: sheet-title content(text); }
.sheet-page { padding: 0; max-width: none; }
.sheet-page + .sheet-page { break-before: page; }

/* Nothing should be split down the middle of a formula or a verdict. */
.calc-block, .check, .sheet-table tr, .katex-display { break-inside: avoid; }
.title-block { break-after: avoid; }
.checks-summary { break-inside: avoid; }
.sheet-figure { break-inside: avoid; }
`

type Panel =
  | 'none'
  | 'meta'
  | 'settings'
  | 'profile'
  | 'share'
  | 'history'
  | 'feedback'
  | 'symbols'

/** "Peo Nilsson" -> "PN", "Peo" -> "P", nothing -> a neutral mark. */
const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  return parts
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

/**
 * A calculation someone sent you.
 *
 * The whole sheet arrives in the link's hash, so there is nothing to fetch and
 * nobody to ask. It opens read-only on purpose: what is on screen is exactly
 * what the sender had, and editing it should be a decision — "make a copy" —
 * rather than something that happens by typing.
 */
function SharedView({
  shared,
  precision,
  mode,
  onCopy,
}: {
  shared: SharedSheet
  precision: number
  mode: ToleranceMode
  onCopy: () => void
}) {
  const lines = useMemo(
    () => evaluateSheet(shared.source, { precision, mode, libraries: shared.libraries ?? {} }),
    [shared.source, precision, mode, shared.libraries],
  )
  const sheet: Sheet = {
    id: 'shared',
    name: shared.name,
    source: shared.source,
    figures: shared.figures,
  }
  const project: Project = {
    id: 'shared',
    name: shared.name,
    meta: emptyMeta(),
    sheets: [sheet],
  }

  return (
    <div className="app shared">
      <div className="shared-bar no-print">
        <span>
          <strong>Shared calculation.</strong> It came with the link — nothing was fetched from a
          server, and nothing you do here is sent anywhere.
        </span>
        <div className="shared-actions">
          <button className="primary" onClick={onCopy}>
            Make a copy to edit
          </button>
          <a className="toolbar-link" href="/app">
            Open my sheets
          </a>
        </div>
      </div>

      <div className="editor-pane">
        <div className="toolbar">
          <span className="sheet-name static">{shared.name}</span>
          <div className="toolbar-actions">
            <a className="toolbar-link" href="/docs" target="_blank" rel="noreferrer">
              What is this?
            </a>
          </div>
        </div>
        <Editor value={shared.source} results={lines} onChange={() => {}} readOnly />
      </div>

      <div className="output-pane">
        <SheetDocument
          sheet={sheet}
          project={project}
          precision={precision}
          mode={mode}
          libraries={{}}
          lines={lines}
        />
      </div>
    </div>
  )
}

export default function App() {
  const [store, setStore] = useState<Store>(loadStore)
  const [panel, setPanel] = useState<Panel>('none')
  const [printingProject, setPrintingProject] = useState(false)
  const [saveFailure, setSaveFailure] = useState<'quota' | 'blocked' | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState<'sheet' | 'project' | null>(null)
  const [deleted, setDeleted] = useState<Deleted | null>(null)
  const [disk, setDisk] = useState<{ handle: FileSystemFileHandle | null; state: DiskState }>({
    handle: null,
    state: supportsDisk() ? 'off' : 'unsupported',
  })
  const [diskSavedAt, setDiskSavedAt] = useState<number | null>(null)
  const [paged, setPaged] = useState<'off' | 'working' | 'on' | 'failed'>('off')
  const [shared, setShared] = useState<SharedSheet | null>(null)
  const [link, setLink] = useState<{ url: string; copied: boolean } | null>(null)
  const [feedback, setFeedback] = useState('')
  const [cold, setCold] = useState<ColdRun | null>(null)
  const [counting, setCounting] = useState(!optedOut())
  const [compare, setCompare] = useState<string | null>(null)
  const [figureError, setFigureError] = useState<string | null>(null)
  const [traced, setTraced] = useState<string | null>(null)
  const [choosingTemplate, setChoosingTemplate] = useState(false)
  const editorRef = useRef<EditorView | null>(null)
  const figureInput = useRef<HTMLInputElement>(null)
  const outputRef = useRef<HTMLDivElement>(null)
  const pagedRef = useRef<HTMLDivElement>(null)
  const backupInput = useRef<HTMLInputElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const result = saveStore(store)
    setSaveFailure(result.ok ? null : result.reason)
  }, [store])

  // One pageview per load, carrying nothing but a four-word return bucket.
  useEffect(() => {
    start()
  }, [])

  /**
   * A shared link opens read-only. The hash is left in the address on purpose:
   * the link *is* the document, so reloading has to give the same thing back,
   * and nothing about it ever reaches a server.
   */
  useEffect(() => {
    let cancelled = false
    const read = () => {
      void sheetFromLocation().then((found) => {
        if (cancelled) return
        setShared(found)
        if (found) track('share opened')
      })
    }
    read()
    window.addEventListener('hashchange', read)
    return () => {
      cancelled = true
      window.removeEventListener('hashchange', read)
    }
  }, [])

  // A half-finished confirmation should not linger.
  useEffect(() => {
    if (!confirmingDelete) return
    const timer = setTimeout(() => setConfirmingDelete(null), 4000)
    return () => clearTimeout(timer)
  }, [confirmingDelete])

  // The offer to undo a deletion stays up long enough to notice and no longer.
  useEffect(() => {
    if (!deleted) return
    const timer = setTimeout(() => setDeleted(null), 12_000)
    return () => clearTimeout(timer)
  }, [deleted])

  /**
   * /app?example=beam opens a worked calculation as a new sheet. It is how the
   * landing page and the reference hand someone something real to edit, and it
   * runs once: the parameter is taken out of the address immediately, so a
   * reload does not keep adding copies.
   */
  const exampleLoaded = useRef(false)
  useEffect(() => {
    if (exampleLoaded.current) return
    const parameters = new URLSearchParams(window.location.search)
    const example = findExample(parameters.get('example'))
    exampleLoaded.current = true
    if (!example) return

    window.history.replaceState(null, '', window.location.pathname)
    setStore((current) => {
      const id = newId()
      const target = activeProject(current)
      return {
        ...current,
        activeProjectId: target.id,
        activeSheetId: id,
        projects: current.projects.map((candidate) =>
          candidate.id === target.id
            ? {
                ...candidate,
                sheets: [...candidate.sheets, { id, name: example.name, source: example.source }],
              }
            : candidate,
        ),
      }
    })
  }, [])

  // A file chosen in an earlier session is still there; the permission may not be.
  useEffect(() => {
    if (!supportsDisk()) return
    let cancelled = false
    void (async () => {
      const handle = await recallHandle()
      if (!handle || cancelled) return
      const permission = await permissionState(handle)
      if (cancelled) return
      setDisk({ handle, state: permission === 'granted' ? 'on' : 'needs-permission' })
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Write to the file a moment after the last keystroke. The file is a copy,
   * not the source of truth — localStorage already has it — so a failed write
   * asks to reconnect rather than losing anything.
   */
  useEffect(() => {
    if (disk.state !== 'on' || !disk.handle) return
    const handle = disk.handle
    const timer = setTimeout(() => {
      void (async () => {
        const written = await writeFile(handle, JSON.stringify(store, null, 2))
        if (written) setDiskSavedAt(Date.now())
        else setDisk({ handle, state: 'needs-permission' })
      })()
    }, 800)
    return () => clearTimeout(timer)
  }, [store, disk])

  useEffect(() => {
    const root = document.documentElement
    if (store.settings.theme === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', store.settings.theme)
  }, [store.settings.theme])

  /**
   * Take a snapshot when a sheet has been changing for a while without one.
   *
   * Nobody remembers to press "save revision" before the edit they regret, so
   * the useful history is the one taken automatically. The interval is long
   * enough that a working session leaves a handful of entries rather than a
   * hundred.
   */
  useEffect(() => {
    const timer = setInterval(() => {
      setStore((current) => {
        const sheet = activeSheet(current)
        return dueForSnapshot(sheet) ? snapshotSheet(current, sheet.id, '', true) : current
      })
    }, 60_000)
    return () => clearInterval(timer)
  }, [])

  const project = activeProject(store)
  const sheet = activeSheet(store)

  // Every other sheet in the project is importable by name.
  const libraries = useMemo(() => {
    // The constants sheet is available to every sheet without anyone having to
    // create it, and a sheet of the user's own with the same name wins — their
    // numbers are more likely to be the right ones for their work than ours.
    const map: Record<string, string> = { [CONSTANTS_NAME]: CONSTANTS_SHEET }
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
    track('sheet created')
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
    setDeleted({
      kind: 'sheet',
      projectId: project.id,
      index: project.sheets.findIndex((candidate) => candidate.id === sheet.id),
      sheet,
    })
    setStore((current) => removeSheet(current, sheet.id))
  }

  const deleteProject = () => {
    if (store.projects.length === 1) return
    if (confirmingDelete !== 'project') {
      setConfirmingDelete('project')
      return
    }
    setConfirmingDelete(null)
    setDeleted({
      kind: 'project',
      index: store.projects.findIndex((candidate) => candidate.id === project.id),
      project,
    })
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

  const undoDelete = () => {
    if (!deleted) return
    setStore((current) => restore(current, deleted))
    setDeleted(null)
  }

  const reorder = (offset: number) => setStore((current) => moveSheet(current, sheet.id, offset))

  /**
   * Put a line where the cursor is, rather than at the end of the sheet.
   *
   * A figure belongs at the point in the working it illustrates, and asking
   * someone to cut and paste the line they were just given is the kind of
   * small rudeness that adds up.
   */
  const insertLine = (text: string) => {
    const view = editorRef.current
    if (!view) {
      patchSheet({ source: `${sheet.source.replace(/\n*$/, '')}\n${text}\n` })
      return
    }
    const line = view.state.doc.lineAt(view.state.selection.main.head)
    const at = line.to
    view.dispatch({
      changes: { from: at, insert: `\n${text}` },
      selection: { anchor: at + text.length + 1 },
    })
    view.focus()
  }

  const addFigure = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setFigureError(null)
    try {
      const image = await prepareImage(file)
      if (image.bytes > LARGE_FIGURE) {
        setFigureError(
          `That image is ${humanSize(image.bytes)} even after resizing. It will work, but a few ` +
            'more like it will fill this browser\u2019s storage — keep a backup.',
        )
      }
      const id = figureId(file.name, Object.keys(sheet.figures ?? {}))
      const caption = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ')
      patchSheet({ figures: { ...(sheet.figures ?? {}), [id]: image.dataUrl } })
      insertLine(`figure ${id} "${caption}"`)
      track('figure added')
    } catch (error) {
      setFigureError(error instanceof Error ? error.message : 'That image could not be read.')
    }
  }

  /**
   * Build the link, then put it on the clipboard.
   *
   * Compressing is asynchronous, so the URL is shown as well as copied — a
   * clipboard write can be refused by the browser and a button that silently
   * did nothing would be worse than no button.
   */
  const makeShareLink = async () => {
    const figures = Object.fromEntries(
      referencedFigures(sheet.source)
        .filter((id) => sheet.figures?.[id])
        .map((id) => [id, sheet.figures![id]]),
    )
    // Everything the sheet imports goes with it. A shared sheet whose first
    // line is `import "Loads"` would otherwise arrive with every number
    // undefined — the sheet that was shared, and of no use to anyone.
    const carried = Object.fromEntries(
      importedNames(sheet.source)
        .map((name) => [name, libraries[name]])
        .filter(([, source]) => typeof source === 'string'),
    ) as Record<string, string>

    const url = await shareLink({
      name: sheet.name,
      source: sheet.source,
      figures: Object.keys(figures).length ? figures : undefined,
      libraries: Object.keys(carried).length ? carried : undefined,
    })
    let copied = false
    try {
      await navigator.clipboard.writeText(url)
      copied = true
    } catch {
      /* the address is shown below either way */
    }
    setLink({ url, copied })
    track('share created', { long: url.length > LONG_LINK })
  }

  /** A shared sheet becomes yours: copied in, hash cleared, straight to editing. */
  const copyShared = () => {
    if (!shared) return
    const id = newId()
    setStore((current) => {
      const target = activeProject(current)
      return {
        ...current,
        activeProjectId: target.id,
        activeSheetId: id,
        projects: current.projects.map((candidate) =>
          candidate.id === target.id
            ? {
                ...candidate,
                sheets: [
                  ...candidate.sheets,
                  { id, name: shared.name, source: shared.source, figures: shared.figures },
                ],
              }
            : candidate,
        ),
      }
    })
    window.history.replaceState(null, '', window.location.pathname)
    setShared(null)
    track('sheet created', { from: 'share' })
  }

  /**
   * A spreadsheet range, pasted in as a table block.
   *
   * Retyping twenty rows of section properties is the most tedious thing about
   * starting a sheet, and Excel already puts tab-separated text on the
   * clipboard. What comes out is an ordinary table block the engineer can
   * edit, not a black box.
   */
  const pasteTable = async () => {
    setFigureError(null)
    try {
      const text = await navigator.clipboard.readText()
      const block = tableFromPaste(text)
      if (!block) {
        setFigureError(
          'That does not look like a table. Copy a range from a spreadsheet — at least a ' +
            'header row and one row under it.',
        )
        return
      }
      insertLine(block.trimEnd())
    } catch {
      setFigureError(
        'This browser would not let Longhand read the clipboard. Paste into the editor and ' +
          'put | between the columns instead.',
      )
    }
  }

  const exportMarkdown = () => {
    download(
      toMarkdown(sheetTitle(sheet.source), lines),
      `${slug(sheet.name)}.md`,
      'text/markdown',
    )
  }

  const saveRevision = () => {
    setStore((current) => snapshotSheet(current, sheet.id, 'Saved by hand'))
  }

  const putBack = (revisionId: string) => {
    setStore((current) => restoreRevision(current, sheet.id, revisionId))
    setCompare(null)
    track('revision restored')
  }

  /**
   * Run the sheet again from nothing and say whether the cached answer held.
   *
   * The incremental cache is what keeps a long sheet responsive and it is also
   * the one place the app could quietly show a stale number. An engineer
   * should be able to prove it did not, without taking our word for it.
   */
  const recalculate = () => {
    setCold(
      recomputeCold(sheet.source, {
        precision: store.precision,
        mode: store.mode,
        libraries,
      }),
    )
    track('recalculated')
  }

  const sendFeedback = (where: 'github' | 'email') => {
    const text = feedback.trim()
    if (!text) return
    window.open(where === 'github' ? issueUrl(text) : mailtoUrl(text), '_blank', 'noreferrer')
    setFeedback('')
    track('feedback opened', { to: where })
  }

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

  const keepOnDisk = async () => {
    const handle = await chooseNewFile(`${slug(project.name)}.longhand.json`)
    if (!handle) return
    await rememberHandle(handle)
    const written = await writeFile(handle, JSON.stringify(store, null, 2))
    setDisk({ handle, state: written ? 'on' : 'needs-permission' })
    if (written) {
      setDiskSavedAt(Date.now())
      setStore((current) => ({ ...current, lastBackupAt: Date.now() }))
    }
  }

  const openFromDisk = async () => {
    const handle = await chooseExistingFile()
    if (!handle) return
    if (!(await requestPermission(handle))) return
    const text = await readFile(handle)
    if (text === null) return
    try {
      const { migrate } = await import('./store')
      setStore(migrate(JSON.parse(text)))
      await rememberHandle(handle)
      setDisk({ handle, state: 'on' })
    } catch {
      /* not one of ours - leave everything as it is */
    }
  }

  const reconnectDisk = async () => {
    if (!disk.handle) return
    if (await requestPermission(disk.handle)) setDisk({ handle: disk.handle, state: 'on' })
  }

  const stopDisk = async () => {
    await forgetHandle()
    setDisk({ handle: null, state: 'off' })
    setDiskSavedAt(null)
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
   * Every sheet in the project, evaluated once.
   *
   * The package summary needs all of them and so does the package preview, so
   * doing it here means each sheet is worked out once rather than twice.
   */
  const packageLines = useMemo(() => {
    if (!printingProject) return null
    return project.sheets.map((candidate) =>
      evaluateSheet(candidate.source, {
        precision: store.precision,
        mode: store.mode,
        libraries: Object.fromEntries(
          project.sheets
            .filter((other) => other.id !== candidate.id)
            .map((other) => [other.name, other.source]),
        ),
      }),
    )
  }, [printingProject, project.sheets, store.precision, store.mode])

  const packageChecks = useMemo(() => {
    if (!packageLines) return null
    return project.sheets.map((candidate, index) => ({
      sheet: candidate,
      summary: summariseChecks(candidate.source, packageLines[index]),
    }))
  }, [packageLines, project.sheets])

  /**
   * Show the whole package as one document and let the user look at it before
   * printing. An explicit mode beats printing straight away: they get to check
   * the order and the title blocks, and there is no timing to get wrong.
   */
  const showPackage = () => {
    setPrintingProject(true)
    setPanel('none')
  }

  /**
   * Chop the document into real pages so each one can say "Page 3 of 7".
   *
   * A browser will not put a counter in an @page margin box, so the only honest
   * way to number pages is to paginate them ourselves. Paged.js does the
   * chopping, against a copy of the already-rendered document — it rewrites
   * what it is given, which is why it gets a copy and not the live React tree.
   */
  const paginate = async () => {
    const pages = outputRef.current?.querySelectorAll('.sheet-page')
    if (!pages || pages.length === 0) return
    setPaged('working')
    try {
      const { Previewer } = await import('pagedjs')
      const target = pagedRef.current!
      target.innerHTML = ''
      const url = URL.createObjectURL(new Blob([pageCss()], { type: 'text/css' }))
      try {
        await new Previewer().preview(
          [...pages].map((page) => page.outerHTML).join(''),
          [url],
          target,
        )
        setPaged('on')
      } finally {
        URL.revokeObjectURL(url)
      }
    } catch {
      setPaged('failed')
    }
  }

  const unpaginate = () => {
    if (pagedRef.current) pagedRef.current.innerHTML = ''
    setPaged('off')
  }

  /**
   * Shortcuts on Alt, which CodeMirror and the browser both mostly leave alone
   * — and Escape, which is the one everybody tries first. Nothing here is
   * required: every one of them is a button somewhere.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (printingProject) setPrintingProject(false)
        else if (panel !== 'none') setPanel('none')
        else return
        event.preventDefault()
        return
      }

      const save = (event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 's'
      if (save) {
        event.preventDefault()
        download(sheet.source, `${slug(sheet.name)}.calc`, 'text/plain')
        return
      }

      if (!event.altKey || event.metaKey || event.ctrlKey) return

      const step = (offset: number) => {
        const sheets = project.sheets
        const at = sheets.findIndex((candidate) => candidate.id === sheet.id)
        const next = sheets[(at + offset + sheets.length) % sheets.length]
        setStore((current) => ({ ...current, activeSheetId: next.id }))
      }
      const toggle = (which: Panel) =>
        setPanel((current) => (current === which ? 'none' : which))

      switch (event.key.toLowerCase()) {
        case 'n':
          addSheet()
          break
        case ']':
          step(1)
          break
        case '[':
          step(-1)
          break
        case 'p':
          toggle('meta')
          break
        case 'h':
          window.open('/docs', '_blank', 'noreferrer')
          break
        case 's':
          setLink(null)
          toggle('share')
          break
        case 'r':
          setCompare(null)
          toggle('history')
          break
        case 'y':
          setTraced(null)
          toggle('symbols')
          break
        case ',':
          toggle('settings')
          break
        default:
          return
      }
      event.preventDefault()
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel, printingProject, project, sheet, addSheet])

  const duplicates = duplicateNames(project)
  const backupAge = backupAgeDays(store)
  const sheetChecks = useMemo(
    () => summariseChecks(deferredSource, lines),
    [deferredSource, lines],
  )
  const revisions = sheet.revisions ?? []
  /**
   * Only while the panel is open.
   *
   * `inspect` reparses every line to build the dependency graph, which on a
   * 300-line sheet added about a second to every keystroke — the one thing the
   * deferred evaluation exists to prevent. Nobody needs the graph while they
   * are typing; they need it when they ask for it.
   */
  const symbols = useMemo(
    () => (panel === 'symbols' ? inspect(deferredSource, lines) : []),
    [panel, deferredSource, lines],
  )

  /**
   * "Somebody wrote something real in it" is the one signal worth having, and
   * twenty lines is roughly where a trial becomes a calculation. Counted once
   * per sheet, ever, and carrying nothing but the fact that it happened.
   */
  useEffect(() => {
    if (sheet.source.split('\n').filter((text) => text.trim()).length >= 20) {
      trackOnce(`long:${sheet.id}`, 'sheet substantial')
    }
  }, [sheet.id, sheet.source])

  if (shared) {
    return (
      <SharedView
        shared={shared}
        precision={store.precision}
        mode={store.mode}
        onCopy={copyShared}
      />
    )
  }

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

      {deleted && (
        <div className="undo-bar no-print">
          <span>
            Deleted {deleted.kind === 'project' ? 'project ' : ''}
            <strong>{deleted.kind === 'project' ? deleted.project.name : deleted.sheet.name}</strong>
            {deleted.kind === 'project' &&
              ` and its ${deleted.project.sheets.length} sheet${
                deleted.project.sheets.length === 1 ? '' : 's'
              }`}
            .
          </span>
          <button onClick={undoDelete}>Undo</button>
        </div>
      )}

      <aside className="sheets">
        <div className="sheets-head">
          <a className="brand" href="/" title="Longhand">
            <Mark size={17} />
            Longhand
          </a>
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
                      <button
                        className={choosingTemplate ? 'sheet add on' : 'sheet add'}
                        aria-expanded={choosingTemplate}
                        onClick={() => setChoosingTemplate((open) => !open)}
                      >
                        + Sheet
                      </button>
                      {choosingTemplate && (
                        <ul className="templates">
                          {TEMPLATES.map((template) => (
                            <li key={template.id}>
                              <button
                                onClick={() => {
                                  setChoosingTemplate(false)
                                  track('template used', { seen: template.id })
                                  addSheet(template.name, template.source)
                                }}
                              >
                                <strong>{template.name}</strong>
                                <span>{template.summary}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
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
          {/* The verdict, where the writing happens. A check that has just
              stopped holding should not wait to be noticed on the right. */}
          {sheetChecks.checks.length > 0 && (
            <span
              className={sheetChecks.failed ? 'sheet-verdict fail' : 'sheet-verdict pass'}
              title={verdictLine(sheetChecks)}
            >
              {sheetChecks.failed ? `${sheetChecks.failed} NOT OK` : 'All OK'}
            </span>
          )}
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
              className={panel === 'share' ? 'on' : ''}
              onClick={() => {
                setLink(null)
                setPanel((current) => (current === 'share' ? 'none' : 'share'))
              }}
            >
              Share
            </button>
            <button
              className={panel === 'history' ? 'on' : ''}
              onClick={() => {
                setCompare(null)
                setPanel((current) => (current === 'history' ? 'none' : 'history'))
              }}
            >
              History
            </button>
            <button
              className={panel === 'symbols' ? 'on' : ''}
              onClick={() => {
                setTraced(null)
                setPanel((current) => (current === 'symbols' ? 'none' : 'symbols'))
              }}
            >
              Symbols
            </button>
            <button onClick={() => figureInput.current?.click()}>Figure</button>
            <a className="toolbar-link" href="/docs" target="_blank" rel="noreferrer">
              Help
            </a>
            <button onClick={() => fileInput.current?.click()}>Open</button>
            <button onClick={save}>Save</button>
            <button
              onClick={() => {
                track('sheet printed')
                window.print()
              }}
            >
              Print
            </button>
          </div>
          <input ref={fileInput} type="file" accept=".calc,.txt,text/plain" onChange={open} hidden />
          <input
            ref={figureInput}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            onChange={addFigure}
            hidden
          />
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
              <label>
                <span>Status</span>
                <select
                  aria-label="Project status"
                  value={project.meta.status ?? 'draft'}
                  onChange={(event) =>
                    setMeta({ status: event.target.value as 'draft' | 'issued' })
                  }
                >
                  <option value="draft">Draft — prints PRELIMINARY</option>
                  <option value="issued">Issued — prints clean</option>
                </select>
              </label>
              <label>
                <span>Footer line</span>
                <input
                  value={project.meta.footer ?? ''}
                  onChange={(event) => setMeta({ footer: event.target.value })}
                  placeholder="Your firm, job number"
                />
              </label>
              <p className="hint">
                Every sheet in this project shares this title block. A draft prints PRELIMINARY
                across every page, because a draft and an issued calculation otherwise look
                identical on paper.
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
                    aria-label="Move this sheet to another project"
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

        {panel === 'share' && (
          <div className="panel">
            <section>
              <h3>Share this sheet</h3>
              <p className="hint">
                The whole calculation is compressed into the link itself, so it opens without an
                account and without a server. Nothing is uploaded — the words travel in the
                address, which means anyone with the link can read the sheet, and nobody without
                it can.
              </p>
              <div className="settings-buttons">
                <button className="primary" onClick={makeShareLink}>
                  {link ? 'Make the link again' : 'Copy a link to this sheet'}
                </button>
              </div>

              {link && (
                <>
                  <p className={link.copied ? 'hint' : 'warning'}>
                    {link.copied
                      ? 'Copied to the clipboard.'
                      : 'This browser would not let Longhand use the clipboard — copy it from here.'}
                  </p>
                  <textarea
                    className="link-box"
                    readOnly
                    rows={3}
                    value={link.url}
                    onFocus={(event) => event.target.select()}
                    aria-label="Share link"
                  />
                  <p className="hint">{link.url.length.toLocaleString()} characters.</p>
                  {link.url.length > LONG_LINK && (
                    <p className="warning">
                      That is long enough that some mail clients will wrap it and break it. Send
                      it in something that treats it as one link, or send the .calc file instead.
                    </p>
                  )}
                </>
              )}
            </section>

            <section>
              <h3>What the reader gets</h3>
              <p className="hint">
                The sheet opens read-only with a “make a copy” button, showing the same three
                stages you see here, plus any figures on it. They do not get your title block or
                your project — only this one calculation, as it stands right now. A link is a
                snapshot: changing the sheet afterwards does not change what an already-sent link
                opens.
              </p>
              {importedNames(sheet.source).length > 0 && (
                <p className="hint">
                  This sheet imports{' '}
                  {importedNames(sheet.source)
                    .map((name) => `"${name}"`)
                    .join(', ')}
                  , so {importedNames(sheet.source).length === 1 ? 'that sheet goes' : 'those sheets go'}{' '}
                  in the link too — otherwise it would arrive with every number undefined. Check
                  you are happy to send {importedNames(sheet.source).length === 1 ? 'it' : 'them'}.
                </p>
              )}
            </section>
          </div>
        )}

        {panel === 'history' && (
          <div className="panel">
            <section>
              <h3>History</h3>
              <p className="hint">
                A snapshot is taken while you work, and you can take one yourself before a change
                you might want to undo. Pick one to see what changed since.
              </p>
              <div className="settings-buttons">
                <button onClick={saveRevision}>Save a revision now</button>
              </div>

              {revisions.length === 0 ? (
                <p className="hint">
                  Nothing yet. The first snapshot is taken a few minutes into editing.
                </p>
              ) : (
                <ul className="revisions">
                  {[...revisions].reverse().map((revision: Revision) => {
                    const change = diffLines(revision.source, sheet.source)
                    const open = compare === revision.id
                    return (
                      <li key={revision.id} className={open ? 'open' : ''}>
                        <button
                          className="revision-head"
                          onClick={() => setCompare(open ? null : revision.id)}
                        >
                          <span className="when">
                            {new Date(revision.at).toLocaleString('sv-SE').slice(0, 16)}
                          </span>
                          <span className="what">{revision.label || 'While editing'}</span>
                          <span className="delta">{describeDiff(change)}</span>
                        </button>
                        {open && (
                          <div className="revision-body">
                            {change.identical ? (
                              <p className="hint">This is the sheet exactly as it stands now.</p>
                            ) : (
                              <pre className="diff">
                                {withContext(change).map((row, index) => (
                                  <div key={index} className={`row ${row.kind}`}>
                                    <span className="sign">
                                      {row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '}
                                    </span>
                                    {row.text || ' '}
                                  </div>
                                ))}
                              </pre>
                            )}
                            <div className="settings-buttons">
                              <button onClick={() => putBack(revision.id)} disabled={change.identical}>
                                Put this version back
                              </button>
                              <button
                                onClick={() =>
                                  setStore((current) =>
                                    deleteRevision(current, sheet.id, revision.id),
                                  )
                                }
                              >
                                Forget it
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              <p className="hint">
                Restoring keeps where you are now as its own snapshot first, so looking through
                history can never be the thing that loses work.
              </p>
            </section>
          </div>
        )}

        {panel === 'symbols' && (
          <div className="panel">
            <section>
              <h3>Symbols</h3>
              <p className="hint">
                Everything this sheet defines, and what it is tied to. On twenty lines you can
                hold this in your head; on two hundred, “what would change if I changed this”
                is the question to answer before altering anything somebody else will check.
              </p>
              {symbols.length === 0 ? (
                <p className="hint">This sheet does not define anything yet.</p>
              ) : (
                <>
                  <ul className="symbols">
                    {symbols.map((symbol) => {
                      const affected = traced === symbol.name ? downstream(symbols, symbol.name) : []
                      return (
                        <li key={`${symbol.name}-${symbol.line}`}>
                          <button
                            className="symbol-head"
                            onClick={() => setTraced(traced === symbol.name ? null : symbol.name)}
                          >
                            <code>{symbol.name}</code>
                            <span className="symbol-value">{symbol.value}</span>
                            <span className="symbol-where">
                              {symbol.equation ? `eq. ${symbol.equation}` : `line ${symbol.line}`}
                            </span>
                          </button>
                          {traced === symbol.name && (
                            <div className="symbol-body">
                              <p>
                                <strong>Built from:</strong>{' '}
                                {symbol.dependsOn.length ? symbol.dependsOn.join(', ') : 'nothing — it is an input'}
                              </p>
                              <p>
                                <strong>Used directly by:</strong>{' '}
                                {symbol.usedBy.length ? symbol.usedBy.join(', ') : 'nothing'}
                              </p>
                              <p>
                                <strong>Changing it would redo:</strong>{' '}
                                {affected.length ? affected.join(', ') : 'nothing downstream'}
                              </p>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {symbols.some((symbol) => symbol.unused) && (
                    <p className="hint">
                      Nothing uses{' '}
                      {symbols
                        .filter((symbol) => symbol.unused)
                        .map((symbol) => symbol.name)
                        .join(', ')}
                      . Sometimes that is deliberate; sometimes it is a name typed two ways.
                    </p>
                  )}
                </>
              )}
            </section>

            <section>
              <h3>Take it elsewhere</h3>
              <p className="hint">
                Markdown for a report appendix, and a spreadsheet range pasted in as a table
                rather than retyped.
              </p>
              <div className="settings-buttons">
                <button onClick={exportMarkdown}>Export as Markdown</button>
                <button onClick={pasteTable}>Paste a spreadsheet range</button>
              </div>
              {figureError && <p className="warning">{figureError}</p>}
            </section>
          </div>
        )}

        {panel === 'feedback' && (
          <div className="panel">
            <section>
              <h3>What is missing?</h3>
              <p className="hint">
                One line is enough. There is no server here, so this opens a GitHub issue or an
                email with what you wrote in it — nothing is sent until you send it.
              </p>
              <textarea
                rows={4}
                value={feedback}
                placeholder="The thing I wanted to write and could not…"
                onChange={(event) => setFeedback(event.target.value)}
                aria-label="What is missing?"
              />
              <div className="settings-buttons">
                <button
                  className="primary"
                  onClick={() => sendFeedback('github')}
                  disabled={!feedback.trim()}
                >
                  Open a GitHub issue
                </button>
                <button onClick={() => sendFeedback('email')} disabled={!feedback.trim()}>
                  Send it by email
                </button>
              </div>
              <p className="hint">
                Your calculation is not attached to either. If the problem is a sheet, say so and
                paste the lines you are happy to share.
              </p>
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
              {disk.state === 'on' ? (
                <p className="hint">
                  Saving to <strong>{disk.handle?.name}</strong> as you type
                  {diskSavedAt ? `, last written ${new Date(diskSavedAt).toLocaleTimeString()}` : ''}.
                  This browser keeps a copy too.
                </p>
              ) : (
                <p className="hint">
                  Everything is stored in this browser only.{' '}
                  {backupAge === null
                    ? 'No backup has ever been exported.'
                    : backupAge === 0
                      ? 'Last backup: today.'
                      : `Last backup: ${backupAge} day${backupAge === 1 ? '' : 's'} ago.`}
                </p>
              )}

              {disk.state === 'needs-permission' && (
                <p className="warning">
                  {disk.handle?.name} is no longer writable — the browser needs you to allow it
                  again.
                </p>
              )}

              <div className="settings-buttons">
                {disk.state === 'off' && (
                  <>
                    <button onClick={keepOnDisk}>Keep a copy on disk…</button>
                    <button onClick={openFromDisk}>Open a file from disk…</button>
                  </>
                )}
                {disk.state === 'needs-permission' && (
                  <button onClick={reconnectDisk}>Reconnect {disk.handle?.name}</button>
                )}
                {disk.state === 'on' && <button onClick={stopDisk}>Stop saving to the file</button>}
                <button onClick={exportAll}>Export backup</button>
                <button onClick={() => backupInput.current?.click()}>Restore backup</button>
              </div>

              {disk.state === 'unsupported' && (
                <p className="hint">
                  This browser cannot write to a file you choose, so a backup is the only copy
                  outside it. Chrome and Edge can.
                </p>
              )}
            </section>

            <section>
              <h3>Trust</h3>
              <p className="hint">
                Longhand reuses everything above the first line you edited, which is what keeps a
                long sheet responsive. This runs the sheet again from nothing and compares the
                two, so you never have to take that on faith.
              </p>
              <div className="settings-buttons">
                <button onClick={recalculate}>Recalculate from scratch</button>
              </div>
              {cold && (
                <p className={cold.equal ? 'hint' : 'warning'}>
                  {cold.equal ? (
                    <>
                      All {cold.lines} lines identical to the cached run, worked out again in{' '}
                      {cold.milliseconds} ms.
                    </>
                  ) : (
                    <>
                      Line {cold.firstDifference} differs between the cached run and a fresh one.
                      This is a bug in Longhand — please report it, and use the fresh values now
                      on screen.
                    </>
                  )}
                </p>
              )}
              <p className="hint">{buildStamp()}</p>
            </section>

            <section>
              <h3>Figures</h3>
              <p className="hint">
                {Object.keys(sheet.figures ?? {}).length === 0
                  ? 'No images on this sheet. “Figure” in the toolbar attaches one at the cursor.'
                  : `${Object.keys(sheet.figures ?? {}).length} image${
                      Object.keys(sheet.figures ?? {}).length === 1 ? '' : 's'
                    } on this sheet, about ${humanSize(figuresSize(sheet.figures))} of this browser's storage.`}
              </p>
              {figureError && <p className="warning">{figureError}</p>}
            </section>

            <section>
              <h3>Counting</h3>
              <p className="hint">
                Longhand counts how many sheets get made and whether anyone comes back — never
                what is in them. No cookie, no account, no identifier, and the address of a shared
                link is never sent. Switching this off stops even that.
              </p>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={counting}
                  onChange={(event) => {
                    setCounting(event.target.checked)
                    setOptedOut(!event.target.checked)
                  }}
                />
                <span>Let Longhand count anonymous usage</span>
              </label>
              <p className="hint">
                <a href="/privacy" target="_blank" rel="noreferrer">
                  What is and is not collected
                </a>
              </p>
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
              <h3>Say something</h3>
              <p className="hint">
                The fastest way to change what gets built next.
              </p>
              <div className="settings-buttons">
                <button onClick={() => setPanel('feedback')}>What is missing?</button>
                <a className="toolbar-link" href={ISSUES_URL} target="_blank" rel="noreferrer">
                  Everything already reported
                </a>
              </div>
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

        <Editor
          value={sheet.source}
          results={lines}
          onChange={(source) => patchSheet({ source })}
          onReady={(view) => {
            editorRef.current = view
          }}
        />
      </div>

      <div
        className={
          [
            printingProject ? 'output-pane package' : 'output-pane',
            stale ? 'stale' : '',
            paged === 'on' ? 'paginated' : '',
          ]
            .filter(Boolean)
            .join(' ')
        }
        ref={outputRef}
      >
        {printingProject && (
          <div className="package-bar no-print">
            <span>
              {paged === 'on'
                ? `${pagedRef.current?.querySelectorAll('.pagedjs_page').length ?? 0} pages — ${project.name}`
                : `Package preview — ${project.name}, ${project.sheets.length} sheet${
                    project.sheets.length === 1 ? '' : 's'
                  }`}
              {paged === 'failed' && ' — could not paginate; printing works without page numbers'}
            </span>
            <div className="package-bar-actions">
              {paged === 'off' || paged === 'failed' ? (
                <button onClick={paginate}>Number the pages</button>
              ) : (
                <button onClick={unpaginate} disabled={paged === 'working'}>
                  {paged === 'working' ? 'Paginating…' : 'Back to one long page'}
                </button>
              )}
              <button
                onClick={() => {
                  track('package printed', { paged: paged === 'on', sheets: project.sheets.length })
                  window.print()
                }}
                disabled={paged === 'working'}
              >
                Print package
              </button>
              <button
                onClick={() => {
                  unpaginate()
                  setPrintingProject(false)
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Paged.js renders here; the unpaginated document below is hidden while
            it does, so what is on screen is what will print. */}
        <div className="paged-output" ref={pagedRef} />

        {printingProject ? (
          <>
            {packageChecks && packageChecks.some((entry) => entry.summary.checks.length > 0) && (
              <div className="sheet-page">
                <TitleBlock project={project} title={`${project.name} — checks`} />
                {/* Every verdict in the package, on one page. It is the page a
                    reviewer reads first and the only one some of them read. */}
                <section className="checks-summary package-checks">
                  <header>
                    <h3>All checks in this package</h3>
                    <span
                      className={
                        packageChecks.some((entry) => entry.summary.failed)
                          ? 'overall fail'
                          : 'overall pass'
                      }
                    >
                      {packageChecks.reduce(
                        (total, entry) => total + entry.summary.checks.length,
                        0,
                      )}{' '}
                      checks,{' '}
                      {packageChecks.reduce((total, entry) => total + entry.summary.failed, 0) ||
                        'none'}{' '}
                      not OK
                    </span>
                  </header>
                  {packageChecks
                    .filter((entry) => entry.summary.checks.length > 0)
                    .map((entry) => (
                      <div key={entry.sheet.id} className="package-sheet">
                        <h4>{entry.sheet.name}</h4>
                        <ol>
                          {entry.summary.checks.map((check, index) => (
                            <li key={index} className={check.pass ? 'pass' : 'fail'}>
                              <span className="what">
                                {check.label}
                                {check.section && <em className="where">{check.section}</em>}
                              </span>
                              <span className="badge">{check.pass ? 'OK' : 'NOT OK'}</span>
                              <span className="margin">{check.margin ?? ''}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                </section>
                <p className="sheet-foot">
                  {DISCLAIMER} {buildStamp()}
                </p>
              </div>
            )}
            {project.sheets.map((candidate, index) => (
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
                lines={packageLines?.[index]}
              />
            ))}
          </>
        ) : (
          <SheetDocument
            sheet={{ ...sheet, source: deferredSource }}
            project={project}
            precision={store.precision}
            mode={store.mode}
            libraries={libraries}
            lines={lines}
            onJump={(index) => {
              const target = document.getElementById(`check-${sheet.id}-${index}`)
              target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
              target?.classList.add('flash')
              setTimeout(() => target?.classList.remove('flash'), 1200)
            }}
          />
        )}
      </div>
    </div>
  )
}
