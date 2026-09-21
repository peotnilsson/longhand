import { describe, expect, it } from 'vitest'
import { evaluateSheet } from './engine'
import { ENTRIES } from './reference'
import {
  DOCUMENTED_CONSTRUCTS,
  PALETTE,
  emptyFields,
  filled,
  filterPalette,
  paletteAt,
} from './palette'

/**
 * A palette that offers a line the engine rejects is worse than no palette:
 * the one thing it promises is that you do not have to remember the syntax.
 * So every snippet is filled in with its own defaults and run, exactly as it
 * would be if you took the insert and pressed nothing else.
 */
const errorsIn = (source: string): string[] =>
  evaluateSheet(source, { libraries: { Loads: 'g = 1.35\n' } })
    .filter((line) => line.kind === 'error')
    .map((line) => (line.kind === 'error' ? `${line.source}: ${line.message}` : ''))

describe('the palette', () => {
  it('can insert every construct the reference documents', () => {
    const missing = DOCUMENTED_CONSTRUCTS.filter(
      (id) => !PALETTE.some((item) => item.id === id),
    )
    expect(missing).toEqual([])
  })

  it('takes its description straight from the documentation', () => {
    for (const item of PALETTE) {
      const entry = ENTRIES.find((candidate) => candidate.id === item.id)
      expect(entry, item.id).toBeDefined()
      expect(item.summary).toBe(entry!.summary)
    }
  })

  it('gives every item a distinct label', () => {
    const labels = PALETTE.map((item) => item.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  for (const item of PALETTE) {
    it(`inserts something that computes for ${item.id}`, () => {
      expect(errorsIn(`${item.preamble ?? ''}${filled(item.template)}\n`)).toEqual([])
    })
  }

  // A literal brace is fine — a system of equations is written with them —
  // but a field that survived filling is not.
  it('leaves no placeholder syntax behind once the fields are filled', () => {
    for (const item of PALETTE) {
      expect(filled(item.template), item.id).not.toMatch(/\$\{/)
    }
  })

  /**
   * `${300}` looks like a field holding 300 and is a field numbered 300
   * holding nothing, so the snippet inserts `b =  mm`. Nothing about it looks
   * wrong until you read what landed in the sheet.
   */
  it('has no field that would insert nothing', () => {
    for (const item of PALETTE) {
      expect(emptyFields(item.template), item.id).toEqual([])
    }
  })

  it('fills every field it offers', () => {
    for (const item of PALETTE) {
      const fields = (item.template.match(/[#$]\{/g) ?? []).length
      if (fields === 0) continue
      expect(filled(item.template).trim().length, item.id).toBeGreaterThan(fields)
    }
  })
})

describe('when the palette offers itself', () => {
  it('opens on a slash at the start of a line', () => {
    expect(paletteAt('/')).toEqual({ from: 0, query: '' })
    expect(paletteAt('  /tab')).toEqual({ from: 2, query: 'tab' })
  })

  it('stays out of the way of division', () => {
    expect(paletteAt('sigma = M/')).toBeNull()
    expect(paletteAt('W = b*h^2/6')).toBeNull()
  })

  it('stays out of the way of a comment', () => {
    expect(paletteAt('//')).toBeNull()
    expect(paletteAt('// a note')).toBeNull()
  })
})

describe('narrowing the palette', () => {
  it('returns everything for an empty query', () => {
    expect(filterPalette('')).toHaveLength(PALETTE.length)
  })

  it('finds a construct by what it does rather than by its name', () => {
    expect(filterPalette('tolerance').map((item) => item.id)).toContain('tolerance')
    expect(filterPalette('unknowns').map((item) => item.id)).toContain('solve-two')
    expect(filterPalette('column').map((item) => item.id)).toContain('aggregate')
  })

  it('finds it by what you called it before you knew our name for it', () => {
    expect(filterPalette('goal seek').map((item) => item.id)).toContain('solve')
    expect(filterPalette('vlookup').map((item) => item.id)).toContain('lookup')
    expect(filterPalette('uncertainty').map((item) => item.id)).toContain('tolerance')
  })

  it('matches on all the words, not any of them', () => {
    expect(filterPalette('named table').map((item) => item.id)).toContain('named-table')
    expect(filterPalette('table zzz')).toHaveLength(0)
  })
})
