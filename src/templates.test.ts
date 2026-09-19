import { describe, expect, it } from 'vitest'
import { evaluateSheet } from './engine'
import { BLANK_SHEET, EXAMPLE_PROJECT, EXAMPLE_SHEETS, STARTER, findExampleSheet } from './templates'
import { freshStore } from './store'

const linesOf = (source: string) => evaluateSheet(source)

const errorsIn = (source: string): string[] =>
  linesOf(source)
    .filter((line) => line.kind === 'error')
    .map((line) => (line.kind === 'error' ? `${line.source}: ${line.message}` : ''))

describe('the example sheets', () => {
  it('has a unique id and a name for each', () => {
    const ids = EXAMPLE_SHEETS.map((example) => example.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const example of EXAMPLE_SHEETS) {
      expect(example.name.length, example.id).toBeGreaterThan(0)
      expect(example.summary.length, example.id).toBeGreaterThan(10)
      expect(findExampleSheet(example.id)).toBe(example)
    }
  })

  for (const example of EXAMPLE_SHEETS) {
    it(`computes cleanly: ${example.id}`, () => {
      expect(errorsIn(example.source)).toEqual([])
    })
  }

  it('gives every sheet a title, so the printed page is not headless', () => {
    for (const example of EXAMPLE_SHEETS) {
      expect(example.source.startsWith('# '), example.id).toBe(true)
    }
  })

  /**
   * An example is something you read; an empty sheet is not. If one of these
   * ever became a skeleton with nothing worked out in it, it would be taking
   * up a row in the sidebar for nothing.
   */
  it('is an example in every case, not a blank page', () => {
    for (const example of EXAMPLE_SHEETS) {
      const lines = linesOf(example.source)
      expect(lines.some((line) => line.kind === 'calc' || line.kind === 'table'), example.id)
        .toBe(true)
    }
  })
})

describe('the first visit', () => {
  it('opens a project of examples, with the shortest one showing', () => {
    const store = freshStore()
    expect(store.projects).toHaveLength(1)
    expect(store.projects[0].name).toBe(EXAMPLE_PROJECT)
    expect(store.projects[0].sheets.map((sheet) => sheet.name)).toEqual(
      EXAMPLE_SHEETS.map((example) => example.name),
    )
    expect(store.activeSheetId).toBe(store.projects[0].sheets[0].id)
    expect(store.projects[0].sheets[0].name).toBe(STARTER.name)
  })

  it('gives every example sheet a distinct name, or an import would find the wrong one', () => {
    const names = freshStore().projects[0].sheets.map((sheet) => sheet.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('leaves a new sheet blank — the examples are not a wizard', () => {
    expect(BLANK_SHEET.trim()).toBe('# New calculation')
    expect(linesOf(BLANK_SHEET).some((line) => line.kind === 'calc')).toBe(false)
  })

  it('opens on a sheet that passes its own check', () => {
    const checks = linesOf(STARTER.source).filter((line) => line.kind === 'check')
    expect(checks.length).toBeGreaterThan(0)
    expect(checks.every((line) => line.kind === 'check' && line.pass)).toBe(true)
  })

  it('is short enough to read before deciding what to do with it', () => {
    expect(STARTER.source.split('\n').length).toBeLessThan(45)
  })

  it('points at the palette, which is how you find everything else', () => {
    expect(STARTER.source).toContain('/')
  })
})
