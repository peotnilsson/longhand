import { describe, expect, it } from 'vitest'
import { CASES, runCase } from './verification'

/**
 * The verification suite, run on every commit.
 *
 * A failure here is not a broken test — it means Longhand has started giving a
 * different answer to a problem whose answer is known, and that is the one
 * class of bug this project cannot ship.
 */
describe('verification suite', () => {
  it('has cases across the fields the tool is used in', () => {
    expect(CASES.length).toBeGreaterThanOrEqual(20)
    expect(new Set(CASES.map((subject) => subject.id)).size).toBe(CASES.length)
    expect(new Set(CASES.map((subject) => subject.field)).size).toBeGreaterThanOrEqual(5)
  })

  it.each(CASES.map((subject) => [subject.id, subject] as const))('%s', (_id, subject) => {
    const result = runCase(subject)

    expect(result.errors, `errors: ${JSON.stringify(result.errors, null, 2)}`).toEqual([])
    expect(result.checks.length, 'a case with no checks proves nothing').toBeGreaterThan(0)

    const failed = result.checks.filter((check) => !check.pass)
    expect(failed, `failed checks: ${JSON.stringify(failed, null, 2)}`).toEqual([])

    expect(result.misread, `misread lines: ${JSON.stringify(result.misread, null, 2)}`).toEqual([])
    expect(result.ok).toBe(true)
  })
})
