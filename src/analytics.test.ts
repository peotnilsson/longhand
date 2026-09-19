import { describe, expect, it } from 'vitest'
import {
  EVENTS,
  bucketFor,
  cleanProps,
  enabled,
  issueUrl,
  mailtoUrl,
  payloadFor,
} from './analytics'

const DAY = 86_400_000

describe('analytics', () => {
  it('is off when Plausible is not there', () => {
    // No script in the test environment, so nothing is ever sent.
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

  it('lets the enumerated labels through', () => {
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

  /**
   * The filter used to be a pattern — any short run of letters and spaces —
   * and a sheet name is a short run of letters and spaces. An allowlist of
   * nine words cannot be talked into carrying one.
   */
  it('refuses a value that is not one of the words it knows', () => {
    expect(cleanProps({ seen: 'Client X foundation' })).toEqual({})
    expect(cleanProps({ from: 'Beam check rev C' })).toEqual({})
    expect(cleanProps({ to: 'github' })).toEqual({ to: 'github' })
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

/**
 * The one property worth pinning hardest.
 *
 * A share link's fragment *is* the calculation, and Plausible's own script
 * sends `location.href` — which is why this module builds its own payload
 * rather than loading that script. If any of these stop holding, sheets are
 * going to a third party.
 */
describe('the payload never carries a calculation', () => {
  const shared = {
    origin: 'https://longhand.example',
    pathname: '/app',
    search: '?example=beam',
    hash: '#s=1PY5BC4JAEIX_ymO6WaFodoj2kNGtzl6GRNNSasdoFzy0_ffY0C4',
  }

  it('sends the origin and path and nothing else', () => {
    expect(payloadFor('pageview', {}, shared).url).toBe('https://longhand.example/app')
  })

  it('never lets the fragment or the query into any field', () => {
    const body = JSON.stringify(
      payloadFor('share created', { seen: 'week', long: false, name: 'Client X foundation' }, shared),
    )
    expect(body).not.toContain('#')
    expect(body).not.toContain('s=1PY5')
    expect(body).not.toContain('?')
    expect(body).not.toContain('example=beam')
    expect(body).not.toContain('Client X')
  })

  it('does the same for every event name, not just pageviews', () => {
    for (const name of EVENTS) {
      expect(payloadFor(name, {}, shared).url).toBe('https://longhand.example/app')
    }
  })
})
