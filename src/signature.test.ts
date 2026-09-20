import { describe, expect, it } from 'vitest'
import { checkSignature, cleanSignature, hashSource, sign, signatureLine } from './signature'

const SHEET = '# Beam\nb = 300 mm\nh = 500 mm\nW = b*h^2/6\n'

describe('signing a sheet', () => {
  it('holds while the sheet is untouched', async () => {
    const signature = await sign(SHEET, 'A. Nilsson', 'B')
    expect(await checkSignature(SHEET, signature)).toBe('valid')
  })

  it('stops holding the moment a number changes', async () => {
    const signature = await sign(SHEET, 'A. Nilsson', 'B')
    expect(await checkSignature(SHEET.replace('300', '320'), signature)).toBe('stale')
  })

  /**
   * Whitespace is not obviously harmless: a line moved into or out of a table
   * block changes what the sheet computes. Deciding which edits are safe is
   * the checker's job, not ours.
   */
  it('stops holding for a change that only moved the text', async () => {
    const signature = await sign(SHEET, 'A. Nilsson', 'B')
    expect(await checkSignature(`${SHEET}\n`, signature)).toBe('stale')
  })

  it('says nothing about a sheet nobody signed', async () => {
    expect(await checkSignature(SHEET, undefined)).toBe('unsigned')
  })

  it('is reproducible by anyone holding the same text', async () => {
    expect(await hashSource(SHEET)).toBe(await hashSource(SHEET))
    expect(await hashSource(SHEET)).toHaveLength(64)
    expect(await hashSource(SHEET)).not.toBe(await hashSource(`${SHEET}x`))
  })

  it('says plainly when a signature has been outrun by an edit', async () => {
    const signature = await sign(SHEET, 'A. Nilsson', 'B')
    expect(signatureLine('valid', signature)).toContain('Checked by A. Nilsson')
    const stale = signatureLine('stale', signature)
    expect(stale).toContain('edited since')
    expect(stale).toContain('no longer applies')
  })

  it('refuses a stored signature that is not one', () => {
    expect(cleanSignature(undefined)).toBeUndefined()
    expect(cleanSignature({ by: 'x', at: 1 })).toBeUndefined()
    expect(cleanSignature({ by: 'x', at: 1, hash: 'nope' })).toBeUndefined()
    expect(cleanSignature({ by: 'x', at: 1, hash: 'a'.repeat(64) })).toEqual({
      by: 'x',
      at: 1,
      hash: 'a'.repeat(64),
      revision: '',
    })
  })
})
