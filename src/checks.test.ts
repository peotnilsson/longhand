import { describe, expect, it } from 'vitest'
import { evaluateSheet } from './engine'
import { summariseChecks, tightest, verdictLine } from './checks'
import { diffLines, describeDiff, withContext } from './diff'
import {
  dueForSnapshot,
  migrate,
  referencedFigures,
  restoreRevision,
  snapshotSheet,
  MAX_REVISIONS,
  AUTO_REVISION_GAP,
  type Store,
} from './store'

const summarise = (source: string) => summariseChecks(source, evaluateSheet(source))

describe('the checks summary', () => {
  it('lists every check with the line the engineer wrote', () => {
    const summary = summarise(
      ['sigma = 20 MPa', 'f_ck = 30 MPa', 'sigma <= f_ck  // clause 6.2', ''].join('\n'),
    )
    expect(summary.checks).toHaveLength(1)
    expect(summary.checks[0].label).toBe('sigma <= f_ck')
    expect(summary.checks[0].pass).toBe(true)
    expect(summary.checks[0].margin).toBe('33.3% spare')
    expect(summary.allPass).toBe(true)
  })

  it('says which heading a check sits under', () => {
    const summary = summarise(
      ['# Beam', 'a = 1', '## Shear', 'b = 2', 'b >= a'].join('\n'),
    )
    expect(summary.checks[0].section).toBe('Shear')
  })

  /** A dozen checks written once should not become a dozen rows. */
  it('folds a table verdict column into one row', () => {
    const summary = summarise(
      [
        'f_ck = 30 MPa',
        'table',
        '  s      | st     | ok = st <= f_ck',
        '  A      | 20 MPa',
        '  B      | 25 MPa',
        '  C      | 40 MPa',
        'end',
      ].join('\n'),
    )
    expect(summary.checks).toHaveLength(1)
    expect(summary.checks[0].fromTable).toBe(true)
    expect(summary.checks[0].pass).toBe(false)
    expect(summary.checks[0].margin).toBe('1 of 3 over the limit')
  })

  it('counts failures and says so in one line', () => {
    const summary = summarise(['a = 1', 'b = 2', 'a >= b', 'b >= a'].join('\n'))
    expect(summary.failed).toBe(1)
    expect(summary.passed).toBe(1)
    expect(verdictLine(summary)).toBe('2 checks, 1 NOT OK')
  })

  it('has nothing to say about a sheet with no checks', () => {
    const summary = summarise('b = 300 mm\n')
    expect(summary.checks).toEqual([])
    expect(summary.allPass).toBe(false)
    expect(verdictLine(summary)).toBe('No checks in this sheet')
  })

  it('finds the check closest to its limit', () => {
    const summary = summarise(
      ['a = 29 MPa', 'b = 10 MPa', 'f = 30 MPa', 'a <= f', 'b <= f'].join('\n'),
    )
    expect(tightest(summary)?.label).toBe('a <= f')
  })
})

describe('the diff', () => {
  it('finds the lines that changed and leaves the rest alone', () => {
    const change = diffLines('a\nb\nc\n', 'a\nB\nc\n')
    expect(change.added).toBe(1)
    expect(change.removed).toBe(1)
    expect(change.identical).toBe(false)
    expect(describeDiff(change)).toBe('1 line added, 1 line removed')
  })

  it('says nothing changed when nothing did', () => {
    const change = diffLines('a\nb\n', 'a\nb\n')
    expect(change.identical).toBe(true)
    expect(describeDiff(change)).toBe('No change')
    expect(change.changes.every((row) => row.kind === 'same')).toBe(true)
  })

  it('handles a line added at each end', () => {
    expect(diffLines('b', 'a\nb\nc').added).toBe(2)
    expect(diffLines('a\nb\nc', 'b').removed).toBe(2)
  })

  /** A two-line change in a long sheet has to read as a two-line change. */
  it('collapses long unchanged runs', () => {
    const before = Array.from({ length: 60 }, (_, index) => `line ${index}`).join('\n')
    const after = before.replace('line 30', 'line thirty')
    const rows = withContext(diffLines(before, after))
    expect(rows.length).toBeLessThan(12)
    expect(rows.some((row) => row.text.includes('unchanged line'))).toBe(true)
  })
})

const storeWith = (source: string): Store =>
  migrate({
    projects: [
      {
        id: 'p',
        name: 'P',
        sheets: [{ id: 's', name: 'S', source }],
      },
    ],
    activeProjectId: 'p',
    activeSheetId: 's',
  })

const sheetOf = (store: Store) => store.projects[0].sheets[0]

describe('revisions', () => {
  it('takes a snapshot and keeps the sheet as it was', () => {
    const store = snapshotSheet(storeWith('a = 1\n'), 's', 'First')
    expect(sheetOf(store).revisions).toHaveLength(1)
    expect(sheetOf(store).revisions![0].source).toBe('a = 1\n')
    expect(sheetOf(store).revisions![0].label).toBe('First')
  })

  it('refuses a snapshot identical to the last one', () => {
    const once = snapshotSheet(storeWith('a = 1\n'), 's')
    const twice = snapshotSheet(once, 's')
    expect(sheetOf(twice).revisions).toHaveLength(1)
  })

  it('drops the oldest rather than growing without limit', () => {
    let store = storeWith('a = 0\n')
    for (let index = 1; index <= MAX_REVISIONS + 5; index += 1) {
      store = {
        ...store,
        projects: store.projects.map((project) => ({
          ...project,
          sheets: project.sheets.map((sheet) => ({ ...sheet, source: `a = ${index}\n` })),
        })),
      }
      store = snapshotSheet(store, 's')
    }
    const revisions = sheetOf(store).revisions!
    expect(revisions).toHaveLength(MAX_REVISIONS)
    expect(revisions.at(-1)!.source).toBe(`a = ${MAX_REVISIONS + 5}\n`)
  })

  /** Looking at history must never be the thing that loses work. */
  it('keeps the current version when restoring an old one', () => {
    const saved = snapshotSheet(storeWith('old\n'), 's', 'Old')
    const edited: Store = {
      ...saved,
      projects: saved.projects.map((project) => ({
        ...project,
        sheets: project.sheets.map((sheet) => ({ ...sheet, source: 'new\n' })),
      })),
    }
    const back = restoreRevision(edited, 's', sheetOf(saved).revisions![0].id)
    expect(sheetOf(back).source).toBe('old\n')
    expect(sheetOf(back).revisions!.some((revision) => revision.source === 'new\n')).toBe(true)
  })

  it('waits before taking another snapshot by itself', () => {
    const store = snapshotSheet(storeWith('a = 1\n'), 's')
    const sheet = { ...sheetOf(store), source: 'a = 2\n' }
    expect(dueForSnapshot(sheet, Date.now())).toBe(false)
    expect(dueForSnapshot(sheet, Date.now() + AUTO_REVISION_GAP + 1)).toBe(true)
  })
})

describe('figures in the store', () => {
  it('reads the ids a sheet actually refers to', () => {
    expect(referencedFigures('figure a_a "One"\nx = 1\nfigure b "Two"\n')).toEqual(['a_a', 'b'])
  })

  /** A restored backup is untrusted input, and its values end up in an img src. */
  it('throws away anything in a figure map that is not an image', () => {
    const store = migrate({
      projects: [
        {
          id: 'p',
          name: 'P',
          sheets: [
            {
              id: 's',
              name: 'S',
              source: '',
              figures: {
                good: 'data:image/png;base64,AAAA',
                bad: 'javascript:alert(1)',
                'not an id': 'data:image/png;base64,AAAA',
              },
            },
          ],
        },
      ],
    })
    expect(Object.keys(sheetOf(store).figures ?? {})).toEqual(['good'])
  })

  it('brings a version 3 store forward without losing anything', () => {
    const store = migrate({
      version: 3,
      projects: [{ id: 'p', name: 'P', sheets: [{ id: 's', name: 'S', source: 'a = 1' }] }],
      activeProjectId: 'p',
      activeSheetId: 's',
    })
    expect(store.version).toBe(4)
    expect(sheetOf(store).source).toBe('a = 1')
    expect(sheetOf(store).revisions).toBeUndefined()
  })
})
