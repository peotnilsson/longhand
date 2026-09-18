import type { ToleranceMode } from './engine'

/**
 * A project is the unit engineers deliver: a set of sheets sharing one title
 * block, printed as one package. Sheets do not carry their own metadata.
 */
export interface Sheet {
  id: string
  name: string
  source: string
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
  version: 3
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
    version: 3,
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
          })),
      }))
      .filter((project) => project.sheets.length > 0)

    if (projects.length === 0) return freshStore()

    const active =
      projects.find((project) => project.id === raw.activeProjectId) ?? projects[0]
    const sheet =
      active.sheets.find((candidate) => candidate.id === raw.activeSheetId) ?? active.sheets[0]

    return {
      version: 3,
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
      version: 3,
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
      version: 3,
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
