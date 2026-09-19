import { useEffect } from 'react'
import { Mark } from '../Mark'
import { buildStamp } from '../build'
import { DISCLAIMER } from '../build'
import { start } from '../analytics'
import '../landing/landing.css'
import './privacy.css'

/**
 * What leaves the browser, and what does not.
 *
 * "Nothing you type leaves your browser" is on the landing page, so it has to
 * be written down somewhere precisely enough to be checked — including the
 * places where something *does* leave, which is the part that makes the rest
 * believable. The page describes what the code does; it does not make legal
 * claims about any particular regulation, because that is not a claim this
 * project is in a position to make.
 */

const COUNTING_DOMAIN: string = import.meta.env?.VITE_ANALYTICS_DOMAIN ?? ''

export default function Privacy() {
  useEffect(() => {
    start()
  }, [])

  return (
    <div className="landing privacy">
      <header className="top">
        <div className="wrap top-inner">
          <a className="wordmark" href="/">
            <Mark size={19} />
            Longhand
          </a>
          <nav>
            <a href="/docs">Reference</a>
            <a href="/verification">Verification</a>
            <a className="cta small" href="/app">
              Open the app
            </a>
          </nav>
        </div>
      </header>

      <section className="hero privacy-hero">
        <div className="wrap narrow">
          <h1>Privacy, terms and licence</h1>
          <p className="lede">
            Longhand runs entirely in your browser. There is no account, no database and no
            server holding your calculations. This page says exactly what that means, including
            where it stops being true.
          </p>
        </div>
      </section>

      <section className="honest">
        <div className="wrap narrow">
          <h2>Where your calculations live</h2>
          <p>
            Everything you write is kept in your browser's own storage, on the machine you wrote
            it on. It is not sent anywhere, it is not readable by anyone else, and it does not
            follow you to another computer. If you clear your browser's site data for this
            domain, it is gone — which is why the app asks you to keep a backup, and why Chrome
            and Edge can additionally write a copy to a file you choose and keep it up to date
            as you type. That file is on your disk and nothing reads it but you.
          </p>
          <p>
            The practical consequence is worth stating plainly: there are no backups but yours.
            Nobody can recover a sheet for you, because nobody else ever had it.
          </p>

          <h2>Share links</h2>
          <p>
            A share link carries the entire calculation inside the address, after the{' '}
            <code>#</code>. Everything after that character is handled by your browser and is
            never transmitted to a web server, so making a link uploads nothing and opening one
            downloads nothing but the app itself.
          </p>
          <p>
            That is also its limitation. A link is the document: anyone who has it can read the
            calculation, and whatever you send it through — mail, a chat app, a ticket system —
            has it too. Treat sending a link exactly as you would treat sending the file.
          </p>

          <h2>What is counted</h2>
          {COUNTING_DOMAIN ? (
            <>
              <p>
                Longhand counts a small number of anonymous events so that one question can be
                answered: does anyone come back? Each one sends the name of the event, the page's
                origin and path with the query and the <code>#</code> part removed, the origin of
                the site that referred you, and at most a few fixed labels such as{' '}
                <code>week</code> or <code>later</code>. That is the whole payload, and it is
                built by Longhand rather than by a third-party script, which is what guarantees
                a share link's contents can never be inside it.
              </p>
              <p>
                No cookie is set, no identifier is stored or sent, and nothing you type is ever
                included — not a sheet, not a formula, not a file name, not a sheet's title. The
                counts go to {COUNTING_DOMAIN} via Plausible Analytics, which receives your IP
                address as part of the request, as every web request does, and does not store it.
                Do Not Track and Global Privacy Control are honoured, and Settings → Data has a
                switch that turns even this off.
              </p>
            </>
          ) : (
            <p>
              This build counts nothing at all. The code for anonymous counting is present but
              disabled: with no analytics domain configured, it makes no network request of any
              kind. If that changes, it will be described here before it ships, and there will be
              a switch in Settings → Data to turn it off.
            </p>
          )}

          <h2>What the site itself requests</h2>
          <p>
            The app, the fonts it uses and the mathematics rendering are all served from this
            domain. There is no content delivery network, no font service, no tag manager and no
            embedded third-party code. The site is hosted on Vercel, whose servers necessarily
            see the ordinary details of any web request — your IP address, your browser's user
            agent, and which page you asked for — in order to serve it. Nothing in your
            calculation is among those details.
          </p>
          <p>
            Two places open something outside the app, and only when you press them: the feedback
            box, which opens a pre-filled GitHub issue or an email in your own mail program, and
            never sends anything by itself; and the links to the source repository.
          </p>

          <h2>Figures</h2>
          <p>
            An image you add to a sheet is resized in your browser and stored beside the sheet,
            in the same browser storage. It is not uploaded. If you share a sheet that has
            figures, they travel inside the link like the rest of it.
          </p>

          <h2>What Longhand is, and is not</h2>
          <p>{DISCLAIMER}</p>
          <p>
            It is offered free and as it is, without any warranty. It has a verification suite of
            problems with independently known answers, which you can{' '}
            <a href="/verification">run yourself</a>, and it is still a young program written by
            one person. Check its output the way you would check a colleague's: that is what the
            substituted middle line is for.
          </p>

          <h2>Licence</h2>
          <p>
            Longhand is published under the MIT licence: you may use, copy, modify and
            redistribute it, including commercially, provided the copyright notice and the
            licence text go with it, and it comes with no warranty. The full text is in the{' '}
            <a href="https://github.com/peotnilsson/longhand/blob/main/LICENSE">
              LICENSE file in the repository
            </a>
            .
          </p>

          <h2>Changes, and how to ask</h2>
          <p>
            If any of this changes, the page changes with it and the change is visible in the
            repository's history like everything else. Questions and corrections belong in{' '}
            <a href="https://github.com/peotnilsson/longhand/issues">the issues</a>.
          </p>

          <p className="stamp">{buildStamp()}</p>
        </div>
      </section>

      <footer className="foot">
        <div className="wrap foot-inner">
          <span className="wordmark quiet">
            <Mark size={17} />
            Longhand
          </span>
          <nav>
            <a href="/app">Open the app</a>
            <a href="/docs">Reference</a>
            <a href="/verification">Verification</a>
            <a href="https://github.com/peotnilsson/longhand">Source</a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
