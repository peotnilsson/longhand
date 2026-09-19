import { describe, expect, it } from 'vitest'
import {
  decodeSheet,
  encodeSheet,
  importedNames,
  payloadFromHash,
  shareLink,
  LONG_LINK,
} from './share'
import { EXAMPLE } from './store'
import { EXAMPLES } from './examples'

describe('share links', () => {
  it('round-trips a sheet', async () => {
    const sheet = { name: 'Beam check', source: 'b = 300 mm\nh = 500 mm\nW = b*h^2/6\n' }
    const back = await decodeSheet(await encodeSheet(sheet))
    expect(back).toEqual({ name: 'Beam check', source: sheet.source, figures: undefined })
  })

  it('survives every character an engineer types', async () => {
    const source = '// ±, µm, °C, Ω, "quoted", 50 %\nx = 1 mm ± 0.1 mm\ny = x*2 -> µm\n'
    const back = await decodeSheet(await encodeSheet({ name: 'Ünïts — 1/2', source }))
    expect(back?.source).toBe(source)
    expect(back?.name).toBe('Ünïts — 1/2')
  })

  it('carries figures but refuses anything that is not an image', async () => {
    const payload = await encodeSheet({
      name: 'With a sketch',
      source: 'figure f1 "Section A-A"\n',
      figures: {
        f1: 'data:image/png;base64,AAAA',
        bad: 'javascript:alert(1)',
      } as Record<string, string>,
    })
    const back = await decodeSheet(payload)
    expect(Object.keys(back!.figures!)).toEqual(['f1'])
  })

  it('compresses a real sheet to something worth sending', async () => {
    const payload = await encodeSheet({ name: 'Example', source: EXAMPLE })
    expect(payload.length).toBeLessThan(EXAMPLE.length)
    expect(payload.length).toBeLessThan(LONG_LINK)
  })

  it('keeps every worked example inside a sensible link length', async () => {
    for (const example of EXAMPLES) {
      const link = await shareLink(
        { name: example.name, source: example.source },
        'https://longhand.example/app',
      )
      expect(link.length).toBeLessThan(LONG_LINK)
    }
  })

  it('reads the payload out of a hash and ignores anything else', () => {
    expect(payloadFromHash('#s=1abc')).toBe('1abc')
    expect(payloadFromHash('s=1abc')).toBe('1abc')
    expect(payloadFromHash('#s=')).toBeNull()
    expect(payloadFromHash('#section-3')).toBeNull()
    expect(payloadFromHash('')).toBeNull()
  })

  it('returns null rather than throwing on a damaged link', async () => {
    expect(await decodeSheet('1not-base64-at-all!!')).toBeNull()
    expect(await decodeSheet('0' + btoa('{"not":"a sheet"}'))).toBeNull()
    expect(await decodeSheet('')).toBeNull()
    expect(await decodeSheet('9whatever')).toBeNull()
  })

  it('puts the sheet in the hash, never in the path or the query', async () => {
    const link = await shareLink(
      { name: 'Beam', source: 'b = 300 mm\n' },
      'https://longhand.example/app',
    )
    const url = new URL(link)
    expect(url.pathname).toBe('/app')
    expect(url.search).toBe('')
    expect(url.hash.startsWith('#s=')).toBe(true)
  })
})

describe('a shared sheet has to run', () => {
  it('finds the sheets a source imports', () => {
    expect(importedNames('import "Loads"\nx = 1\nimport "Loads"\nimport "Wind"\n')).toEqual([
      'Loads',
      'Wind',
    ])
    expect(importedNames('x = 1\n')).toEqual([])
  })

  /**
   * A sheet whose first line is `import "Loads"` arrives with every number
   * undefined unless the imported sheet travels with it.
   */
  it('carries the imported sheets through the link', async () => {
    const payload = await encodeSheet({
      name: 'Beam',
      source: 'import "Loads"\nsigma = M_Ed/W\n',
      libraries: { Loads: 'M_Ed = 250 kN*m\nW = 1.25e7 mm^3\n' },
    })
    const back = await decodeSheet(payload)
    expect(back?.libraries?.Loads).toContain('M_Ed')
  })

  it('drops a library entry that is not text', async () => {
    const payload = await encodeSheet({
      name: 'Beam',
      source: 'import "Loads"\n',
      libraries: { Loads: 'M = 1', Bad: 42 as unknown as string },
    })
    expect(Object.keys((await decodeSheet(payload))!.libraries!)).toEqual(['Loads'])
  })
})
