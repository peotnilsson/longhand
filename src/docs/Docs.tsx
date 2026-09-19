import { useEffect, useMemo, useRef, useState } from 'react'
import { ENTRIES, REFERENCE, filterSections, type Entry, type Section } from '../reference'
import { EXAMPLES } from '../examples'
import { Mark } from '../Mark'
import './docs.css'

/**
 * The reference: every command, what it means, and a worked line to copy.
 *
 * It reads the same module the app's Help button points at, so there is one
 * place where the language is described and no way for the page to drift away
 * from what the engine does — a test runs every example on this page.
 */

function Code({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch {
      /* a browser that will not allow it: the text is selectable anyway */
    }
  }

  return (
    <div className="code">
      <pre>{text}</pre>
      <button onClick={copy} aria-label="Copy">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function EntryCard({ entry }: { entry: Entry }) {
  return (
    <article className="entry" id={entry.id}>
      <h3>
        <a href={`#${entry.id}`}>
          <code>{entry.code}</code>
        </a>
      </h3>
      <p className="summary">{entry.summary}</p>
      {entry.detail && <p className="detail">{entry.detail}</p>}
      {entry.example && <Code text={entry.example} />}
    </article>
  )
}

function SectionBlock({ section }: { section: Section }) {
  return (
    <section className="section" id={section.id}>
      <h2>{section.title}</h2>
      {section.blurb && <p className="blurb">{section.blurb}</p>}

      {section.prose?.map((block, index) => (
        <div className="prose" key={index}>
          {block.heading && <h3>{block.heading}</h3>}
          <p>{block.text}</p>
        </div>
      ))}

      {(section.entries ?? []).map((entry) => (
        <EntryCard key={entry.id} entry={entry} />
      ))}
    </section>
  )
}

export default function Docs() {
  const [query, setQuery] = useState('')
  const box = useRef<HTMLInputElement>(null)
  const main = useRef<HTMLElement>(null)
  const [current, setCurrent] = useState(REFERENCE[0].id)
  const sections = useMemo(() => filterSections(query), [query])
  const hits = useMemo(
    () => sections.reduce((count, section) => count + (section.entries?.length ?? 0), 0),
    [sections],
  )

  /**
   * The index is always on screen, so it may as well say where you are: the
   * section whose heading has last passed the top of the text column. Read
   * from the scroll position rather than an observer, because that answer is
   * the same whether you scrolled, clicked an anchor or arrived on one.
   */
  useEffect(() => {
    const pane = main.current
    if (!pane) return

    let queued = false
    const update = () => {
      queued = false
      const marks = [...pane.querySelectorAll<HTMLElement>('.section[id]')]
      // A little below the top edge, so a section that an anchor has just
      // landed on — which sits at its scroll-margin — counts as the one you
      // are reading rather than the one above it.
      const top = pane.getBoundingClientRect().top + 28
      const passed = marks.filter((mark) => mark.getBoundingClientRect().top <= top)
      const here = passed.at(-1) ?? marks[0]
      if (here) setCurrent(here.id)
    }

    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(update)
    }

    update()
    pane.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      pane.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [query])

  // "/" to search is the convention on a documentation page; Escape leaves it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && document.activeElement !== box.current) {
        event.preventDefault()
        box.current?.focus()
      }
      if (event.key === 'Escape' && document.activeElement === box.current) {
        setQuery('')
        box.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="docs">
      <header className="docs-head">
        <div className="docs-head-inner">
          <a className="brand" href="/">
            <Mark size={18} />
            Longhand
          </a>
          <nav>
            <a href="/app">Open the app</a>
            <a href="/verification">Verification</a>
            <a href="/privacy">Privacy</a>
            <a href="https://github.com/peotnilsson/longhand">Source</a>
          </nav>
        </div>
      </header>

      <div className="docs-body">
        <aside className="docs-nav">
          <div className="docs-nav-inner">
            <input
              ref={box}
              className="search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search — press /"
              aria-label="Search the reference"
            />
            {query ? (
              <p className="count">
                {hits} of {ENTRIES.length} {hits === 1 ? 'entry' : 'entries'}
              </p>
            ) : (
              <ul>
                {[...REFERENCE, { id: 'examples', title: 'Worked examples' }].map((section) => (
                  <li key={section.id}>
                    <a
                      className={current === section.id ? 'current' : undefined}
                      href={`#${section.id}`}
                      aria-current={current === section.id ? 'true' : undefined}
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className="docs-main" ref={main}>
          {!query && (
            <div className="intro">
              <h1>Reference</h1>
              <p>
                Longhand is a calculation sheet you write in plain text. Every line is an
                assignment, a check, a table, a heading or a note; units come along for the
                ride, and each result is shown three times — the formula, the same formula with
                your numbers in it, then the answer.
              </p>
              <p className="intro-hint">
                Press <kbd>/</kbd> to search. Every example below is run against the engine
                whenever the tests do, so nothing here can quietly stop being true.
              </p>
            </div>
          )}

          {sections.map((section) => (
            <SectionBlock key={section.id} section={section} />
          ))}

          {sections.length === 0 && (
            <p className="nothing">
              Nothing matches “{query}”. Try the name of a unit, a command, or what you are
              trying to do — “goal seek”, “vlookup”, “uncertainty”.
            </p>
          )}

          {!query && (
            <section className="section" id="examples">
              <h2>Worked examples</h2>
              <p className="blurb">
                Four calculations that solve a real problem rather than demonstrate a feature.
                Each opens in the app as a new sheet.
              </p>
              {EXAMPLES.map((example) => (
                <article className="entry" key={example.id}>
                  <h3>
                    <a href={`/app?example=${example.id}`}>{example.name}</a>
                  </h3>
                  <p className="summary">{example.blurb}</p>
                  <p className="detail">{example.shows}</p>
                  <p>
                    <a className="button" href={`/app?example=${example.id}`}>
                      Open in Longhand
                    </a>
                  </p>
                </article>
              ))}
            </section>
          )}

          <footer className="docs-foot">
            <p>
              Longhand is a calculation aid, not an authority on any code of practice. Check
              what it gives you, the way you would check anything else.
            </p>
          </footer>
        </main>
      </div>
    </div>
  )
}
