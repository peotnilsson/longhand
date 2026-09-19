import { useEffect } from 'react'
import { SiteFooter, SiteHeader } from '../SiteHeader'
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

export default function Privacy() {
  useEffect(() => {
    start()
  }, [])

  return (
    <div className="landing privacy">
      <SiteHeader here="privacy" />

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
          <p>
            Longhand counts a small number of anonymous events so that one question can be
            answered: does anyone come back? Each one carries the name of the event, this page's
            origin and path — with the query and everything after the <code>#</code> removed —
            and at most a few fixed labels such as <code>week</code> or <code>later</code>. That
            is the whole payload.
          </p>
          <p>
            The counting is Plausible Analytics, and its script is loaded by this site with
            automatic page capture switched off. That setting is the important one: left on, the
            script would report the full address of the page, and on this site the part of the
            address after the <code>#</code> is the calculation itself. With it off the script
            sends nothing on its own, and every event is handed to it with an address Longhand
            builds from the origin and the path alone.
          </p>
          <p>
            No cookie is set, no identifier is stored or sent, and nothing you type is ever
            included — not a sheet, not a formula, not a file name, not a sheet's title. Plausible
            receives your IP address as part of the request, as every web request does, and does
            not store it. Do Not Track and Global Privacy Control are honoured, and Settings →
            Data has a switch that stops even this. Blocking the script in your browser also
            stops it, and nothing else on the site depends on it.
          </p>

          <h2>What the site itself requests</h2>
          <p>
            The app, the fonts it uses and the mathematics rendering are all served from this
            domain. There is no content delivery network, no font service and no tag manager; the
            counting script described above is the only third-party code on the page. The site is
            hosted on Vercel, whose servers necessarily
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

      <SiteFooter />
    </div>
  )
}
