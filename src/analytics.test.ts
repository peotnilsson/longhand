import { describe, expect, it } from 'vitest'
import { EVENTS, bucketFor, cleanProps, enabled, issueUrl, mailtoUrl } from './analytics'

const DAY = 86_400_000

describe('analytics', () => {
  it('is off when no domain is configured', () => {
    // No VITE_ANALYTICS_DOMAIN in the test environment, and none in a fork.
    expect(enabled()).toBe(false)
  })

  it('buckets a returning visit by whole days', () => {
    const now = Date.UTC(2026, 8, 19)
    expect(bucketFor(now, now)).toBe('first')
    expect(bucketFor(now - 6 * DAY, now)).toBe('week')
    expect(bucketFor(now - 7 * DAY, now)).toBe('month')
    expect(bucketFor(now - 29 * DAY, now)).toBe('month')
    expect(bucketFor(now - 30 * DAY, now)).toBe('later')
  })

  it('lets short enumerated labels through', () => {
    expect(cleanProps({ seen: 'week', lines: 42, paged: true })).toEqual({
      seen: 'week',
      lines: '42',
      paged: 'yes',
    })
  })

  /**
   * The one way this module could leak a calculation is a prop carrying sheet
   * content, so the filter is the thing worth testing hardest.
   */
  it('drops anything that could carry content', () => {
    expect(
      cleanProps({
        source: 'b = 300 mm\nh = 500 mm',
        name: 'Client X — foundation to basement 2',
        formula: 'sigma = M_Ed/W',
        nested: { a: 1 },
        list: [1, 2, 3],
        'Bad Key': 'ok',
        empty: '',
        nan: Number.NaN,
      }),
    ).toEqual({})
  })

  it('writes feedback into a GitHub issue without a server', () => {
    const url = new URL(issueUrl('Units in the table are wrong\nsecond line'))
    expect(url.host).toBe('github.com')
    expect(url.searchParams.get('title')).toBe('Units in the table are wrong')
    expect(url.searchParams.get('body')).toContain('second line')
  })

  it('offers an email route for people without a GitHub account', () => {
    expect(mailtoUrl('no account here')).toContain('mailto:')
    expect(decodeURIComponent(mailtoUrl('no account here'))).toContain('no account here')
  })

  it('keeps the event vocabulary small and fixed', () => {
    expect(new Set(EVENTS).size).toBe(EVENTS.length)
    for (const name of EVENTS) expect(name).toMatch(/^[a-z][a-z ]{2,23}$/)
  })
})
