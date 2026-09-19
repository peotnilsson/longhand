import { useEffect, useMemo, useState } from 'react'
import { SiteFooter, SiteHeader } from '../SiteHeader'
import { buildStamp } from '../build'
import { start, track } from '../analytics'
import { CASES, FIELDS, runSuite, type Field } from '../verification'
import '../landing/landing.css'
import './verification.css'

/**
 * The verification suite, run in the reader's browser.
 *
 * A page that said "we test it thoroughly" would be worth nothing. This runs
 * the cases here, now, on the same build that is serving the page, and shows
 * the sheets so a reader can see what is being claimed and check the
 * arithmetic themselves. Every expected value in them was worked out
 * independently — from a closed form or an exact definition — and is written
 * into the sheet beside a note saying where it came from.
 *
 * The suite also runs on every commit, which is the half that keeps it honest
 * between visits.
 */
export default function Verification() {
  const [field, setField] = useState<Field | 'all'>('all')
  const [open, setOpen] = useState<string | null>(null)

  const suite = useMemo(() => runSuite(), [])

  useEffect(() => {
    start()
    track('verification run', { passed: suite.passed, failed: suite.failed })
  }, [suite.passed, suite.failed])

  const shown = CASES.filter((subject) => field === 'all' || subject.field === field)
  const byId = new Map(suite.results.map((result) => [result.id, result]))

  return (
    <div className="landing verification">
      <SiteHeader here="verification" />

      <section className="hero verification-hero">
        <div className="wrap">
          <h1>Problems with answers known in advance.</h1>
          <p className="lede">
            Every case below is an ordinary Longhand sheet that ends in a check. The value it is
            checked against was worked out independently of this program — from the closed-form
            result, or from a conversion that is exact by definition — and written into the sheet
            beside a note saying where it came from.
          </p>

          <div className={suite.failed ? 'scoreboard fail' : 'scoreboard pass'}>
            <strong>
              {suite.passed} of {suite.results.length} cases pass
            </strong>
            <span>
              {suite.checks} checks, run in your browser just now, on {buildStamp()}
            </span>
          </div>

          <p className="fineprint">
            Nothing here cites a page in a book. A closed form and an SI definition are things you
            can confirm; a page reference you cannot see would be decoration.
          </p>
        </div>
      </section>

      <section className="cases">
        <div className="wrap">
          <div className="filters">
            <button
              className={field === 'all' ? 'chip on' : 'chip'}
              onClick={() => setField('all')}
            >
              All {CASES.length}
            </button>
            {FIELDS.map((candidate) => {
              const count = CASES.filter((subject) => subject.field === candidate).length
              if (count === 0) return null
              return (
                <button
                  key={candidate}
                  className={field === candidate ? 'chip on' : 'chip'}
                  onClick={() => setField(candidate)}
                >
                  {candidate} {count}
                </button>
              )
            })}
          </div>

          <ol className="case-list">
            {shown.map((subject) => {
              const result = byId.get(subject.id)!
              const expanded = open === subject.id
              return (
                <li key={subject.id} id={subject.id} className={result.ok ? 'ok' : 'not-ok'}>
                  <button
                    className="case-head"
                    onClick={() => setOpen(expanded ? null : subject.id)}
                    aria-expanded={expanded}
                  >
                    <span className="verdict">{result.ok ? 'PASS' : 'FAIL'}</span>
                    <span className="case-title">
                      {subject.title}
                      <em>{subject.against}</em>
                    </span>
                    <span className="count">
                      {result.checks.length} check{result.checks.length === 1 ? '' : 's'}
                    </span>
                  </button>

                  {expanded && (
                    <div className="case-body">
                      <div className="case-sheet">
                        <h3>The sheet</h3>
                        <pre>{subject.source.trimEnd()}</pre>
                        <p className="fineprint">
                          <a href={`/app#new`} onClick={openInApp(subject.source, subject.title)}>
                            Open this in the app
                          </a>{' '}
                          to run it yourself.
                        </p>
                      </div>
                      <div className="case-results">
                        <h3>What it checked</h3>
                        <ul>
                          {result.checks.map((check, index) => (
                            <li key={index} className={check.pass ? 'pass' : 'fail'}>
                              <code>{check.label}</code>
                              <span className="badge">{check.pass ? 'OK' : 'NOT OK'}</span>
                            </li>
                          ))}
                        </ul>
                        {result.errors.length > 0 && (
                          <div className="trouble">
                            <h4>Errors</h4>
                            {result.errors.map((error, index) => (
                              <p key={index}>
                                Line {error.line}: <code>{error.source}</code> — {error.message}
                              </p>
                            ))}
                          </div>
                        )}
                        {result.misread.length > 0 && (
                          <div className="trouble">
                            <h4>Lines that did not read as expected</h4>
                            {result.misread.map((miss, index) => (
                              <p key={index}>
                                <code>{miss.of}</code> should contain{' '}
                                <code>{miss.expected}</code>, and reads <code>{miss.actual}</code>.
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </section>

      <section className="honest">
        <div className="wrap narrow">
          <h2>What this does and does not prove</h2>
          <p>
            It proves that Longhand gets these problems right, that its unit algebra survives
            being taken apart two different ways, and that the exact conversions are exact. It is
            a regression test with an audience: a change that breaks one of these cannot be
            released without somebody seeing it.
          </p>
          <p>
            It does not prove that your calculation is the right calculation. Longhand does the
            arithmetic you wrote and shows its working; whether that arithmetic is the correct
            check against the correct code remains yours, as it would be on paper.
          </p>
          <p>
            If you can find a case where Longhand disagrees with a known answer, that is the most
            useful thing anyone can send —{' '}
            <a href="https://github.com/peotnilsson/longhand/issues">open an issue</a>.
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}

/**
 * Hand the case to the app through a share link, which is the one route that
 * carries a whole sheet without a server. Built on click rather than up front:
 * compressing twenty-odd sheets to make twenty-odd links nobody may use is
 * work the page does not need to do.
 */
function openInApp(source: string, name: string) {
  return (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    void import('../share').then(async ({ shareLink }) => {
      window.location.href = await shareLink({ name, source }, `${window.location.origin}/app`)
    })
  }
}
