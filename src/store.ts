import type { ToleranceMode } from './engine'

/**
 * A project is the unit engineers deliver: a set of sheets sharing one title
 * block, printed as one package. Sheets do not carry their own metadata.
 */
export interface Sheet {
  id: string
  name: string
  source: string
  /**
   * Images for `figure <id> "caption"` lines, by id. The words stay in the
   * source — a sheet is text — and only the pixels live out here.
   */
  figures?: Record<string, string>
  /** Snapshots, oldest first. See snapshotSheet(). */
  revisions?: Revision[]
}

/** A sheet as it stood at one moment, so "what changed since B" can be answered. */
export interface Revision {
  id: string
  /** Epoch milliseconds. */
  at: number
  /** What the author called it, or '' for one the app took by itself. */
  label: string
  source: string
  auto: boolean
}

export interface ProjectMeta {
  client: string
  author: string
  checkedBy: string
  revision: string
}

export interface Project {
  id: string
  name: string
  meta: ProjectMeta
  sheets: Sheet[]
}

export type Theme = 'system' | 'light' | 'dark'

export interface Settings {
  theme: Theme
  /** Pre-fills a new project's title block. */
  author: string
  project: string
}

export interface Store {
  version: 4
  projects: Project[]
  activeProjectId: string
  activeSheetId: string
  precision: number
  mode: ToleranceMode
  settings: Settings
  /** When a backup was last exported, so the app can say how stale it is. */
  lastBackupAt?: number
}

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'blocked' }

export const STORE_KEY = 'longhand:store'
export const LEGACY_SOURCE_KEY = 'longhand:source'

export const newId = (): string => Math.random().toString(36).slice(2, 10)

export const emptyMeta = (): ProjectMeta => ({
  client: '',
  author: '',
  checkedBy: '',
  revision: 'A',
})

export const defaultSettings = (): Settings => ({ theme: 'system', author: '', project: '' })

export const EXAMPLE = `# Beam check - section A-A

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

// The other question: what width would just about do?
b_req = solve sigma = f_ck for b

// A named table becomes data you can read between the rows of
table steel
  profile | h      | A
  IPE200  | 200 mm | 2850 mm^2
  IPE300  | 300 mm | 5380 mm^2
  IPE400  | 400 mm | 8450 mm^2
end

A_250 = interp(250 mm, steel.h, steel.A)
A_300 = lookup("IPE300", steel.profile, steel.A)

// And a sweep shows sensitivity
plot sigma vs b from 200 mm to 400 mm
`

export function newSheet(name: string, source = '# New calculation\n\n'): Sheet {
  return { id: newId(), name, source }
}

export function newProject(name: string, meta: Partial<ProjectMeta> = {}): Project {
  return {
    id: newId(),
    name,
    meta: { ...emptyMeta(), ...meta },
    sheets: [newSheet('Sheet 1')],
  }
}

export function freshStore(): Store {
  const project: Project = {
    id: newId(),
    name: 'Example project',
    meta: emptyMeta(),
    sheets: [{ id: newId(), name: 'Beam check', source: EXAMPLE }],
  }
  return {
    version: 4,
    projects: [project],
    activeProjectId: project.id,
    activeSheetId: project.sheets[0].id,
    precision: 4,
    mode: 'quadrature',
    settings: defaultSettings(),
  }
}

/** Shapes that earlier versions wrote, kept only so migrate() can read them. */
interface V2Sheet {
  id?: string
  name?: string
  source?: string
  meta?: { project?: string; author?: string; revision?: string; checkedBy?: string }
}

interface V2Store {
  sheets?: V2Sheet[]
  activeId?: string
  precision?: number
  mode?: ToleranceMode
  settings?: Partial<Settings>
}

/**
 * A figure map from storage or a file, with anything that is not an image
 * dropped. A restored backup is untrusted input: an entry whose value is a
 * javascript: URL would otherwise end up in an <img src>.
 */
const cleanFigures = (figures: unknown): Record<string, string> | undefined => {
  if (!figures || typeof figures !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [id, value] of Object.entries(figures as Record<string, unknown>)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,40}$/.test(id)) continue
    if (typeof value === 'string' && value.startsWith('data:image/')) out[id] = value
  }
  return Object.keys(out).length ? out : undefined
}

const cleanRevisions = (revisions: unknown): Revision[] | undefined => {
  if (!Array.isArray(revisions)) return undefined
  const out = revisions
    .filter(
      (revision) =>
        revision && typeof revision.source === 'string' && Number.isFinite(revision.at),
    )
    .map((revision) => ({
      id: String(revision.id || newId()),
      at: Number(revision.at),
      label: String(revision.label ?? '').slice(0, 80),
      source: String(revision.source),
      auto: Boolean(revision.auto),
    }))
    .slice(-MAX_REVISIONS)
  return out.length ? out : undefined
}

const isProjectStore = (raw: unknown): raw is Store =>
  !!raw && Array.isArray((raw as Store).projects) && (raw as Store).projects.length > 0

const isSheetStore = (raw: unknown): raw is V2Store =>
  !!raw && Array.isArray((raw as V2Store).sheets) && (raw as V2Store).sheets!.length > 0

/**
 * Bring any stored shape up to the current one. Never throws and never returns
 * an empty store: losing someone's calculations to a failed migration would be
 * the single worst bug this app could have.
 */
export function migrate(raw: unknown, legacySource?: string | null): Store {
  if (isProjectStore(raw)) {
    const projects = raw.projects
      .filter((project) => project && Array.isArray(project.sheets))
      .map((project) => ({
        id: project.id || newId(),
        name: project.name || 'Project',
        meta: { ...emptyMeta(), ...project.meta },
        sheets: project.sheets
          .filter(Boolean)
          .map((sheet) => ({
            id: sheet.id || newId(),
            name: sheet.name || 'Sheet',
            source: sheet.source ?? '',
            figures: cleanFigures((sheet as Sheet).figures),
            revisions: cleanRevisions((sheet as Sheet).revisions),
          })),
      }))
      .filter((project) => project.sheets.length > 0)

    if (projects.length === 0) return freshStore()

    const active =
      projects.find((project) => project.id === raw.activeProjectId) ?? projects[0]
    const sheet =
      active.sheets.find((candidate) => candidate.id === raw.activeSheetId) ?? active.sheets[0]

    return {
      version: 4,
      projects,
      activeProjectId: active.id,
      activeSheetId: sheet.id,
      precision: raw.precision ?? 4,
      mode: raw.mode ?? 'quadrature',
      settings: { ...defaultSettings(), ...raw.settings },
      lastBackupAt: raw.lastBackupAt,
    }
  }

  // v2: a flat list of sheets, each carrying its own title block.
  if (isSheetStore(raw)) {
    const sheets = raw.sheets!.map((sheet, index) => ({
      id: sheet.id || newId(),
      name: sheet.name || `Sheet ${index + 1}`,
      source: sheet.source ?? '',
    }))
    const first = raw.sheets![0]?.meta ?? {}
    const project: Project = {
      id: newId(),
      name: first.project || raw.settings?.project || 'Project',
      meta: {
        ...emptyMeta(),
        author: first.author || raw.settings?.author || '',
        checkedBy: first.checkedBy || '',
        revision: first.revision || 'A',
      },
      sheets,
    }
    return {
      version: 4,
      projects: [project],
      activeProjectId: project.id,
      activeSheetId:
        sheets.find((sheet) => sheet.id === raw.activeId)?.id ?? sheets[0].id,
      precision: raw.precision ?? 4,
      mode: raw.mode ?? 'quadrature',
      settings: { ...defaultSettings(), ...raw.settings },
    }
  }

  // v1: a single source string under its own key.
  if (legacySource) {
    const project: Project = {
      id: newId(),
      name: 'Project',
      meta: emptyMeta(),
      sheets: [{ id: newId(), name: 'Calculation', source: legacySource }],
    }
    return {
      version: 4,
      projects: [project],
      activeProjectId: project.id,
      activeSheetId: project.sheets[0].id,
      precision: 4,
      mode: 'quadrature',
      settings: defaultSettings(),
    }
  }

  return freshStore()
}

export function loadStore(): Store {
  try {
    const saved = localStorage.getItem(STORE_KEY)
    return migrate(saved ? JSON.parse(saved) : null, localStorage.getItem(LEGACY_SOURCE_KEY))
  } catch {
    return freshStore()
  }
}

/**
 * Saving used to fail silently, which is the worst possible behaviour: work
 * carries on looking fine and none of it is being kept. The caller gets the
 * failure so it can say so.
 */
export function saveStore(store: Store): SaveResult {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
    return { ok: true }
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' ||
        error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
        error.code === 22)
    return { ok: false, reason: quota ? 'quota' : 'blocked' }
  }
}

/** Whole days since the last exported backup, or null if there has never been one. */
export function backupAgeDays(store: Store): number | null {
  if (!store.lastBackupAt) return null
  return Math.floor((Date.now() - store.lastBackupAt) / 86_400_000)
}

export const activeProject = (store: Store): Project =>
  store.projects.find((project) => project.id === store.activeProjectId) ?? store.projects[0]

export const activeSheet = (store: Store): Sheet => {
  const project = activeProject(store)
  return project.sheets.find((sheet) => sheet.id === store.activeSheetId) ?? project.sheets[0]
}

export const slug = (text: string): string =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'calculation'

/** Names used by more than one sheet in a project: `import` resolves by name. */
export function duplicateNames(project: Project): string[] {
  const seen = new Map<string, number>()
  for (const sheet of project.sheets) {
    seen.set(sheet.name, (seen.get(sheet.name) ?? 0) + 1)
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name)
}

const replaceProject = (store: Store, project: Project): Store => ({
  ...store,
  projects: store.projects.map((candidate) =>
    candidate.id === project.id ? project : candidate,
  ),
})

/**
 * Move a sheet up or down inside its project. Sheet order is the order of the
 * printed package, so this is about the deliverable, not tidiness.
 */
export function moveSheet(store: Store, sheetId: string, offset: number): Store {
  const project = store.projects.find((candidate) =>
    candidate.sheets.some((sheet) => sheet.id === sheetId),
  )
  if (!project) return store

  const from = project.sheets.findIndex((sheet) => sheet.id === sheetId)
  const to = from + offset
  if (to < 0 || to >= project.sheets.length) return store

  const sheets = [...project.sheets]
  const [moved] = sheets.splice(from, 1)
  sheets.splice(to, 0, moved)
  return replaceProject(store, { ...project, sheets })
}

/** What a deletion took away, kept so it can be put back. */
export type Deleted =
  | { kind: 'sheet'; projectId: string; index: number; sheet: Sheet }
  | { kind: 'project'; index: number; project: Project }

/** Put back exactly what was deleted, in the place it came from. */
export function restore(store: Store, deleted: Deleted): Store {
  if (deleted.kind === 'project') {
    const projects = [...store.projects]
    projects.splice(Math.min(deleted.index, projects.length), 0, deleted.project)
    return {
      ...store,
      projects,
      activeProjectId: deleted.project.id,
      activeSheetId: deleted.project.sheets[0].id,
    }
  }

  const project = store.projects.find((candidate) => candidate.id === deleted.projectId)
  if (!project) return store
  const sheets = [...project.sheets]
  sheets.splice(Math.min(deleted.index, sheets.length), 0, deleted.sheet)
  return {
    ...replaceProject(store, { ...project, sheets }),
    activeProjectId: project.id,
    activeSheetId: deleted.sheet.id,
  }
}

/**
 * Delete a sheet and land on the one above it, so deleting several in a row is
 * press, confirm, press, confirm without the button moving or the selection
 * jumping back to the top of the project.
 */
export function removeSheet(store: Store, sheetId: string): Store {
  const project = store.projects.find((candidate) =>
    candidate.sheets.some((sheet) => sheet.id === sheetId),
  )
  if (!project || project.sheets.length === 1) return store

  const index = project.sheets.findIndex((sheet) => sheet.id === sheetId)
  const sheets = project.sheets.filter((sheet) => sheet.id !== sheetId)
  // The one above, or the new first sheet when the first one went.
  const next = sheets[Math.max(0, index - 1)]

  return {
    ...replaceProject(store, { ...project, sheets }),
    activeProjectId: project.id,
    activeSheetId: store.activeSheetId === sheetId ? next.id : store.activeSheetId,
  }
}

/** Move a sheet into another project, never leaving a project with no sheets. */
export function moveSheetToProject(store: Store, sheetId: string, targetId: string): Store {
  const source = store.projects.find((candidate) =>
    candidate.sheets.some((sheet) => sheet.id === sheetId),
  )
  const target = store.projects.find((candidate) => candidate.id === targetId)
  if (!source || !target || source.id === target.id) return store
  if (source.sheets.length === 1) return store

  const sheet = source.sheets.find((candidate) => candidate.id === sheetId)!
  const projects = store.projects.map((candidate) => {
    if (candidate.id === source.id) {
      return { ...candidate, sheets: candidate.sheets.filter((s) => s.id !== sheetId) }
    }
    if (candidate.id === target.id) {
      return { ...candidate, sheets: [...candidate.sheets, sheet] }
    }
    return candidate
  })

  return {
    ...store,
    projects,
    activeProjectId: target.id,
    activeSheetId: sheet.id,
  }
}


// ---------------------------------------------------------------- revisions

/**
 * How many snapshots a sheet keeps.
 *
 * Enough to cover a week of real work, and few enough that a project with
 * twenty sheets does not quietly become the reason localStorage runs out. The
 * oldest go first, which is the right way round: the useful question is what
 * changed recently.
 */
export const MAX_REVISIONS = 40

/** Ten minutes of editing without a snapshot is long enough to want one. */
export const AUTO_REVISION_GAP = 10 * 60 * 1000

export function newRevision(source: string, label = '', auto = false): Revision {
  return { id: newId(), at: Date.now(), label, source, auto }
}

/**
 * Take a snapshot of a sheet as it is now.
 *
 * Identical consecutive snapshots are refused: a revision list where half the
 * entries say "no change" is a revision list nobody reads.
 */
export function snapshotSheet(
  store: Store,
  sheetId: string,
  label = '',
  auto = false,
): Store {
  const project = store.projects.find((candidate) =>
    candidate.sheets.some((sheet) => sheet.id === sheetId),
  )
  if (!project) return store
  const sheet = project.sheets.find((candidate) => candidate.id === sheetId)!
  const revisions = sheet.revisions ?? []
  if (revisions.at(-1)?.source === sheet.source) return store

  const updated: Sheet = {
    ...sheet,
    revisions: [...revisions, newRevision(sheet.source, label, auto)].slice(-MAX_REVISIONS),
  }
  return replaceProject(store, {
    ...project,
    sheets: project.sheets.map((candidate) => (candidate.id === sheetId ? updated : candidate)),
  })
}

/** Whether enough has happened since the last snapshot to be worth taking another. */
export function dueForSnapshot(sheet: Sheet, now = Date.now()): boolean {
  const last = sheet.revisions?.at(-1)
  if (!last) return sheet.source.trim().length > 0
  if (last.source === sheet.source) return false
  return now - last.at >= AUTO_REVISION_GAP
}

/**
 * Put an old version back, keeping the current one.
 *
 * Restoring takes a snapshot of where the sheet is first, so the act of
 * looking at history can never be the thing that loses work.
 */
export function restoreRevision(store: Store, sheetId: string, revisionId: string): Store {
  const project = store.projects.find((candidate) =>
    candidate.sheets.some((sheet) => sheet.id === sheetId),
  )
  if (!project) return store
  const sheet = project.sheets.find((candidate) => candidate.id === sheetId)!
  const revision = sheet.revisions?.find((candidate) => candidate.id === revisionId)
  if (!revision) return store

  const saved = snapshotSheet(store, sheetId, 'Before restoring', true)
  const savedProject = saved.projects.find((candidate) => candidate.id === project.id)!
  const savedSheet = savedProject.sheets.find((candidate) => candidate.id === sheetId)!

  return replaceProject(saved, {
    ...savedProject,
    sheets: savedProject.sheets.map((candidate) =>
      candidate.id === sheetId ? { ...savedSheet, source: revision.source } : candidate,
    ),
  })
}

export function deleteRevision(store: Store, sheetId: string, revisionId: string): Store {
  const project = store.projects.find((candidate) =>
    candidate.sheets.some((sheet) => sheet.id === sheetId),
  )
  if (!project) return store
  return replaceProject(store, {
    ...project,
    sheets: project.sheets.map((candidate) =>
      candidate.id === sheetId
        ? {
            ...candidate,
            revisions: (candidate.revisions ?? []).filter(
              (revision) => revision.id !== revisionId,
            ),
          }
        : candidate,
    ),
  })
}

/** Figure ids a sheet's source actually refers to, so orphans can be cleared out. */
export function referencedFigures(source: string): string[] {
  const ids: string[] = []
  for (const line of source.split('\n')) {
    const match = line.trim().match(/^figure\s+([A-Za-z_][A-Za-z0-9_]*)/)
    if (match) ids.push(match[1])
  }
  return ids
}
