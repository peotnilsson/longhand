import { Mark } from './Mark'

/**
 * One header for every page outside the app.
 *
 * It used to be written out separately on each page, and they drifted: the
 * reference had a smaller mark, a shorter bar and a plain text link where the
 * others had a button, so moving between pages felt like moving between sites.
 * One component means they cannot drift again.
 *
 * The nav is deliberately short. Verification and Privacy are reached from the
 * places that earn them — the section on the landing page that makes the claim,
 * and the footer — rather than taking up room at the top of every page.
 */
export function SiteHeader({ here }: { here?: 'help' | 'verification' | 'privacy' }) {
  return (
    <header className="top">
      <div className="wrap top-inner">
        <a className="wordmark" href="/">
          <Mark size={19} />
          Longhand
        </a>
        <nav>
          {here !== 'help' && <a href="/docs">Help</a>}
          <a href="https://github.com/peotnilsson/longhand">Source</a>
          <a className="cta small" href="/app">
            Open the app
          </a>
        </nav>
      </div>
    </header>
  )
}

/** The same for the foot of every page, where the quieter links live. */
export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap foot-inner">
        <span className="wordmark quiet">
          <Mark size={17} />
          Longhand
        </span>
        <nav>
          <a href="/app">Open the app</a>
          <a href="/docs">Help</a>
          <a href="/verification">Verification</a>
          <a href="/privacy">Privacy</a>
          <a href="https://github.com/peotnilsson/longhand">Source</a>
        </nav>
      </div>
    </footer>
  )
}
