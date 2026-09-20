import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { EditorView } from '@codemirror/view'
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
import { findExample } from './examples'
import { CONSTANTS_NAME, CONSTANTS_SHEET } from './constants'
import { inspect, downstream, toMarkdown, tableFromPaste } from './inspect'
import { summariseChecks, tightest, verdictLine, type SheetChecks } from './checks'
import { DISCLAIMER, buildStamp } from './build'
import { ISSUES_URL, issueUrl, mailtoUrl, optedOut, setOptedOut, start, track, trackOnce } from './analytics'
import { LONG_LINK, importedNames, shareLink, sheetFromLocation, type SharedSheet } from './share'
import { describeDiff, diffLines, withContext } from './diff'
import { toLatex, toWordHtml, type DocumentMeta } from './export'
import { CommandPalette, type Command } from './Commands'
import { useEvaluation } from './evaluator'
import {
  checkSignature,
  shortHash,
  sign,
  signatureLine,
  type Signature,
  type SignatureState,
} from './signature'
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

/**
 * One line of the document.
 *
 * Memoised because the engine hands back the *same* line objects for
 * everything above the first edited line, so React can skip them entirely
 * rather than re-rendering a formula that did not change.
 */
const Rendered = memo(function Rendered({
  line,
  figures,
  anchor,
  prose,
}: {
  line: Line
  /** Images for `figure` lines, held beside the sheet rather than in it. */
  figures?: Record<string, string>
  /** An id to jump to from the checks summary. */
  anchor?: string
  /**
   * For a prose line: the whole run of comment lines it belongs to, joined,
   * or the empty string when an earlier line already printed the run.
   */
  prose?: string
}) {
  switch (line.kind) {
    case 'blank':
      return <div className="blank" />

    case 'heading':
      return <h2 className={`heading h${line.level}`}>{line.text}</h2>

    case 'prose':
      // A run of comment lines is one paragraph. Somebody writing three lines
      // of reasoning wrapped them because the editor is narrow, not because
      // they meant three paragraphs, and printing them as three left the
      // document full of gaps that were not in the author's head.
      return prose === '' ? null : <p className="prose">{prose ?? line.text}</p>

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
      // A table of eight columns is unreadable down a portrait page, and a
      // table of eight columns is the common case — one row per load case,
      // one column per quantity. Past the threshold the page turns instead
      // of the text shrinking.
      return (
        <div className={line.headers.length >= WIDE_TABLE ? 'table-scroll wide' : 'table-scroll'}>
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
})

/**
 * Table cells and tolerances are plain text, so "1.250e7 mm^3" would print
 * exactly like that. Render it the way it is written: 1.250·10⁷ mm³, with a
 * real micro sign. A leading "± " is passed through untouched.
 */
/**
 * Names in the symbols panel, each one a way back to where it was defined.
 *
 * Reading a dependency list and then hunting for the line it names is the
 * hunting we are trying to get rid of, so the list itself is the navigation.
 */
function SymbolLinks({ names, onPick }: { names: string[]; onPick: (name: string) => void }) {
  return (
    <>
      {names.map((name, index) => (
        <span key={name}>
          {index > 0 && ', '}
          <button className="symbol-link" onClick={() => onPick(name)}>
            {name}
          </button>
        </span>
      ))}
    </>
  )
}

/**
 * How many columns before a table is printed on its side.
 *
 * Six is where a table stops fitting the 180mm of a portrait A4 at a size
 * anybody would read: five columns of quantities plus a label is about the
 * width of the text column, and the next one pushes past it.
 */
const WIDE_TABLE = 6

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

/**
 * Rendered formulas, kept across renders rather than per component.
 *
 * KaTeX is fast for one formula and not for three hundred, and a `useMemo`
 * inside the component only helps while that component stays mounted — every
 * recompute builds a new line array, React rebuilds the tree, and all three
 * hundred formulas are typeset again even though almost none of them changed.
 * Keyed by the TeX itself, the second pass costs nothing.
 *
 * The cap is there so that an afternoon of editing does not accumulate every
 * formula that ever existed; the oldest entries go first, and the worst case
 * of a miss is what we used to do every time.
 */
const rendered = new Map<string, string>()
const MAX_RENDERED = 4000

function typeset(tex: string): string {
  const hit = rendered.get(tex)
  if (hit !== undefined) return hit
  const html = katex.renderToString(tex, { displayMode: true, throwOnError: false })
  if (rendered.size >= MAX_RENDERED) {
    for (const key of [...rendered.keys()].slice(0, MAX_RENDERED / 4)) rendered.delete(key)
  }
  rendered.set(tex, html)
  return html
}

function Tex({ tex, className }: { tex: string; className: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: typeset(tex) }} />
}

/**
 * Whether this sheet's signature still matches what is on screen.
 *
 * Hashing is asynchronous because the platform's is, so the answer arrives a
 * frame late. It starts at "unsigned", which is the safe thing to say while
 * we do not yet know: a claim that a sheet is checked should never appear
 * before it has been verified, even for one frame.
 */
function useSignatureState(source: string, signature?: Signature): SignatureState {
  const [state, setState] = useState<SignatureState>('unsigned')

  useEffect(() => {
    let current = true
    void checkSignature(source, signature).then((next) => {
      if (current) setState(next)
    })
    return () => {
      current = false
    }
  }, [source, signature])

  return state
}

/** ⌘ on a Mac, Ctrl everywhere else — written the way the keyboard is labelled. */
function modifierKey(): string {
  if (typeof navigator === 'undefined') return 'Ctrl+'
  return /Mac|iPhone|iPad/.test(navigator.userAgent) ? '\u2318' : 'Ctrl+'
}

/**
 * A toolbar button that opens a short menu.
 *
 * The toolbar had eleven controls and wrapped onto a second row, which is the
 * point at which a toolbar stops being a toolbar and becomes a wall. The rule
 * for what stays out: it is used on most sheets. Everything else lives here,
 * grouped, and in the command palette for anybody who would rather type.
 */
function ToolbarMenu({
  label,
  active,
  children,
}: {
  label: string
  /** True when one of the panels this menu owns is the one on screen. */
  active?: boolean
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="toolbar-menu" ref={holder}>
      <button
        className={open || active ? 'on' : ''}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label} <span aria-hidden="true">▾</span>
      </button>
      {open && <div className="menu">{children(() => setOpen(false))}</div>}
    </div>
  )
}

/**
 * Whether the machine currently has a network.
 *
 * Only ever used to say something reassuring: the app does not behave
 * differently offline, because it never needed the network to compute. Saying
 * so out loud is the point — people assume a web app is dead without a bar of
 * signal and close it.
 */
function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  return online
}

function TitleBlock({
  project,
  title,
  position,
  signature,
  signatureState,
}: {
  project: Project
  title: string
  position?: string
  signature?: Signature
  signatureState?: SignatureState
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
      {/* A signature that has been outrun by an edit has to say so on paper,
          not only on screen — the paper is what gets filed. */}
      {signatureState && signatureState !== 'unsigned' && (
        <p className={signatureState === 'valid' ? 'signature valid' : 'signature stale'}>
          {signatureLine(signatureState, signature)}
        </p>
      )}
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
  const signatureState = useSignatureState(sheet.source, sheet.signature)
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
      <TitleBlock
        project={project}
        title={title}
        position={position}
        signature={sheet.signature}
        signatureState={signatureState}
      />
      <ChecksSummary summary={checks} onJump={onJump} anchorFor={anchorFor} />
      {lines.map((line, index) =>
        index === titleLine ? null : (
          <Rendered
            key={index}
            line={line}
            figures={sheet.figures}
            anchor={line.kind === 'check' ? anchorFor(index) : undefined}
            prose={line.kind === 'prose' ? proseRun(lines, index) : undefined}
          />
        ),
      )}
      {/* A sheet with nothing worked out in it shows a title block and two
          inches of white, which tells a first-time reader nothing at all. */}
      {!lines.some((line) => line.kind === 'calc' || line.kind === 'table' || line.kind === 'check') && (
        <p className="empty-hint no-print">
          Nothing computed yet. Write a line like <code>b = 300 mm</code> on the left, or press{' '}
          <kbd>/</kbd> on an empty line for the list of everything you can write.
        </p>
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
 * A run of consecutive comment lines, as one paragraph.
 *
 * Returns the joined run when this line starts it, and the empty string when
 * an earlier line has already printed it — so the caller can keep the line
 * array intact, which the check anchors depend on.
 */
function proseRun(lines: Line[], index: number): string {
  if (lines[index - 1]?.kind === 'prose') return ''
  const run: string[] = []
  for (let at = index; lines[at]?.kind === 'prose'; at += 1) {
    const line = lines[at]
    if (line.kind === 'prose') run.push(line.text)
  }
  return run.join(' ')
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

/* A wide table gets a page of its own, turned on its side. Named pages are
   what the spec provides for exactly this, and Paged.js implements them. */
@page wide {
  size: A4 landscape;
  margin: 15mm 16mm 18mm;
}

.table-scroll.wide {
  page: wide;
  break-before: page;
  break-after: page;
}

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
  /**
   * On a phone, a shared link opens the document, not the editor.
   *
   * The person following a shared link is almost always reviewing rather than
   * writing — a colleague, a checker, a manager approving something from a
   * train — and on a narrow screen the editor takes half the height to show
   * source they did not ask for. The source is one tap away, because a
   * reviewer who wants to see what was actually typed must be able to.
   */
  const [reading, setReading] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches,
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
    <div className={reading ? 'app shared reading' : 'app shared'}>
      <div className="shared-bar no-print">
        <span>
          <strong>Shared calculation.</strong> It came with the link — nothing was fetched from a
          server, and nothing you do here is sent anywhere.
        </span>
        <div className="shared-actions">
          <button className="toolbar-link source-toggle" onClick={() => setReading(!reading)}>
            {reading ? 'Show the working' : 'Hide the working'}
          </button>
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
  const editorRef = useRef<EditorView | null>(null)
  const figureInput = useRef<HTMLInputElement>(null)
  const tableInput = useRef<HTMLInputElement>(null)
  const [dropping, setDropping] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [signedBy, setSignedBy] = useState('')
  const [commanding, setCommanding] = useState(false)
  const online = useOnline()
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
  const activeSignature = useSignatureState(sheet.source, sheet.signature)

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

  /**
   * Put the cursor on a line of the source and show it.
   *
   * "Where was f_yd defined" is the question you ask most often on a long
   * sheet, and until now the only answer was to scroll. The symbols panel
   * knows the line; this is what turns knowing into going.
   */
  const jumpToLine = (number: number) => {
    const view = editorRef.current
    if (!view || number < 1 || number > view.state.doc.lines) return
    const line = view.state.doc.line(number)
    view.dispatch({
      selection: { anchor: line.from },
      effects: EditorView.scrollIntoView(line.from, { y: 'center' }),
    })
    view.focus()
  }

  /** The same, given a name rather than a line. */
  const jumpToSymbol = (name: string) => {
    const found = symbols.find((symbol) => symbol.name === name)
    if (found) jumpToLine(found.line)
  }

  /**
   * A spreadsheet export, dropped in and turned into a table block.
   *
   * Retyping twenty rows of section properties is the single most tedious
   * thing about starting a sheet, and every tool an engineer already has —
   * Excel, Sheets, a supplier's download — will give you a CSV. What lands in
   * the sheet is an ordinary table block they can edit, not an attachment:
   * the numbers are in the calculation where a checker can see them.
   */
  const importTable = async (file: File) => {
    setImportError(null)
    if (/\.xlsx?$/i.test(file.name)) {
      setImportError(
        'Excel workbooks are not readable here — the file is a zip of XML, and guessing at it ' +
          'is how you get a table of wrong numbers. In Excel: File → Save As → CSV, then drop that in.',
      )
      return
    }
    if (file.size > 2_000_000) {
      setImportError('That file is over 2 MB. A table that big belongs in a database, not a sheet.')
      return
    }
    const text = await file.text()
    const name = file.name
      .replace(/\.[^.]+$/, '')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(\d)/, 't$1')
    const block = tableFromPaste(text, name)
    if (!block) {
      setImportError(
        `Nothing table-shaped in ${file.name} — it needs a header row and at least one row under it, ` +
          'separated by commas, semicolons or tabs.',
      )
      return
    }
    insertLine(block.replace(/\n+$/, ''))
    track('table imported')
  }

  const chooseTable = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) await importTable(file)
  }

  /**
   * Sign this sheet off as checked.
   *
   * What gets stored is a hash of the text as it stands, so the claim is
   * about this exact sheet rather than about a name in a box. Edit a line
   * afterwards and the sheet says so — on screen and on paper.
   */
  const signSheet = async () => {
    const by = (signedBy || store.settings.author).trim()
    if (!by) return
    const signature = await sign(sheet.source, by, project.meta.revision || '')
    patchSheet({ signature })
    setSignedBy('')
    track('sheet signed')
  }

  const unsignSheet = () => patchSheet({ signature: undefined })

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

  /** What an appendix needs to say about where it came from. */
  const documentMeta = (): DocumentMeta => ({
    project: project.name,
    client: project.meta.client,
    author: project.meta.author,
    checkedBy: project.meta.checkedBy,
    revision: project.meta.revision,
    signature: signatureLine(activeSignature, sheet.signature) || undefined,
  })

  const exportLatex = () => {
    download(
      toLatex(sheetTitle(sheet.source), lines, documentMeta()),
      `${slug(sheet.name)}.tex`,
      'application/x-tex',
    )
    track('exported', { to: 'latex' })
  }

  /**
   * Word opens HTML, and reads MathML inside it as its own equations — which
   * is what makes this an appendix somebody can correct rather than a picture
   * of one. KaTeX already knows how to produce the MathML.
   */
  const exportWord = () => {
    const mathml = (tex: string) =>
      katex.renderToString(tex, { output: 'mathml', displayMode: true, throwOnError: false })
    download(
      toWordHtml(sheetTitle(sheet.source), lines, mathml, documentMeta()),
      `${slug(sheet.name)}.doc`,
      'application/msword',
    )
    track('exported', { to: 'word' })
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
   * The results, worked out in a worker so that typing never waits for them.
   *
   * A 300-line sheet with tolerances takes most of a second to redo when the
   * edit is near the top, because every line below it has to be redone and
   * each one needs a symbolic derivative. `useDeferredValue` stopped React
   * from *rendering* that work at the wrong moment but the arithmetic still
   * ran on the thread handling keystrokes. Now it does not, and the dimming
   * that always said "these results are a moment behind" is telling the truth
   * rather than describing a pause.
   *
   * `deferredSource` stays because the render of three hundred formulas is
   * its own cost, and it is the thing React is allowed to abandon.
   */
  const deferredSource = useDeferredValue(sheet.source)
  const { lines, computing } = useEvaluation(deferredSource, {
    precision: store.precision,
    mode: store.mode,
    libraries,
  })
  const stale = computing || deferredSource !== sheet.source

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
        if (commanding) setCommanding(false)
        else if (printingProject) setPrintingProject(false)
        else if (panel !== 'none') setPanel('none')
        else return
        event.preventDefault()
        return
      }

      const modifier = (event.metaKey || event.ctrlKey) && !event.altKey
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommanding((current) => !current)
        return
      }

      const save = modifier && event.key.toLowerCase() === 's'
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
  }, [panel, printingProject, project, sheet, addSheet, commanding])

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

  /**
   * The command list, rebuilt when what it can do changes.
   *
   * Sheets come first among the groups because switching sheets is what
   * anybody with a real project does twenty times an hour, and the rest are
   * the toolbar and the panels — everything that is a button somewhere, so
   * the palette never becomes the only way to do anything.
   */
  const commands: Command[] = [
    ...project.sheets
      .filter((candidate) => candidate.id !== sheet.id)
      .map((candidate) => ({
        id: `sheet:${candidate.id}`,
        label: candidate.name,
        group: 'Go to sheet',
        hint: project.name,
        run: () => setStore((current) => ({ ...current, activeSheetId: candidate.id })),
      })),
    ...store.projects
      .filter((candidate) => candidate.id !== project.id)
      .map((candidate) => ({
        id: `project:${candidate.id}`,
        label: candidate.name,
        group: 'Go to project',
        hint: `${candidate.sheets.length} sheet${candidate.sheets.length === 1 ? '' : 's'}`,
        run: () =>
          setStore((current) => ({
            ...current,
            activeProjectId: candidate.id,
            activeSheetId: candidate.sheets[0].id,
          })),
      })),
    { id: 'new-sheet', label: 'New sheet', group: 'Make', hint: 'Alt+N', run: () => addSheet() },
    { id: 'new-project', label: 'New project', group: 'Make', run: addProject },
    { id: 'duplicate', label: 'Duplicate this sheet', group: 'Make', run: duplicateSheet },
    {
      id: 'figure',
      label: 'Add a figure',
      group: 'Make',
      run: () => figureInput.current?.click(),
    },
    {
      id: 'table',
      label: 'Import a table from a CSV',
      group: 'Make',
      run: () => tableInput.current?.click(),
    },
    {
      id: 'print',
      label: 'Print this sheet',
      group: 'Send',
      hint: 'Cmd+P',
      run: () => {
        track('sheet printed')
        window.print()
      },
    },
    {
      id: 'package',
      label: 'Print the whole project',
      group: 'Send',
      run: () => setPrintingProject(true),
    },
    {
      id: 'share',
      label: 'Share this sheet as a link',
      group: 'Send',
      hint: 'Alt+S',
      run: () => {
        setLink(null)
        setPanel('share')
      },
    },
    { id: 'save', label: 'Save to a file', group: 'Send', hint: 'Cmd+S', run: save },
    { id: 'open', label: 'Open a file', group: 'Send', run: () => fileInput.current?.click() },
    { id: 'word', label: 'Export for Word', group: 'Send', run: exportWord },
    { id: 'latex', label: 'Export as LaTeX', group: 'Send', run: exportLatex },
    { id: 'markdown', label: 'Export as Markdown', group: 'Send', run: exportMarkdown },
    {
      id: 'sign',
      label: activeSignature === 'valid' ? 'Signature and checking' : 'Sign this sheet as checked',
      group: 'Check',
      run: () => setPanel('meta'),
    },
    { id: 'recalc', label: 'Recalculate from nothing', group: 'Check', run: recalculate },
    {
      id: 'symbols',
      label: 'Symbols — every name and what depends on it',
      group: 'Check',
      hint: 'Alt+Y',
      run: () => {
        setTraced(null)
        setPanel('symbols')
      },
    },
    {
      id: 'history',
      label: 'History and revisions',
      group: 'Check',
      hint: 'Alt+R',
      run: () => setPanel('history'),
    },
    {
      id: 'meta',
      label: 'Project settings and title block',
      group: 'Open',
      hint: 'Alt+P',
      run: () => setPanel('meta'),
    },
    {
      id: 'settings',
      label: 'Settings',
      group: 'Open',
      hint: 'Alt+,',
      run: () => setPanel('settings'),
    },
    {
      id: 'help',
      label: 'Help and the language reference',
      group: 'Open',
      hint: 'Alt+H',
      run: () => window.open('/docs', '_blank', 'noreferrer'),
    },
    {
      id: 'theme',
      label: `Switch to the ${store.settings.theme === 'dark' ? 'light' : 'dark'} theme`,
      group: 'Open',
      run: () => setSettings({ theme: store.settings.theme === 'dark' ? 'light' : 'dark' }),
    },
  ]

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

      {commanding && (
        <CommandPalette commands={commands} onClose={() => setCommanding(false)} />
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
          {/* The verdict, where the writing happens. A check that has just
              stopped holding should not wait to be noticed on the right. */}
          {/* Saying a check failed and making you find it are two different
              jobs. The chip does both: it is the first thing you see and the
              shortest way to the line it is talking about. */}
          {sheetChecks.checks.length > 0 && (
            <button
              className={sheetChecks.failed ? 'sheet-verdict fail' : 'sheet-verdict pass'}
              title={`${verdictLine(sheetChecks)} — click to go to it`}
              onClick={() => {
                const target =
                  sheetChecks.checks.find((candidate) => !candidate.pass) ?? sheetChecks.checks[0]
                jumpToLine(target.index + 1)
              }}
            >
              {sheetChecks.failed ? `${sheetChecks.failed} NOT OK` : 'All OK'}
            </button>
          )}
          <div className="toolbar-actions">
            {/* Three buttons and a menu. There were eleven, which wrapped onto
                a second row and made the most-used thing on the screen look
                like a control panel. What stays out is what gets used on most
                sheets; everything else is one click deeper, and everything at
                all is a keystroke away in the command palette. */}
            <button
              className={panel === 'meta' ? 'on' : ''}
              onClick={() => setPanel((current) => (current === 'meta' ? 'none' : 'meta'))}
            >
              Project
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
              onClick={() => {
                track('sheet printed')
                window.print()
              }}
            >
              Print
            </button>
            <ToolbarMenu
              label="More"
              active={panel === 'settings' || panel === 'history' || panel === 'symbols'}
            >
              {(close) => (
                <>
                  <p className="menu-group">This sheet</p>
                  <button
                    onClick={() => {
                      close()
                      setTraced(null)
                      setPanel('symbols')
                    }}
                  >
                    Symbols and export
                  </button>
                  <button
                    onClick={() => {
                      close()
                      setCompare(null)
                      setPanel('history')
                    }}
                  >
                    History and revisions
                  </button>
                  <p className="menu-group">Insert</p>
                  <button
                    onClick={() => {
                      close()
                      figureInput.current?.click()
                    }}
                  >
                    A figure
                  </button>
                  <button
                    onClick={() => {
                      close()
                      tableInput.current?.click()
                    }}
                  >
                    A table from a CSV
                  </button>
                  <p className="menu-group">Files</p>
                  <button
                    onClick={() => {
                      close()
                      fileInput.current?.click()
                    }}
                  >
                    Open a sheet
                  </button>
                  <button
                    onClick={() => {
                      close()
                      save()
                    }}
                  >
                    Save to a file
                  </button>
                  <p className="menu-group">App</p>
                  <button
                    onClick={() => {
                      close()
                      setPanel('settings')
                    }}
                  >
                    Settings
                  </button>
                  <a href="/docs" target="_blank" rel="noreferrer" onClick={close}>
                    Help and reference
                  </a>
                </>
              )}
            </ToolbarMenu>
            {/* The palette is the answer to "where did the button go", so it
                has to be visible rather than folklore. */}
            <button className="kbd-hint" onClick={() => setCommanding(true)} title="Everything the app can do">
              {modifierKey()}K
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
          <input
            ref={tableInput}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            onChange={chooseTable}
            hidden
          />
        </div>

        {panel === 'meta' && (
          <div className="panel" data-panel="meta">
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
              <h3>Checked</h3>
              {activeSignature === 'valid' && sheet.signature ? (
                <>
                  <p className="pass-note">
                    <strong>{sheet.name}</strong> was checked by {sheet.signature.by} on{' '}
                    {new Date(sheet.signature.at).toLocaleDateString('sv-SE')}
                    {sheet.signature.revision ? `, at revision ${sheet.signature.revision}` : ''}.
                  </p>
                  <p className="hint">
                    Signature <code>{shortHash(sheet.signature.hash)}</code> — a SHA-256 of the
                    sheet's text. Anyone holding the same sheet can work it out and get the same
                    answer.
                  </p>
                  <button onClick={unsignSheet}>Remove the signature</button>
                </>
              ) : activeSignature === 'stale' && sheet.signature ? (
                <>
                  <p className="warning">
                    {sheet.signature.by} signed this sheet on{' '}
                    {new Date(sheet.signature.at).toLocaleDateString('sv-SE')}, but it has been
                    edited since. The signature no longer applies, and the sheet says so wherever
                    it is printed.
                  </p>
                  <div className="row">
                    <input
                      aria-label="Sign as"
                      value={signedBy}
                      onChange={(event) => setSignedBy(event.target.value)}
                      placeholder={store.settings.author || 'Your name'}
                    />
                    <button onClick={() => void signSheet()}>Check it again</button>
                  </div>
                  <button onClick={unsignSheet}>Remove the signature</button>
                </>
              ) : (
                <>
                  <p className="hint">
                    Signing stores a fingerprint of this sheet's text next to your name. It is not
                    proof of who you are — anyone at this browser could type any name, the way
                    anyone with a pen could. What it rules out is the thing a pen cannot: a
                    signature quietly outliving a change to the numbers above it.
                  </p>
                  <div className="row">
                    <input
                      aria-label="Sign as"
                      value={signedBy}
                      onChange={(event) => setSignedBy(event.target.value)}
                      placeholder={store.settings.author || 'Your name'}
                    />
                    <button onClick={() => void signSheet()}>Sign as checked</button>
                  </div>
                </>
              )}
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
          <div className="panel" data-panel="share">
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
          <div className="panel" data-panel="history">
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
          <div className="panel" data-panel="symbols">
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
                            onDoubleClick={() => jumpToLine(symbol.line)}
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
                                <button className="jump" onClick={() => jumpToLine(symbol.line)}>
                                  Go to line {symbol.line}
                                </button>
                              </p>
                              <p>
                                <strong>Built from:</strong>{' '}
                                {symbol.dependsOn.length ? (
                                  <SymbolLinks names={symbol.dependsOn} onPick={jumpToSymbol} />
                                ) : (
                                  'nothing — it is an input'
                                )}
                              </p>
                              <p>
                                <strong>Used directly by:</strong>{' '}
                                {symbol.usedBy.length ? (
                                  <SymbolLinks names={symbol.usedBy} onPick={jumpToSymbol} />
                                ) : (
                                  'nothing'
                                )}
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
                <button onClick={exportWord}>Export for Word</button>
                <button onClick={exportLatex}>Export as LaTeX</button>
                <button onClick={pasteTable}>Paste a spreadsheet range</button>
              </div>
              {figureError && <p className="warning">{figureError}</p>}
            </section>
          </div>
        )}

        {panel === 'feedback' && (
          <div className="panel" data-panel="feedback">
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
          <div className="panel settings" data-panel="settings">
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
              <h3>Offline</h3>
              <p className="hint">
                Longhand keeps a copy of itself in this browser, so it opens and computes with no
                network at all — on a site, on a train, on a locked-down machine. Your sheets were
                never on a server to begin with. {online ? '' : 'You are offline right now, and everything here still works.'}
              </p>
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
          <div className="panel" data-panel="profile">
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

        {importError && (
          <p className="warning import-warning no-print">
            {importError}{' '}
            <button className="jump" onClick={() => setImportError(null)}>
              Dismiss
            </button>
          </p>
        )}

        {/* Dropping a spreadsheet export on the editor is the shortest path
            from "I have this data" to "it is in the calculation". */}
        <div
          className={dropping ? 'drop-target dropping' : 'drop-target'}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes('Files')) return
            event.preventDefault()
            setDropping(true)
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(event) => {
            const file = event.dataTransfer.files?.[0]
            if (!file) return
            event.preventDefault()
            setDropping(false)
            void importTable(file)
          }}
        >
          <Editor
            value={sheet.source}
            results={lines}
            onChange={(source) => patchSheet({ source })}
            onReady={(view) => {
              editorRef.current = view
            }}
          />
          {dropping && <div className="drop-hint">Drop a CSV to make it a table</div>}
        </div>
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
