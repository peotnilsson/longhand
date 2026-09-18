import { describe, expect, it } from 'vitest'
import {
  duplicateNames,
  emptyMeta,
  freshStore,
  migrate,
  moveSheet,
  moveSheetToProject,
  type Store,
} from './store'

describe('migrate', () => {
  it('turns the old flat sheet list into one project, keeping every sheet', () => {
    const v2 = {
      sheets: [
        { id: 'a', name: 'Beam', source: '# Beam\nb = 1 mm', meta: { project: 'Bridge', author: 'Peo', revision: 'B', checkedBy: 'AN' } },
        { id: 'b', name: 'Slab', source: '# Slab\nt = 2 mm', meta: { project: 'Bridge' } },
      ],
      activeId: 'b',
      precision: 5,
      mode: 'worst' as const,
      settings: { theme: 'dark' as const, author: 'Peo', project: 'Bridge' },
    }

    const store = migrate(v2)

    expect(store.projects).toHaveLength(1)
    expect(store.projects[0].name).toBe('Bridge')
    expect(store.projects[0].sheets.map((sheet) => sheet.name)).toEqual(['Beam', 'Slab'])
    expect(store.projects[0].sheets[0].source).toContain('b = 1 mm')
    // the title block moves from the first sheet up to the project
    expect(store.projects[0].meta.author).toBe('Peo')
    expect(store.projects[0].meta.revision).toBe('B')
    expect(store.projects[0].meta.checkedBy).toBe('AN')
    // and the rest of the settings survive
    expect(store.activeSheetId).toBe('b')
    expect(store.precision).toBe(5)
    expect(store.mode).toBe('worst')
    expect(store.settings.theme).toBe('dark')
  })

  it('reads a current store unchanged and is idempotent', () => {
    const once = migrate(freshStore())
    const twice = migrate(once)
    expect(twice).toEqual(once)
  })

  it('repairs a store whose active ids point at things that are gone', () => {
    const broken = { ...freshStore(), activeProjectId: 'missing', activeSheetId: 'missing' }
    const store = migrate(broken)
    expect(store.activeProjectId).toBe(store.projects[0].id)
    expect(store.activeSheetId).toBe(store.projects[0].sheets[0].id)
  })

  it('drops projects with no sheets rather than producing an unusable store', () => {
    const store = migrate({
      version: 3,
      projects: [
        { id: 'empty', name: 'Empty', meta: {}, sheets: [] },
        { id: 'real', name: 'Real', meta: {}, sheets: [{ id: 's', name: 'S', source: 'x = 1' }] },
      ],
      activeProjectId: 'empty',
      activeSheetId: 'nope',
    } as unknown as Store)

    expect(store.projects.map((project) => project.name)).toEqual(['Real'])
    expect(store.activeProjectId).toBe('real')
  })

  it('takes the single-source version into a project', () => {
    const store = migrate(null, '# Old sheet\nx = 5 mm')
    expect(store.projects[0].sheets[0].source).toContain('x = 5 mm')
  })

  it('falls back to a usable store on nonsense rather than throwing', () => {
    for (const input of [null, undefined, 42, 'text', {}, { projects: [] }, { sheets: [] }]) {
      const store = migrate(input)
      expect(store.projects.length).toBeGreaterThan(0)
      expect(store.projects[0].sheets.length).toBeGreaterThan(0)
    }
  })
})

describe('sheet order and moves', () => {
  const build = (): Store => {
    const store = freshStore()
    const project = store.projects[0]
    return {
      ...store,
      projects: [
        {
          ...project,
          sheets: [
            { id: 's1', name: 'One', source: 'a = 1' },
            { id: 's2', name: 'Two', source: 'b = 2' },
            { id: 's3', name: 'Three', source: 'c = 3' },
          ],
        },
        { id: 'p2', name: 'Other', meta: emptyMeta(), sheets: [{ id: 's9', name: 'Nine', source: '' }] },
      ],
      activeProjectId: project.id,
      activeSheetId: 's2',
    }
  }
  const order = (store: Store, index = 0) => store.projects[index].sheets.map((s) => s.name)

  it('moves a sheet down', () => {
    expect(order(moveSheet(build(), 's1', 1))).toEqual(['Two', 'One', 'Three'])
  })

  it('moves a sheet up', () => {
    expect(order(moveSheet(build(), 's3', -1))).toEqual(['One', 'Three', 'Two'])
  })

  it('refuses to move past either end', () => {
    expect(order(moveSheet(build(), 's1', -1))).toEqual(['One', 'Two', 'Three'])
    expect(order(moveSheet(build(), 's3', 1))).toEqual(['One', 'Two', 'Three'])
  })

  it('moves a sheet into another project and follows it there', () => {
    const store = moveSheetToProject(build(), 's2', 'p2')
    expect(order(store)).toEqual(['One', 'Three'])
    expect(order(store, 1)).toEqual(['Nine', 'Two'])
    expect(store.activeProjectId).toBe('p2')
    expect(store.activeSheetId).toBe('s2')
  })

  it('will not empty a project by moving its last sheet out', () => {
    const store = moveSheetToProject(build(), 's9', build().projects[0].id)
    expect(order(store, 1)).toEqual(['Nine'])
  })

  it('finds names that would shadow each other on import', () => {
    const project = {
      id: 'p',
      name: 'P',
      meta: emptyMeta(),
      sheets: [
        { id: '1', name: 'Loads', source: '' },
        { id: '2', name: 'Loads', source: '' },
        { id: '3', name: 'Beam', source: '' },
      ],
    }
    expect(duplicateNames(project)).toEqual(['Loads'])
    expect(duplicateNames({ ...project, sheets: project.sheets.slice(1) })).toEqual([])
  })
})
