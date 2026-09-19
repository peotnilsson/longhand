import { SiteFooter, SiteHeader } from '../SiteHeader'
import { EXAMPLES } from '../examples'
import './landing.css'

/**
 * The landing page. Somebody arriving here has never seen the tool, so it has
 * one job: show the thing it does that nothing else does, and get out of the
 * way. Everything claimed here is true of the build that is deployed beside
 * it, including the limitations section — a calculation tool that oversells
 * itself has already lost the reader it needs.
 */

const COMPARISON: { tool: string; good: string; less: string }[] = [
  {
    tool: 'Longhand',
    good: 'Shows every line three ways, keeps your units, propagates tolerances, solves backwards, prints a clean package. Free, in a browser, nothing sent anywhere.',
    less: 'Young. No accounts, no collaboration, no library of code checks. One person builds it.',
  },
  {
    tool: 'Mathcad',
    good: 'The original of the form, decades of features, unit handling engineers trust, and a huge library of worked sheets.',
    less: 'A subscription per seat, Windows, heavyweight, and files that are hard to diff or review outside it.',
  },
  {
    tool: 'Excel',
    good: 'Everywhere, free-ish, unbeatable for tabulating and for anything that is really a list.',
    less: 'The formula is hidden behind the number. No units, so a dimension mistake is a silent wrong answer, and a reviewer cannot read the reasoning.',
  },
  {
    tool: 'handcalcs',
    good: 'Beautiful rendering of Python calculations, free and open, and it proved people want this.',
    less: 'You need Python and a notebook, and it renders — it does not check units, propagate tolerances or solve.',
  },
  {
    tool: 'LaTeX',
    good: 'The best-looking mathematics there is, and complete control of the document.',
    less: 'It typesets; it does not calculate. Change an input and you retype every number that depended on it.',
  },
]

const POINTS: { title: string; text: string }[] = [
  {
    title: 'Every line, three times',
    text: 'The symbolic formula, the same formula with your numbers substituted in, then the result. That middle step is the whole point: a reviewer can follow the arithmetic without redoing it, which is exactly what a hand calculation gives you and a spreadsheet takes away.',
  },
  {
    title: 'Units that stay as you wrote them',
    text: 'A moment of 250 kN·m stays kN·m instead of collapsing into kilojoules, and mm·mm² stays mm³. Mixing dimensions is an error that names the clash rather than a number that looks fine.',
  },
  {
    title: 'Tolerances that carry through',
    text: 'Write 300 mm ± 2 mm and every result downstream gets a ± of its own, worked out from the partial derivatives of your own formula — with the share each input contributed, so you can see which measurement is limiting the answer.',
  },
  {
    title: 'It answers the reverse question',
    text: 'solve sigma = f_y for W_el gives the section modulus you actually need. It varies the value, re-runs the lines that depend on it, and closes in — through as many intermediate steps as your sheet has.',
  },
]

export default function Landing() {
  return (
    <div className="landing">
      <SiteHeader />

      <section className="hero">
        <div className="wrap">
          <h1>An engineering calculation sheet that shows its work.</h1>
          <p className="lede">
            Write the maths in plain text with units. Longhand evaluates it, checks the
            dimensions, carries your tolerances through, and prints a sheet a reviewer can
            follow line by line — the way it was done on paper, without the arithmetic.
          </p>
          <div className="hero-actions">
            <a className="cta" href="/app">
              Open Longhand
            </a>
            <a className="cta ghost" href={`/app?example=${EXAMPLES[0].id}`}>
              Open a worked example
            </a>
          </div>
          <p className="fineprint">
            Free. No account. Nothing you type leaves your browser.
          </p>

          <figure className="shot">
            <img
              src="/shot-sheet.png"
              alt="Longhand with a steel beam calculation: the editor on the left, and on the right each formula shown symbolically, then with the numbers substituted in, then the result."
              width="2400"
              height="1400"
            />
          </figure>
        </div>
      </section>

      <section className="points">
        <div className="wrap">
          {POINTS.map((point) => (
            <article key={point.title}>
              <h2>{point.title}</h2>
              <p>{point.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="why">
        <div className="wrap narrow">
          <h2>Why this exists</h2>
          <p>
            Every engineer has done the same calculation three ways: by hand on squared paper,
            because that is what a checker can read; in a spreadsheet, because that is what
            recalculates; and again in a report, because that is what gets submitted. The tools
            that promise to do all three cost a subscription per seat and run on one operating
            system.
          </p>
          <p>
            Meanwhile a free Python library that does nothing but render calculations the way an
            engineer writes them has collected thousands of stars from people who just wanted
            their working to be readable. That is the demand this is built on: not a new kind of
            maths, but a calculation you can hand to someone else.
          </p>
          <p>
            So Longhand is a text document that evaluates itself. It runs in a browser, keeps
            your sheets on your own machine, prints something you would not be embarrassed to
            submit, and is free while it is being built — and free for students after that.
          </p>
        </div>
      </section>

      <section className="compare">
        <div className="wrap">
          <h2>How it compares, fairly</h2>
          <p className="sub">
            Each of these is better than Longhand at something. Worth knowing which.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Tool</th>
                  <th>What it is good at</th>
                  <th>What it costs you</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.tool} className={row.tool === 'Longhand' ? 'ours' : ''}>
                    <th scope="row">{row.tool}</th>
                    <td>{row.good}</td>
                    <td>{row.less}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="examples">
        <div className="wrap">
          <h2>Worked calculations</h2>
          <p className="sub">
            Real problems, not feature demonstrations. Each one opens in the app as a sheet you
            can edit.
          </p>
          <div className="cards">
            {EXAMPLES.slice(0, 2).map((example) => (
              <a className="card" key={example.id} href={`/app?example=${example.id}`}>
                <h3>{example.name}</h3>
                <p className="blurb">{example.blurb}</p>
                <p className="shows">{example.shows}</p>
                <span className="open">Open in Longhand →</span>
              </a>
            ))}
          </div>
          <p className="more">
            <a href="/docs#examples">
              {EXAMPLES.length - 2} more worked calculations, with the rest of the reference →
            </a>
          </p>
        </div>
      </section>

      <section className="verified">
        <div className="wrap split">
          <div>
            <h2>How you know it is right</h2>
            <p>
              A calculation tool is worth exactly what its arithmetic is worth, so Longhand
              carries a suite of problems whose answers are known before it is asked — closed-form
              results, and conversions that are exact by definition. Each one is an ordinary sheet
              that ends in a check, with the expected value written into it next to a note saying
              where that value came from.
            </p>
            <p>
              The suite runs on every commit, and it runs again in your own browser when you open
              the page, on the same build that served it. Nothing there cites a page in a book: a
              closed form and an SI definition are things you can confirm for yourself.
            </p>
            <p>
              <a className="cta ghost" href="/verification">
                Run the verification suite
              </a>
            </p>
          </div>
          <div className="verified-note">
            <p>
              It proves Longhand gets these problems right. It does not prove your calculation is
              the right calculation — that judgement stays with you, as it would on paper.
            </p>
          </div>
        </div>
      </section>

      <section className="print">
        <div className="wrap split">
          <div>
            <h2>What comes out at the end</h2>
            <p>
              A project is a set of sheets sharing one title block — client, author, checker,
              revision — printed as one package. Ask for page numbers and it paginates properly:
              real A4 pages, each carrying its sheet's title and “Page 3 of 7”, because a
              calculation that will be bound into a submission needs to say where it is.
            </p>
            <p>
              <a className="cta ghost" href="/sample-package.pdf">
                Download a sample package (PDF)
              </a>
            </p>
          </div>
          <figure className="shot small">
            <img
              src="/shot-print.png"
              alt="A printed Longhand package: a title block with author, checker and revision, formulas with their substituted numbers, and a page footer reading Page 1 of 4."
              width="1200"
              height="1600"
            />
          </figure>
        </div>
      </section>

      <section className="honest">
        <div className="wrap narrow">
          <h2>What it is not</h2>
          <p>
            It is a calculation aid, not an authority on any code of practice. It does the
            arithmetic you wrote and shows its working; deciding whether that arithmetic is the
            right check remains yours, as it would be on paper.
          </p>
          <p>
            There are no accounts and no server, which is why nothing you type leaves the
            browser. Sharing works by putting the whole sheet inside a link's fragment, which
            never reaches a server — so a link opens without an account, and is also as private
            as whatever you send it through. Sheets live in your browser's storage; Chrome and
            Edge can additionally keep a copy in a file you choose, and every browser can export
            a backup. There is no library of standard code checks, no collaboration, and no
            mobile editing worth the name. The{' '}
            <a href="/privacy">privacy note</a> says exactly what does and does not leave your
            machine.
          </p>
          <p>
            It is built by one engineering-mathematics student at KTH who uses it for his own
            coursework. If something is wrong or missing,{' '}
            <a href="https://github.com/peotnilsson/longhand/issues">say so on GitHub</a> — that
            is the roadmap.
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  )
}
