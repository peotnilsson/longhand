import { describe, expect, it } from 'vitest'
import { evaluateSheet } from './engine'
import { EVENTS, cleanProps } from './analytics'
import { STARTER, TEMPLATES, findTemplate } from './templates'
import { freshStore } from './store'

const linesOf = (source: string) => evaluateSheet(source)

const errorsIn = (source: string): string[] =>
  linesOf(source)
    .filter((line) => line.kind === 'error')
    .map((line) => (line.kind === 'error' ? `${line.source}: ${line.message}` : ''))

describe('the templates', () => {
  it('has a unique id and a name for each', () => {
    const ids = TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const template of TEMPLATES) {
      expect(template.name.length, template.id).toBeGreaterThan(0)
      expect(template.summary.length, template.id).toBeGreaterThan(10)
      expect(findTemplate(template.id)).toBe(template)
    }
  })

  for (const template of TEMPLATES) {
    it(`computes cleanly: ${template.id}`, () => {
      expect(errorsIn(template.source)).toEqual([])
    })
  }

  it('gives every sheet a title, so the printed page is not headless', () => {
    for (const template of TEMPLATES) {
      expect(template.source.startsWith('# '), template.id).toBe(true)
    }
  })

  it('counts which starting point was taken, without needing the list widened later', () => {
    expect(EVENTS).toContain('template used')
    for (const template of TEMPLATES) {
      expect(cleanProps({ seen: template.id }), template.id).toEqual({ seen: template.id })
    }
  })
})

describe('the starter sheet', () => {
  it('is what a browser that has never opened Longhand is given', () => {
    const store = freshStore()
    expect(store.projects[0].sheets[0].name).toBe(STARTER.name)
    expect(store.projects[0].sheets[0].source).toBe(STARTER.source)
  })

  it('is a real calculation, not a welcome message', () => {
    const lines = linesOf(STARTER.source)
    expect(lines.some((line) => line.kind === 'calc')).toBe(true)
    expect(lines.some((line) => line.kind === 'check')).toBe(true)
  })

  it('passes its own check, so the first thing anyone sees is a sheet that works', () => {
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
