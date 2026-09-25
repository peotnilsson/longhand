/**
 * What the tests cannot check: the app in a real browser.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npm i --no-save playwright && node verify.mjs
 *
 * Writes verify-light.png, verify-dark.png and verify-phone.png to look at.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const ok = []
const bad = []
const check = (name, pass, detail = '') => (pass ? ok : bad).push(`${name}${detail ? ' — ' + detail : ''}`)

/**
 * The sandbox this was written in ships a browser at a fixed path and blocks
 * the download Playwright would otherwise do. A GitHub runner has neither, so
 * the path is used only when it is actually there and Playwright picks its own
 * browser everywhere else.
 */
const bundled = '/opt/pw-browsers/chromium'
/**
 * The full browser, not the headless shell.
 *
 * Playwright now launches chrome-headless-shell by default, which is a smaller
 * build with pieces missing — and this pass exercises the File System Access
 * API and the origin-private file system, which are exactly the sort of thing
 * it does not carry. `channel: 'chromium'` asks for the real one.
 */
const browser = await chromium.launch(
  existsSync(bundled) ? { executablePath: bundled } : { channel: 'chromium' },
)
/**
 * Every page in this pass, with the counting script blocked.
 *
 * The suite must not depend on a third party being reachable. plausible.io is
 * fine from a laptop and fine from a runner most of the time, and "most of the
 * time" is exactly what a test cannot be built on: a deferred script that
 * never answers holds up the load event, and a reload that never finishes
 * loading looks identical to an app that failed to start.
 *
 * Aborting the request still fires Playwright's `request` event, so the checks
 * that care about what the page asks for — that it asks for the counter, and
 * that no request anywhere carries a calculation — still see it.
 */
const openPage = async (options) => {
  const fresh = await browser.newPage(options)
  await fresh.route(/plausible\.io/, (route) => route.abort())
  return fresh
}

const page = await openPage({ viewport: { width: 1400, height: 900 } })
// A shared runner is several times slower than a laptop, and a slow app is not
// a broken one. Thirty seconds was enough here and not on a runner.
page.setDefaultTimeout(45_000)
page.on('pageerror', (e) => bad.push('PAGE ERROR: ' + e.message))
/**
 * The counting script is third-party and optional: an ad blocker, an offline
 * machine or a locked-down CI sandbox will fail to load it, and the app is
 * built so that nothing depends on it. So a failed request for it is not a
 * failure of the page.
 */
const optional = (text) =>
  /plausible|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_BLOCKED|ERR_FAILED/i.test(text)
page.on('console', (m) => {
  if (m.type() === 'error' && !optional(m.text())) bad.push('CONSOLE: ' + m.text())
})

const seed = {
  version: 4,
  projects: [
    { id: 'p1', name: 'Bridge', meta: { client: 'C', author: 'Peo', checkedBy: 'AN', revision: 'B' },
      sheets: [
        { id: 's1', name: 'Loads', source: '# Loads\nM_Ed = 250 kN*m\nf_ck = 30 MPa\n' },
        { id: 's2', name: 'Beam', source: '# Beam\nimport "Loads"\nb = 300 mm +- 2 mm\nh = 500 mm\nW = b*h^2/6\nsigma = M_Ed/W\nsigma <= f_ck\n\ntable\n  section | bw | hw | Wt = bw*hw^2/6 | st = M_Ed/Wt\n  A | 300 mm | 500 mm\n  B | 250 mm | 450 mm\n  C | 200 mm | 350 mm\nend\n' },
        { id: 's3', name: 'Beam', source: '# Duplicate name\nx = 1 mm\n' },
      ] },
    { id: 'p2', name: 'Tunnel', meta: { client: '', author: '', checkedBy: '', revision: 'A' },
      sheets: [{ id: 's9', name: 'Only', source: '# Only\ny = 2 mm\n' }] },
  ],
  activeProjectId: 'p1',
  activeSheetId: 's2',
  precision: 4,
  mode: 'quadrature',
  settings: { theme: 'light', author: 'Peo', project: 'Bridge' },
  lastBackupAt: Date.now() - 3 * 86400000,
}

/**
 * Seeding goes through an init script, which runs on every navigation — so a
 * store written with page.evaluate() is wiped by the next reload unless the
 * newest init script carries it. Every re-seed uses this.
 */
// A real FileSystemFileHandle, from the origin's private file system: cloneable
// and storable in IndexedDB exactly like one from a real file picker, so the
// whole "keep a copy on disk" path can be exercised without a dialog.
await page.addInitScript(() => {
  const open = async () => {
    const root = await navigator.storage.getDirectory()
    return root.getFileHandle('verify.longhand.json', { create: true })
  }
  window.showSaveFilePicker = open
  window.showOpenFilePicker = async () => [await open()]
  window.__readDisk = async () => (await (await open()).getFile()).text()
})

/**
 * When something times out waiting for an element, the useful question is what
 * the page was showing instead — an error boundary, a blank body, a half-built
 * frame. Playwright's own message does not say, and in CI there is nobody at
 * the keyboard to go and look.
 */
process.on('uncaughtException', (error) => {
  void (async () => {
    let seen = ''
    try {
      seen = (await page.evaluate(() => document.body.innerText)).trim().slice(0, 700)
    } catch {
      seen = '(the page could not be read at all)'
    }
    console.error('\n--- what the page was showing ---\n' + (seen || '(empty body)'))
    console.error('\n--- the error ---')
    console.error(error)
    console.log('PASS:'); ok.forEach((l) => console.log('  ✓ ' + l))
    console.log('FAIL:'); bad.forEach((l) => console.log('  ✗ ' + l))
    process.exit(1)
  })()
})

/** The link the share check produced, reused by the phone check further down. */
let sharedLink = ''

/** A downloaded file's contents, as text. */
const readDownload = async (download) => readFile(await download.path(), 'utf8')

/**
 * Panels that live under More now that the toolbar is four controls wide.
 *
 * The old checks clicked a toolbar button to open a panel and clicked it again
 * to close; these keep that shape, using the panel's own name in the DOM to
 * tell what is on screen rather than guessing.
 */
const openPanelName = async () =>
  page.$eval('.panel', (element) => element.dataset.panel).catch(() => null)

const togglePanel = async (name, label) => {
  const current = await openPanelName()
  if (current === name) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
    return
  }
  if (current) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(150)
  }
  await page.click('.toolbar-menu > button')
  await page.waitForSelector('.menu')
  await page.click(`.menu button:has-text("${label}")`)
  await page.waitForTimeout(150)
}

const seedWith = async (store) => {
  await page.addInitScript((s) => localStorage.setItem('longhand:store', JSON.stringify(s)), store)
  await page.goto('http://localhost:4173/app')
  await page.reload()
  await page.waitForSelector('.sheet-page')
  await page.waitForTimeout(250)
}

await seedWith(seed)

// 1. table columns share a unit and notation, with real superscripts
const cells = await page.$$eval('.sheet-table tbody tr', (rows) =>
  rows.map((r) => [...r.children].map((c) => c.textContent.trim())))
check('table columns', JSON.stringify(cells).includes('300 mm'), JSON.stringify(cells[0]))
const sups = await page.$$eval('.sheet-table sup', (s) => s.map((e) => e.textContent))
check('table superscripts rendered', sups.length > 0, `sup: ${JSON.stringify(sups.slice(0, 6))}`)
const hasCaret = JSON.stringify(cells).includes('^')
check('no raw ^ left in table', !hasCaret)

// 2. duplicate name warning in the project panel
await page.click('button:has-text("Project")')
await page.waitForSelector('.panel')
const warn = await page.$$eval('.panel .warning', (w) => w.map((e) => e.textContent))
check('duplicate name warning', warn.some((t) => t.includes('Beam')), JSON.stringify(warn))
await page.click('button:has-text("Project")')

// 3. backup age in settings
await togglePanel('settings', 'Settings')
await page.waitForSelector('.panel')
const settingsText = await page.$eval('.panel', (e) => e.textContent)
check('backup age shown', /3 days/.test(settingsText), settingsText.match(/.{0,40}day.{0,20}/)?.[0] ?? 'not found')

// 4. delete asks twice (sheet delete lives in the sidebar footer)
const delBtn = await page.$('.sheets-foot button:has-text("Delete"):not(:has-text("Duplicate"))')
{
  const before = await delBtn.textContent()
  await delBtn.click()
  const after = await delBtn.textContent()
  check('delete asks twice', before === 'Delete' && after === 'Really?', `${before} -> ${after}`)
  const store = await page.evaluate(() => JSON.parse(localStorage.getItem('longhand:store')))
  check('first delete click destroys nothing', store.projects[0].sheets.length === 3,
    `${store.projects[0].sheets.length} sheets still there`)
  await page.waitForTimeout(4300)
  check('delete confirmation times out', (await delBtn.textContent()) === 'Delete')
}

// 5. sheet reorder (both sheets here are called "Beam", so compare ids, not labels)
const ids = async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('longhand:store'))))
  .projects[0].sheets.map((s) => s.id)
{
  const before = await ids()
  await (await page.$('.sheets-foot button[title="Move sheet down"]')).click()
  await page.waitForTimeout(250)
  const down = await ids()
  check('reorder ↓ moves the active sheet down', JSON.stringify(down) === '["s1","s3","s2"]',
    `${JSON.stringify(before)} -> ${JSON.stringify(down)}`)
  await (await page.$('.sheets-foot button[title="Move sheet up"]')).click()
  await page.waitForTimeout(250)
  const up = await ids()
  check('reorder ↑ puts it back', JSON.stringify(up) === JSON.stringify(before),
    JSON.stringify(up))
  const first = await page.$('.sheets-foot button[title="Move sheet up"]')
  await (await page.$$('.tree button'))[1].click()
  await page.waitForTimeout(150)
  check('↑ is disabled on the first sheet', await first.isDisabled())
}

// 6. move to project (Project panel)
await page.click('button:has-text("Project")')
await page.waitForSelector('.panel')
{
  // By label, not by position: the project panel has more than one select now,
  // and "the first one" is exactly the kind of thing that quietly moves.
  const sel = await page.$('.panel select[aria-label^="Move this sheet"]')
  await sel.selectOption('p2')
  await page.waitForTimeout(250)
  const store = await page.evaluate(() => JSON.parse(localStorage.getItem('longhand:store')))
  const tunnel = store.projects.find((p) => p.id === 'p2')
  const bridge = store.projects.find((p) => p.id === 'p1')
  check('move to project', tunnel.sheets.length === 2 && bridge.sheets.length === 2,
    `Tunnel ${tunnel.sheets.length}, Bridge ${bridge.sheets.length}`)
  check('follows the moved sheet into its new project',
    store.activeProjectId === 'p2' && tunnel.sheets.some((s) => s.id === store.activeSheetId),
    `${store.activeProjectId}/${store.activeSheetId}, Tunnel holds ${JSON.stringify(tunnel.sheets.map((s) => s.id))}`)
}

// 7. package preview persists and numbers the sheets
await seedWith(seed)
await page.click('button:has-text("Project")')
await page.waitForSelector('.panel')
await page.click('button:has-text("Preview whole project")')
await page.waitForTimeout(400)
{
  const bar = await page.$('.package-bar')
  check('package preview stays open', !!bar)
  check('opening the package closes the panel', !(await page.$('.panel')))
  const pages = await page.$$('.sheet-page')
  const positions = await page.$$eval('.sheet-page', (els) =>
    els.map((e) => (e.textContent.match(/Sheet\s*\d+ of \d+/) || [''])[0].replace(/\s+/g, ' ')))
  // Four pages, not three: the package opens with a page listing every check
  // in it, which is the page a reviewer reads first.
  check('package prints every sheet, numbered', pages.length === 4 &&
    positions.slice(1).join('|') === 'Sheet1 of 3|Sheet2 of 3|Sheet3 of 3',
    `${pages.length} pages, ${JSON.stringify(positions)}`)
  check('package opens with all its checks on one page',
    (await page.$('.package-checks')) !== null &&
    /All checks in this package/.test(await page.$eval('.package-checks', (e) => e.textContent)))
  await page.click('.package-bar button:has-text("Close")')
  await page.waitForTimeout(200)
  check('package closes', !(await page.$('.package-bar')))
}

// 8. save failure banner
await page.evaluate(() => {
  const proto = Object.getPrototypeOf(localStorage)
  window.__realSet = proto.setItem
  proto.setItem = function () { const e = new DOMException('full', 'QuotaExceededError'); throw e }
})
await page.click('.cm-content')
await page.keyboard.type('\nz = 9 mm')
await page.waitForTimeout(900)
const alert = await page.$('.save-alert')
check('save failure banner', !!alert, alert ? (await alert.textContent()).slice(0, 90) : 'no banner')
await page.evaluate(() => { Object.getPrototypeOf(localStorage).setItem = window.__realSet })

// 9. stale dimming while a long sheet catches up, then clears
const big = ['# Big', 'b = 300 mm +- 2 mm', 'h = 500 mm']
for (let i = 0; i < 300; i += 1) big.push(`W${i} = b*h^2/${i + 6}`)
await seedWith({
  ...seed,
  projects: [{ ...seed.projects[0], sheets: [{ id: 'big', name: 'Big', source: big.join('\n') }] }],
  activeSheetId: 'big',
})
check('the long sheet really is long',
  (await page.evaluate(() => JSON.parse(localStorage.getItem('longhand:store'))))
    .projects[0].sheets[0].source.split('\n').length === 303)
/**
 * One burst of typing can land while the previous render is still going, and
 * on a loaded machine that shows up as a second of blocked keystrokes which
 * has nothing to do with the editor. What we mean by "typing is not blocked"
 * is that it is normally instant, so the median of several bursts is the
 * honest measurement and one unlucky sample is not a failing build.
 */
const burst = async () => {
  await page.click('.cm-content')
  await page.keyboard.press('Control+Home')
  const started = Date.now()
  await page.keyboard.type('// x', { delay: 0 })
  return Date.now() - started
}
await burst()
await page.waitForTimeout(1500)
const samples = []
for (let i = 0; i < 5; i += 1) {
  samples.push(await burst())
  await page.waitForTimeout(600)
}
const typed = [...samples].sort((a, b) => a - b)[2]
await page.waitForTimeout(1500)
const stillStale = await page.$('.output-pane.stale')
check('typing not blocked on a 300-line sheet', typed < 600,
  `median ${typed}ms of ${JSON.stringify(samples)} for 4 keystrokes`)
check('stale clears once caught up', !stillStale)

// 10. delete lands on the sheet above, so deleting several in a row is quick
await seedWith(seed)
{
  const active = async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('longhand:store'))))
  const del = await page.$('.sheets-foot button:has-text("Delete")')
  // start on the last sheet and delete twice, pressing the same button four times
  await (await page.$$('.tree .sheet'))[2].click()
  await page.waitForTimeout(150)
  await del.click(); await del.click()
  await page.waitForTimeout(200)
  const first = await active()
  check('delete lands on the sheet above', first.activeSheetId === 's2',
    `now on ${first.activeSheetId}`)
  check('the button stayed put', (await del.textContent()) === 'Delete')
  await del.click(); await del.click()
  await page.waitForTimeout(200)
  const second = await active()
  check('a second delete without moving the mouse', second.projects[0].sheets.length === 1,
    `${second.projects[0].sheets.length} left, on ${second.activeSheetId}`)
  check('the last sheet cannot be deleted', await del.isDisabled())
}

// 11. profile
await page.click('.profile-button')
await page.waitForSelector('.panel')
{
  check('profile avatar shows initials', (await page.$eval('.avatar', (e) => e.textContent)) === 'P')
  await page.fill('.panel input', 'Peo Nilsson')
  await page.waitForTimeout(250)
  check('the name reaches the avatar', (await page.$eval('.avatar', (e) => e.textContent)) === 'PN')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('longhand:store')))
  check('the name is kept', saved.settings.author === 'Peo Nilsson', saved.settings.author)
  await page.click('.profile-button')
  check('profile closes', !(await page.$('.panel')))
}

// 12. Help leaves for the reference rather than opening a panel
{
  await page.click('.toolbar-menu > button')
  await page.waitForSelector('.menu')
  const help = await page.$('.menu a')
  check('Help is a link to the reference',
    (await help?.getAttribute('href')) === '/docs' &&
      /Help/.test((await help?.textContent()) ?? ''),
    (await help?.getAttribute('href')) ?? 'no link')
  check('and there is no help panel left behind', !(await page.$('.panel.help')))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
}

// 13. the frame stays put: only the code and the document scroll
{
  const long = ['# Long sheet']
  for (let i = 0; i < 200; i += 1) long.push(`x${i} = ${i} mm`)
  await seedWith({
    ...seed,
    projects: [{ ...seed.projects[0], sheets: [{ id: 'l', name: 'Long', source: long.join('\n') }] }],
    activeSheetId: 'l',
  })
  // an open panel is the case that used to push the editor off the screen
  await togglePanel('settings', 'Settings')
  await page.waitForTimeout(400)

  const pageScrolls = await page.evaluate(() =>
    document.documentElement.scrollHeight > document.documentElement.clientHeight + 1)
  check('the page itself never scrolls', !pageScrolls)

  const box = (selector) => page.$eval(selector, (e) => Math.round(e.getBoundingClientRect().top))
  const before = { toolbar: await box('.toolbar'), panel: await box('.panel'), sheets: await box('.sheets') }
  const scrolled = await page.evaluate(() => {
    // whichever element actually holds the overflow
    const scroller = [...document.querySelectorAll('.editor, .editor .cm-scroller')]
      .find((e) => e.scrollHeight > e.clientHeight + 1)
    if (!scroller) return 'nothing in the editor scrolls'
    scroller.scrollTop = 600
    return scroller.scrollTop
  })
  await page.waitForTimeout(250)
  const after = { toolbar: await box('.toolbar'), panel: await box('.panel'), sheets: await box('.sheets') }
  check('the code scrolls', scrolled === 600, `${scrolled}`)
  check('the toolbar, panel and sidebar stay put', JSON.stringify(before) === JSON.stringify(after),
    `${JSON.stringify(before)} -> ${JSON.stringify(after)}`)

  // the document pane scrolls on its own, without moving anything else
  const docScrolled = await page.evaluate(() => {
    const pane = document.querySelector('.output-pane')
    if (pane.scrollHeight <= pane.clientHeight + 1) return 'the document pane does not scroll'
    pane.scrollTop = 400
    return pane.scrollTop
  })
  await page.waitForTimeout(200)
  check('the document scrolls on its own', docScrolled === 400, `${docScrolled}`)
  check('and still nothing else moved', (await box('.toolbar')) === before.toolbar)

  // an open panel keeps its button outlined once the mouse has left it
  await page.mouse.move(5, 5)
  await page.waitForTimeout(150)
  const lit = await page.$$eval('.toolbar button', (els) =>
    els.filter((e) => e.classList.contains('on')).map((e) => ({
      text: e.textContent.trim(),
      border: getComputedStyle(e).borderTopColor,
      background: getComputedStyle(e).backgroundColor,
    })))
  check('the open tab stays outlined with the mouse away',
    lit.length === 1 && lit[0].text.startsWith('More') &&
      lit[0].border !== 'rgba(0, 0, 0, 0)' && lit[0].background !== 'rgba(0, 0, 0, 0)',
    JSON.stringify(lit))
  await togglePanel('settings', 'Settings')
  await page.waitForTimeout(150)
  check('pressing it again puts it out', (await page.$$('.toolbar button.on')).length === 0,
    JSON.stringify([await openPanelName(), Boolean(await page.$('.menu')),
      await page.$$eval('.toolbar button.on', (els) => els.map((e) => [e.textContent.trim(), e.className]))]))
}

// 14. printing is not clipped by the fixed frame
{
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(300)
  const printed = await page.evaluate(() => {
    const app = document.querySelector('.app')
    const style = getComputedStyle(app)
    return {
      overflow: style.overflow,
      editorHidden: getComputedStyle(document.querySelector('.editor-pane')).display === 'none',
      sidebarHidden: getComputedStyle(document.querySelector('.sheets')).display === 'none',
      // the whole document has to be laid out, not cut at one screen
      appHeight: Math.round(app.getBoundingClientRect().height),
      docHeight: document.querySelector('.sheet-page').getBoundingClientRect().height,
    }
  })
  check('printing releases the fixed frame', printed.overflow === 'visible', printed.overflow)
  check('printing hides the editor and sidebar', printed.editorHidden && printed.sidebarHidden)
  check('the whole document is laid out for print',
    printed.appHeight >= printed.docHeight - 2 && printed.appHeight > 1000,
    `app ${printed.appHeight}px, document ${Math.round(printed.docHeight)}px`)
  await page.emulateMedia({ media: 'screen' })
}

// 15. solve, and a named table read between the rows
await seedWith({
  ...seed,
  projects: [
    {
      ...seed.projects[0],
      sheets: [
        {
          id: 'm',
          name: 'Maths',
          source: `# Maths
M = 250 kN*m
f_ck = 30 MPa
h = 500 mm
b = 300 mm
W = b*h^2/6
sigma = M/W
b_req = solve sigma = f_ck for b

table steel
  profile | hs     | A
  IPE200  | 200 mm | 2850 mm^2
  IPE300  | 300 mm | 5380 mm^2
end
A_mid = interp(250 mm, steel.hs, steel.A)
A_300 = lookup("IPE300", steel.profile, steel.A)
A_all = sum(steel.A)
`,
        },
      ],
    },
  ],
  activeSheetId: 'm',
})
{
  // KaTeX sets its spaces with glyph elements, so the text comes back with
  // non-breaking and thin spaces in it: compare on collapsed whitespace.
  const document = (await page.$eval('.output-pane', (e) => e.textContent)).replace(/\s+/g, ' ')
  const has = (text) => document.includes(text)
  check('solve gives the width that meets the limit', /⇒\s*b\s*req\s*=\s*200 mm/.test(document),
    document.match(/⇒.{0,24}/)?.[0] ?? 'not found')
  check('interp reads between the rows', has('4115 mm'),
    document.match(/4115.{0,10}/)?.[0] ?? 'not found')
  check('lookup finds the row', has('5380 mm'))
  check('sum adds a named column', has('8230 mm'), document.match(/8230.{0,10}/)?.[0] ?? 'not found')
  const errors = await page.$$('.line-error, .error')
  check('none of it errors', errors.length === 0, `${errors.length} error lines`)
}

// 16. keyboard shortcuts and the undo for a deleted sheet
await seedWith(seed)
{
  const state = async () => page.evaluate(() => JSON.parse(localStorage.getItem('longhand:store')))
  const popup = page.waitForEvent('popup', { timeout: 4000 }).catch(() => null)
  await page.keyboard.press('Alt+h')
  const reference = await popup
  check('Alt+H opens the reference', !!reference && new URL(reference.url()).pathname === '/docs',
    reference ? reference.url() : 'nothing opened')
  await reference?.close()

  await page.keyboard.press('Alt+p')
  await page.waitForTimeout(200)
  check('Alt+P opens the project panel', !!(await page.$('.panel')))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  check('Escape closes it', !(await page.$('.panel')))

  const before = (await state()).activeSheetId
  await page.keyboard.press('Alt+BracketRight')
  await page.waitForTimeout(250)
  check('Alt+] moves to the next sheet', (await state()).activeSheetId !== before,
    `${before} -> ${(await state()).activeSheetId}`)
  await page.keyboard.press('Alt+BracketLeft')
  await page.waitForTimeout(250)
  check('Alt+[ moves back', (await state()).activeSheetId === before)

  const sheets = (await state()).projects[0].sheets.length
  await page.keyboard.press('Alt+n')
  await page.waitForTimeout(250)
  check('Alt+N adds a sheet', (await state()).projects[0].sheets.length === sheets + 1)

  const del = await page.$('.sheets-foot button:has-text("Delete")')
  await del.click()
  await del.click()
  await page.waitForTimeout(300)
  check('the deleted sheet is gone', (await state()).projects[0].sheets.length === sheets)
  const bar = await page.$('.undo-bar')
  check('an undo is offered', !!bar, bar ? (await bar.textContent()).slice(0, 60) : 'no bar')
  await page.click('.undo-bar button:has-text("Undo")')
  await page.waitForTimeout(300)
  const restored = await state()
  check('undo puts it back', restored.projects[0].sheets.length === sheets + 1)
  check('and lands on it', restored.projects[0].sheets.at(-1).id === restored.activeSheetId)
}

// 17. keeping a copy on disk
await seedWith(seed)
{
  const panelText = () => page.$eval('.panel', (e) => e.textContent)
  await togglePanel('settings', 'Settings')
  await page.waitForSelector('.panel')
  await page.click('button:has-text("Keep a copy on disk")')
  await page.waitForTimeout(700)
  check('the file is connected', /Saving to verify/.test(await panelText()),
    (await panelText()).match(/Saving to \S+/)?.[0] ?? 'not saving')

  await togglePanel('settings', 'Settings')
  await page.click('.cm-content')
  await page.keyboard.type('\nfrom_the_test = 5 mm')
  await page.waitForTimeout(1600)
  const written = await page.evaluate(() => window.__readDisk())
  check('an edit reaches the file', written.includes('from_the_test'), `${written.length} bytes`)

  await page.reload()
  await page.waitForSelector('.sheet-page')
  await page.waitForTimeout(900)
  await togglePanel('settings', 'Settings')
  await page.waitForSelector('.panel')
  check('the file is still connected after a reload', /Saving to verify/.test(await panelText()))

  // a write that fails asks to reconnect rather than pretending to save
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const handle = await root.getFileHandle('verify.longhand.json', { create: true })
    const proto = Object.getPrototypeOf(handle)
    window.__realWrite = proto.createWritable
    proto.createWritable = async () => {
      throw new Error('permission withdrawn')
    }
  })
  await togglePanel('settings', 'Settings')
  await page.click('.cm-content')
  await page.keyboard.type('\nagain = 1')
  await page.waitForTimeout(1700)
  await togglePanel('settings', 'Settings')
  await page.waitForSelector('.panel')
  check('a failed write asks to reconnect', /Reconnect verify/.test(await panelText()),
    (await panelText()).match(/Reconnect \S+/)?.[0] ?? 'no reconnect')

  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory()
    const handle = await root.getFileHandle('verify.longhand.json', { create: true })
    Object.getPrototypeOf(handle).createWritable = window.__realWrite
  })
  await page.click('button:has-text("Reconnect")')
  await page.waitForTimeout(1300)
  check('and reconnecting resumes it', /Saving to verify/.test(await panelText()))
  await page.click('button:has-text("Stop saving to the file")')
  await page.waitForTimeout(300)
  check('stopping goes back to this browser only',
    /stored in this browser only/.test(await panelText()))
  await togglePanel('settings', 'Settings')
}

// 18. real page numbers
{
  const long = ['# Beam check', 'b = 300 mm', 'h = 500 mm', 'M = 250 kN*m']
  for (let i = 0; i < 40; i += 1) long.push(`W_${i} = b*h^2/${i + 6}`)
  await seedWith({
    ...seed,
    projects: [
      {
        ...seed.projects[0],
        sheets: [
          { id: 'a', name: 'Beam check', source: long.join('\n') },
          { id: 'b', name: 'Slab', source: '# Slab check\nt = 200 mm\n' },
        ],
      },
    ],
    activeSheetId: 'a',
  })
  await page.click('button:has-text("Project")')
  await page.waitForSelector('.panel')
  await page.click('button:has-text("Preview whole project")')
  await page.waitForTimeout(400)
  await page.click('button:has-text("Number the pages")')
  await page.waitForFunction(() => document.querySelectorAll('.pagedjs_page').length > 0, null,
    { timeout: 20000 })
  await page.waitForTimeout(1200)
  const pages = await page.$$eval('.pagedjs_page', (els) => els.length)
  check('the document is cut into pages', pages >= 2, `${pages} pages`)

  const numbering = await page.$$eval('.pagedjs_page', (els) =>
    els.map((element) => {
      const foot = element.querySelector('.pagedjs_margin-bottom-right .pagedjs_margin-content')
      const head = element.querySelector('.pagedjs_margin-top-left .pagedjs_margin-content')
      return {
        foot: foot ? getComputedStyle(foot, '::after').content : '',
        head: head ? getComputedStyle(head, '::after').content : '',
      }
    }))
  check('every page is numbered out of the total',
    numbering.every((n) => n.foot.includes('counter(page)') && n.foot.includes('counter(pages)')),
    JSON.stringify(numbering[0]))
  check('each page carries its sheet title',
    numbering.some((n) => n.head.includes('Beam check')) &&
      numbering.some((n) => n.head.includes('Slab check')),
    JSON.stringify([...new Set(numbering.map((n) => n.head))]))

  const hidden = await page.$eval('.output-pane', (e) => {
    const unpaginated = e.querySelector(':scope > .sheet-page')
    return unpaginated ? getComputedStyle(unpaginated).display : 'none'
  })
  check('the unpaginated copy is out of the way', hidden === 'none', hidden)

  await page.click('button:has-text("Back to one long page")')
  await page.waitForTimeout(300)
  check('and it comes back', (await page.$$('.pagedjs_page')).length === 0)
  await page.click('button:has-text("Close")')
}

// 19. the landing page
{
  const landing = await openPage({ viewport: { width: 1400, height: 900 } })
  const problems = []
  landing.on('pageerror', (error) => problems.push(String(error)))
  const responses = new Map()
  landing.on('response', (response) => responses.set(new URL(response.url()).pathname, response.status()))

  await landing.goto('http://localhost:4173/')
  await landing.waitForSelector('.hero h1')

  check('the landing page is the front door', !(await landing.$('.app')),
    (await landing.$eval('h1', (e) => e.textContent)).slice(0, 48))
  check('it says what the thing is', /calculation sheet/i.test(await landing.$eval('h1', (e) => e.textContent)))

  const images = await landing.$$eval('img', (els) =>
    els.map((image) => ({ src: new URL(image.src).pathname, loaded: image.naturalWidth > 0 })))
  check('every screenshot loads', images.length > 0 && images.every((image) => image.loaded),
    JSON.stringify(images))

  const links = await landing.$$eval('a[href]', (els) => els.map((a) => a.getAttribute('href')))
  check('it links to the app, the help page and an example',
    links.includes('/app') && links.includes('/docs') &&
      links.some((href) => href.startsWith('/app?example=')),
    JSON.stringify([...new Set(links)].slice(0, 8)))

  // the mark, in the header and as the icon the browser asks for
  {
    const lockup = await landing.$eval('.top .wordmark svg', (e) => ({
      label: e.getAttribute('aria-label'),
      stroke: getComputedStyle(e).stroke,
      width: Math.round(e.getBoundingClientRect().width),
    }))
    check('landing: the mark sits beside the wordmark',
      lockup.label === 'Longhand' && lockup.width >= 14, JSON.stringify(lockup))

    for (const [path, type] of [['/favicon.svg', 'image/svg+xml'], ['/apple-touch-icon.png', 'image/png']]) {
      const response = await landing.request.get(`http://localhost:4173${path}`)
      check(`landing: ${path} is served`,
        response.status() === 200 && (response.headers()['content-type'] ?? '').includes(type.split('/')[1]),
        `${response.status()} ${response.headers()['content-type']}`)
    }

    const declared = await landing.$$eval('link[rel]', (els) =>
      els.map((e) => `${e.getAttribute('rel')}:${e.getAttribute('href')}`))
    check('landing: both icons are declared',
      declared.includes('icon:/favicon.svg') && declared.includes('apple-touch-icon:/apple-touch-icon.png'),
      JSON.stringify(declared))
  }

  const comparison = await landing.$$eval('.compare tbody tr th', (els) => els.map((e) => e.textContent))
  check('the comparison names the alternatives', comparison.length >= 4, JSON.stringify(comparison))

  // Two on the landing page, the rest one click away: a row of four cards was
  // more of the page spent on examples than the examples were worth.
  const cards = await landing.$$('.card')
  check('two worked examples are shown', cards.length === 2, `${cards.length} cards`)
  check('and the rest are one click away',
    (await landing.$('a[href="/docs#examples"]')) !== null)

  const sample = await landing.$('a[href="/sample-package.pdf"]')
  check('the sample PDF is offered', !!sample)
  const pdf = await landing.request.get('http://localhost:4173/sample-package.pdf')
  check('and it is really there', pdf.status() === 200 && (await pdf.body()).length > 20000,
    `${pdf.status()}, ${(await pdf.body()).length} bytes`)

  // the header is pinned, and the filled button in it is readable
  {
    const barTop = () => landing.$eval('.top', (e) => Math.round(e.getBoundingClientRect().top))
    const before = await barTop()
    await landing.evaluate(() => window.scrollTo(0, 2200))
    await landing.waitForTimeout(350)
    check('landing: the top bar stays at the top', before === 0 && (await barTop()) === 0,
      `${before} -> ${await barTop()}`)
    check('landing: and nothing scrolls over it',
      await landing.$eval('.top nav a.cta', (e) => {
        const box = e.getBoundingClientRect()
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        return hit?.closest('a.cta') !== null
      }))
    await landing.evaluate(() => window.scrollTo(0, 0))

    const contrast = await landing.$eval('.top nav a.cta', (element) => {
      const parse = (value) => value.match(/[\d.]+/g).slice(0, 3).map(Number)
      const luminance = ([r, g, b]) => {
        const channel = (c) => {
          c /= 255
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
      }
      const style = getComputedStyle(element)
      const text = luminance(parse(style.color))
      const behind = luminance(parse(style.backgroundColor))
      return Math.round(((Math.max(text, behind) + 0.05) / (Math.min(text, behind) + 0.05)) * 10) / 10
    })
    check('landing: "Open the app" is readable on its button', contrast >= 4.5, `${contrast}:1`)
  }

  const overflow = await landing.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check('landing: no horizontal overflow', overflow === 0, `${overflow}px`)

  await landing.setViewportSize({ width: 390, height: 780 })
  await landing.waitForTimeout(300)
  const phoneOverflow = await landing.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check('landing on a phone: no horizontal overflow', phoneOverflow === 0, `${phoneOverflow}px`)
  check('the landing page threw nothing', problems.length === 0, problems.join(' | '))
  await landing.screenshot({ path: 'verify-landing.png', fullPage: true })
  await landing.close()
}

// 20. the help page
{
  const docs = await openPage({ viewport: { width: 1400, height: 900 } })
  const problems = []
  docs.on('pageerror', (error) => problems.push(String(error)))
  await docs.goto('http://localhost:4173/docs')
  await docs.waitForSelector('.docs-main')

  // The header is the shared one, so it has to be the same lockup as the
  // landing page's — same mark size, same wordmark, same filled button.
  check('help: the header is the shared one',
    (await docs.$eval('.top .wordmark svg', (e) => e.getAttribute('aria-label'))) === 'Longhand')
  check('help: with the same call to action',
    (await docs.$eval('.top nav a.cta', (e) => e.getAttribute('href'))) === '/app')
  check('help: the page is called Help',
    (await docs.$eval('.intro h1', (e) => e.textContent)) === 'Help')
  check('help: and says where to ask',
    (await docs.$$('#ask .ask-list li')).length >= 3)

  const entries = await docs.$$('.entry')
  check('help lists every command', entries.length >= 25, `${entries.length} entries`)

  const sections = await docs.$$eval('.section h2', (els) => els.map((e) => e.textContent))
  check('and groups them', sections.length >= 6, JSON.stringify(sections))

  // search
  await docs.fill('.search', 'goal seek')
  await docs.waitForTimeout(250)
  const found = await docs.$$eval('.entry h3 code', (els) => els.map((e) => e.textContent))
  check('searching by another name for it finds solve',
    found.some((code) => code.includes('solve')), JSON.stringify(found))

  await docs.fill('.search', 'zzzz')
  await docs.waitForTimeout(250)
  check('an empty search says so', !!(await docs.$('.nothing')))

  await docs.fill('.search', '')
  await docs.waitForTimeout(250)
  check('clearing it brings everything back',
    (await docs.$$('.entry')).length === entries.length)

  // "/" focuses the box, Escape leaves it
  await docs.click('.docs-main')
  await docs.keyboard.press('/')
  await docs.waitForTimeout(150)
  check('/ jumps to the search box',
    await docs.evaluate(() => document.activeElement?.className.includes('search')))
  await docs.keyboard.type('interp')
  await docs.keyboard.press('Escape')
  await docs.waitForTimeout(200)
  check('Escape clears it', (await docs.$eval('.search', (e) => e.value)) === '')

  // anchors and links
  const anchors = await docs.$$eval('.entry[id]', (els) => els.map((e) => e.id))
  check('every entry can be linked to', anchors.includes('solve') && anchors.includes('interp'),
    `${anchors.length} anchors`)
  const examples = await docs.$$eval('a[href^="/app?example="]', (els) => els.length)
  check('help offers the worked examples', examples >= 4, `${examples} links`)

  // the frame is pinned: only the text column scrolls
  {
    const pageScrolls = await docs.evaluate(() =>
      document.documentElement.scrollHeight > document.documentElement.clientHeight + 1)
    check('docs: the page itself does not scroll', !pageScrolls)

    const top = (selector) => docs.$eval(selector, (e) => Math.round(e.getBoundingClientRect().top))
    const before = [await top('.top'), await top('.docs-nav'), await top('.search')]
    const scrolled = await docs.evaluate(() => {
      const main = document.querySelector('.docs-main')
      main.scrollTop = 1400
      return main.scrollTop
    })
    await docs.waitForTimeout(350)
    const after = [await top('.top'), await top('.docs-nav'), await top('.search')]
    check('docs: the text column scrolls', scrolled > 1000, `scrollTop ${scrolled}`)
    check('docs: header, index and search stay put', JSON.stringify(before) === JSON.stringify(after),
      `${JSON.stringify(before)} -> ${JSON.stringify(after)}`)

    await docs.click('.docs-nav a:has-text("Where your work is kept")')
    await docs.waitForTimeout(450)
    const landed = await docs.evaluate(() => {
      const main = document.querySelector('.docs-main')
      const section = document.querySelector('#storage')
      return {
        offset: Math.round(section.getBoundingClientRect().top - main.getBoundingClientRect().top),
        pageScrolled: window.scrollY,
      }
    })
    check('docs: the index scrolls the text, not the page',
      Math.abs(landed.offset) < 30 && landed.pageScrolled === 0, JSON.stringify(landed))
    const marked = await docs.$$eval('.docs-nav a.current', (els) => els.map((e) => e.textContent))
    check('docs: the index says where you are', marked.length === 1 &&
      marked[0] === 'Where your work is kept', JSON.stringify(marked))

    const lines = await docs.evaluate(() => ({
      header: getComputedStyle(document.querySelector('.top')).borderBottomWidth,
      divider: getComputedStyle(document.querySelector('.docs-nav')).borderRightWidth,
    }))
    check('docs: two hairlines mark the frame',
      lines.header === '1px' && lines.divider === '1px', JSON.stringify(lines))
  }

  const overflow = await docs.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check('docs: no horizontal overflow', overflow === 0, `${overflow}px`)
  await docs.setViewportSize({ width: 390, height: 780 })
  await docs.waitForTimeout(400)
  const phone = await docs.evaluate(() => {
    const main = document.querySelector('.docs-main')
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      pageScrolls: document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
      mainScrolls: main.scrollHeight > main.clientHeight + 1,
    }
  })
  check('docs on a phone: no horizontal overflow', phone.overflow === 0, `${phone.overflow}px`)
  check('docs on a phone: one ordinary scrolling document',
    phone.pageScrolls && !phone.mainScrolls, JSON.stringify(phone))
  check('help threw nothing', problems.length === 0, problems.join(' | '))
  await docs.screenshot({ path: 'verify-docs.png' })
  await docs.close()
}

// 21. an example opens in the app, once
{
  const opened = await openPage({ viewport: { width: 1400, height: 900 } })
  await opened.goto('http://localhost:4173/app?example=pump')
  await opened.waitForSelector('.sheet-page')
  await opened.waitForTimeout(600)

  const state = async () =>
    opened.evaluate(() => JSON.parse(localStorage.getItem('longhand:store')))
  const first = await state()
  const sheets = first.projects.flatMap((project) => project.sheets)
  check('the example arrives as a sheet', sheets.some((sheet) => sheet.name.includes('Pump')),
    JSON.stringify(sheets.map((sheet) => sheet.name)))
  check('and the address no longer says so',
    !(await opened.evaluate(() => window.location.search)))

  const text = (await opened.$eval('.output-pane', (e) => e.textContent)).replace(/\s+/g, ' ')
  check('it evaluates: Colebrook solved, head about 9.1 m',
    /0\.019/.test(text) && /9\.1/.test(text), text.slice(-70))
  check('with no errors', (await opened.$$('.error')).length === 0)

  await opened.reload()
  await opened.waitForTimeout(600)
  const after = await state()
  check('reloading does not add it again',
    after.projects.flatMap((project) => project.sheets).length === sheets.length,
    `${after.projects.flatMap((project) => project.sheets).length} sheets`)
  await opened.close()
}

// 22. the Help button leaves for the reference
{
  const app = await openPage({ viewport: { width: 1400, height: 900 } })
  await app.goto('http://localhost:4173/app')
  await app.waitForSelector('.sheet-page')
  check('app: the mark is in the sidebar',
    (await app.$eval('.brand svg', (e) => e.getAttribute('aria-label'))) === 'Longhand')

  await app.click('.toolbar-menu > button')
  await app.waitForSelector('.menu')
  const help = await app.$('.menu a')
  check('Help is a link to the reference',
    (await help?.getAttribute('href')) === '/docs' &&
      /Help/.test((await help?.textContent()) ?? ''))
  await app.close()
}

// 23. nothing clipped or overflowing, in either theme and at phone width
for (const [theme, width, height, tag] of [
  ['light', 1400, 900, 'light'],
  ['dark', 1400, 900, 'dark'],
  ['light', 390, 780, 'phone'],
]) {
  const view = await openPage({ viewport: { width, height }, colorScheme: theme })
  await view.addInitScript((s) => localStorage.setItem('longhand:store', JSON.stringify(s)),
    { ...seed, settings: { ...seed.settings, theme } })
  await view.goto('http://localhost:4173/app')
  await view.waitForSelector('.sheet-page')
  await view.waitForTimeout(400)
  const overflow = await view.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  const clipped = await view.$$eval('button, .toolbar input', (els) =>
    els.filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent || e.value))
  check(`${tag}: no horizontal overflow`, overflow === 0, `${overflow}px`)
  check(`${tag}: nothing clipped`, clipped.length === 0, JSON.stringify(clipped))
  await view.screenshot({ path: `verify-${tag}.png` })
  await view.close()
}

// 24. the checks summary sits above the working and jumps to the line
{
  await seedWith(seed)
  const summary = await page.$('.checks-summary')
  check('checks: a summary is on the sheet', summary !== null)

  const rows = await page.$$eval('.checks-summary li', (items) =>
    items.map((item) => ({
      label: item.querySelector('.what')?.textContent?.trim(),
      badge: item.querySelector('.badge')?.textContent?.trim(),
      margin: item.querySelector('.margin')?.textContent?.trim(),
    })))
  check('checks: it lists the line the engineer wrote',
    rows.some((row) => row.label?.startsWith('sigma <= f_ck')), JSON.stringify(rows))
  check('checks: with a verdict and a margin',
    rows[0]?.badge === 'OK' && /% spare/.test(rows[0]?.margin ?? ''), JSON.stringify(rows[0]))

  const above = await page.evaluate(() => {
    const box = document.querySelector('.checks-summary')?.getBoundingClientRect().top ?? 0
    const first = document.querySelector('.calc-block')?.getBoundingClientRect().top ?? 0
    return first - box
  })
  check('checks: it comes before the working', above > 0, `${Math.round(above)}px`)

  await page.click('.checks-summary .what a')
  await page.waitForTimeout(700)
  check('checks: clicking a row flashes the check it came from',
    (await page.$$('.check')).length > 0)

  const verdict = await page.$('.sheet-verdict')
  check('checks: the editor shows the verdict too',
    (await verdict?.textContent()) === 'All OK')
}

// 25. a failing check is visible as a failure, not just quieter
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Fail', source: '# Fail\na = 40 MPa\nf = 30 MPa\na <= f\n' },
  ] }], activeSheetId: 's1' })
  const failing = await page.$('.checks-summary.has-failure')
  check('checks: a failing sheet says so at the top', failing !== null)
  check('checks: and in the editor',
    (await page.$eval('.sheet-verdict', (e) => e.textContent)) === '1 NOT OK')
}

// 26. share: the sheet goes into the hash and comes back read-only
{
  await seedWith(seed)
  await page.click('button:has-text("Share")')
  await page.click('button:has-text("Copy a link")')
  await page.waitForSelector('.link-box')
  const url = await page.$eval('.link-box', (e) => e.value)
  sharedLink = url
  check('share: the link points at the app', url.includes('/app#s='), url.slice(0, 60))
  check('share: nothing is in the query string', !url.includes('?'), url.slice(0, 80))
  check('share: it is short enough to send', url.length < 4000, `${url.length} characters`)

  const reader = await openPage({ viewport: { width: 1400, height: 900 } })
  const requests = []
  reader.on('request', (request) => requests.push(request.url()))
  await reader.goto(url)
  await reader.waitForSelector('.shared-bar')
  const shown = (await reader.$eval('.output-pane', (e) => e.textContent)).replace(/\s+/g, ' ')
  check('share: the reader gets the calculation', /MPa/.test(shown) && /OK/.test(shown))
  check('share: read-only, with a way to take a copy',
    (await reader.$('button:has-text("Make a copy")')) !== null)

  // The whole point of using the hash: the sheet must not reach any server.
  const leaked = requests.filter((request) => request.includes('s=') && request.includes('#'))
  check('share: the sheet never leaves the browser', leaked.length === 0, JSON.stringify(leaked))

  await reader.click('button:has-text("Make a copy")')
  await reader.waitForSelector('.toolbar')
  check('share: making a copy clears the link from the address',
    !(await reader.evaluate(() => window.location.hash)))
  await reader.close()
}

// 27. history: a saved revision diffs against the sheet as it stands
{
  await seedWith(seed)
  await togglePanel('history', 'History and revisions')
  await page.click('button:has-text("Save a revision now")')
  await page.waitForSelector('.revisions li')

  await page.click('.cm-content')
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\nnew_line = 1 mm\n')
  await page.waitForTimeout(400)

  await page.click('.revision-head')
  await page.waitForSelector('.diff')
  const added = await page.$$eval('.diff .row.added', (rows) => rows.map((r) => r.textContent))
  check('history: the diff shows what was added',
    added.some((row) => row.includes('new_line')), JSON.stringify(added))

  await page.click('button:has-text("Put this version back")')
  await page.waitForTimeout(400)
  const source = await page.$eval('.cm-content', (e) => e.textContent)
  check('history: restoring puts the old version back', !source.includes('new_line'))
  const kept = await page.$$eval('.revisions li', (items) => items.length)
  check('history: and keeps the newer one as its own revision', kept >= 2, `${kept} revisions`)
}

// 28. recalculating from scratch agrees with the cached run
{
  await seedWith(seed)
  await togglePanel('settings', 'Settings')
  await page.click('button:has-text("Recalculate from scratch")')
  await page.waitForTimeout(400)
  const said = await page.$eval('.panel', (e) => e.textContent)
  check('trust: a cold run matches the cached one', /identical to the cached run/.test(said),
    said.slice(0, 160))
  check('trust: the build is named in Settings', /Longhand build/.test(said))
}

// 29. the printed sheet says what produced it and what it does not claim
{
  await seedWith(seed)
  const foot = await page.$eval('.sheet-foot', (e) => e.textContent)
  check('print: the footer carries the disclaimer', /calculation aid/.test(foot))
  check('print: and the build stamp', /Longhand build/.test(foot))
  const hidden = await page.$eval('.sheet-foot', (e) => getComputedStyle(e).display)
  check('print: it stays off the screen', hidden === 'none', hidden)
}

// 30. the verification page runs the suite in the browser
{
  const verification = await openPage({ viewport: { width: 1400, height: 900 } })
  verification.on('pageerror', (e) => bad.push('VERIFICATION PAGE ERROR: ' + e.message))
  await verification.goto('http://localhost:4173/verification')
  await verification.waitForSelector('.scoreboard')
  const score = await verification.$eval('.scoreboard', (e) => e.textContent)
  check('verification: every case passes in the browser',
    /^(\d+) of \1 cases pass/.test(score.trim()) && !score.includes('0 of'), score.slice(0, 80))
  check('verification: the scoreboard is not a failure', 
    (await verification.$('.scoreboard.fail')) === null)
  const failures = await verification.$$('.case-list li.not-ok')
  check('verification: no case is marked FAIL', failures.length === 0, `${failures.length} failing`)

  await verification.click('.case-head')
  await verification.waitForSelector('.case-sheet pre')
  check('verification: a case shows its sheet',
    (await verification.$eval('.case-sheet pre', (e) => e.textContent)).length > 40)
  check('verification: and the checks it ran',
    (await verification.$$('.case-results li')).length > 0)
  await verification.screenshot({ path: 'verify-verification.png' })
  await verification.close()
}

// 31. the privacy page exists and is linked from everywhere it should be
{
  const privacy = await openPage({ viewport: { width: 1400, height: 900 } })
  privacy.on('pageerror', (e) => bad.push('PRIVACY PAGE ERROR: ' + e.message))
  await privacy.goto('http://localhost:4173/privacy')
  await privacy.waitForSelector('.privacy')
  const words = (await privacy.$eval('.honest', (e) => e.textContent)).replace(/\s+/g, ' ')
  check('privacy: it says where calculations live', /browser's own storage/.test(words))
  check('privacy: it is honest about share links',
    /anyone who has it can read the calculation/.test(words))
  check('privacy: it names the licence', /MIT licence/.test(words))
  check('privacy: it states what Longhand is not', /calculation aid/.test(words))

  for (const [page_, where] of [['/', 'landing'], ['/docs', 'reference'], ['/verification', 'verification']]) {
    const other = await openPage()
    await other.goto('http://localhost:4173' + page_)
    await other.waitForTimeout(200)
    const links = await other.$$eval('a', (as) => as.map((a) => a.getAttribute('href')))
    check(`${where} links to the privacy note`, links.includes('/privacy'))
    check(`${where} links to the verification suite`,
      page_ === '/verification' || links.includes('/verification'))

    // Verification and Privacy belong in the footer and in the sections that
    // earn them, not in the bar at the top of every page.
    const top = await other.$$eval('.top nav a', (as) => as.map((a) => a.getAttribute('href')))
    check(`${where}: the top bar stays short`,
      !top.includes('/verification') && !top.includes('/privacy'), JSON.stringify(top))
    await other.close()
  }
  await privacy.close()
}

// 32. the counting script is there, and it never sees a calculation
{
  const clean = await openPage({ viewport: { width: 1400, height: 900 } })
  const outgoing = []
  clean.on('request', (request) => {
    const url = request.url()
    if (url.startsWith('http://localhost:4173') || url.startsWith('data:')) return
    outgoing.push({ url, body: request.postData() ?? '' })
  })

  // Make a share link, then open it, which is the one page whose address
  // contains a whole sheet.
  await clean.goto('http://localhost:4173/app')
  await clean.waitForSelector('.sheet-page')
  await clean.click('button:has-text("Share")')
  await clean.click('button:has-text("Copy a link")')
  await clean.waitForSelector('.link-box')
  const link = await clean.$eval('.link-box', (e) => e.value)
  const fragment = link.slice(link.indexOf('#s=') + 3)

  await clean.goto(link)
  await clean.waitForSelector('.shared-bar')
  await clean.waitForTimeout(1200)

  const hosts = [...new Set(outgoing.map((request) => new URL(request.url).host))]
  check('the only third party on the page is the counter',
    hosts.every((host) => host === 'plausible.io'), JSON.stringify(hosts))
  check('the counter is actually requested', hosts.includes('plausible.io'),
    JSON.stringify(hosts))

  // The whole reason autoCapturePageviews is off: the default script reports
  // location.href, and here location.href is a calculation.
  const sample = fragment.slice(0, 24)
  const leaked = outgoing.filter(
    (request) => request.url.includes(sample) || request.body.includes(sample),
  )
  check('no request carries the shared sheet', leaked.length === 0,
    JSON.stringify(leaked.map((request) => request.url.slice(0, 120))))

  const hashed = outgoing.filter(
    (request) => request.url.includes('%23') || request.body.includes('#'),
  )
  check('no request carries a fragment at all', hashed.length === 0,
    JSON.stringify(hashed.map((request) => request.url.slice(0, 120))))
  await clean.close()
}

// 33. auto-capture stays off, on every page
{
  for (const path of ['/', '/app', '/docs', '/verification', '/privacy']) {
    const html = await (await fetch('http://localhost:4173' + path)).text()
    check(`${path}: the counting script is loaded`,
      html.includes('plausible.io/js/'), path)
    check(`${path}: with automatic page capture off`,
      /autoCapturePageviews:\s*false/.test(html), path)
  }
}

// 34. the new maths, in the app rather than in a unit test
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Maths', source: [
      '# Maths',
      'import "Constants"',
      'unit kgf = 9.80665 N',
      'F = 100 kgf -> N',
      'b = 300 mm +- 2 mm',
      'h = 500 mm +- 10 mm',
      'W = b*h^2/6',
      'M_Ed = 250 kN*m',
      'sigma = M_Ed/W -> MPa   // clause 6.2  ?? is 250 the right load case',
      'f_y = 355 MPa',
      'sigma <= f_y',
      '// The stress is @sigma',
      'page break',
      'w_load = 12 kg*g_n -> N',
    ].join('\n') },
  ] }], activeSheetId: 's1' })

  const text = (await page.$eval('.output-pane', (e) => e.textContent)).replace(/\s+/g, ' ')
  check('maths: a unit the sheet defined is used', /980\.7 N/.test(text), text.slice(0, 90))
  check('maths: the constants sheet is importable', /117\.7 N|117\.6/.test(text),
    text.slice(-90))
  check('maths: no errors anywhere', (await page.$$('.error')).length === 0)

  const query = await page.$('.query')
  check('a reviewer query prints beside the line',
    query !== null && /right load case/.test(await query.textContent()))
  check('and is kept apart from the note',
    /clause 6\.2/.test(await page.$eval('.line-note', (e) => e.textContent)))

  const equations = await page.$$eval('.equation', (els) => els.map((e) => e.textContent))
  check('every defining line is numbered', equations.length >= 6, JSON.stringify(equations.slice(0, 4)))
  check('and a reference resolves to the number',
    /The stress is eq\. \d+/.test(text), text.match(/The stress is[^.]*\./)?.[0] ?? '')

  check('a page break is in the document', (await page.$$('.page-break')).length === 1)

  // Uncertainty shares now name the measurements rather than the step between.
  const shares = await page.$$eval('.tolerance .shares', (els) => els.map((e) => e.textContent))
  const onSigma = shares.find((share) => /b |h /.test(share)) ?? ''
  check('uncertainty names the measurements, not the middle step',
    onSigma.includes('h') && !onSigma.includes('W'), JSON.stringify(shares))
}

// 35. the symbols panel
{
  await togglePanel('symbols', 'Symbols and export')
  await page.waitForSelector('.symbols')
  const names = await page.$$eval('.symbols code', (els) => els.map((e) => e.textContent))
  check('symbols: every name the sheet defines', names.includes('W') && names.includes('sigma'),
    JSON.stringify(names))

  await page.click('.symbols li:has(code:text-is("b")) .symbol-head')
  await page.waitForSelector('.symbol-body')
  const traced = (await page.$eval('.symbol-body', (e) => e.textContent)).replace(/\s+/g, ' ')
  check('symbols: it says what a change would redo', /W/.test(traced) && /sigma/.test(traced),
    traced.slice(0, 120))
  await togglePanel('symbols', 'Symbols and export')
}

// 36. a draft says so on paper and nowhere else
{
  const mark = await page.$('.watermark')
  check('draft: the watermark is in the document', mark !== null)
  check('draft: and stays off the screen',
    (await page.$eval('.watermark', (e) => getComputedStyle(e).display)) === 'none')
  check('draft: the page is marked as one',
    (await page.$$('.sheet-page.draft')).length > 0)

  await page.click('button:has-text("Project")')
  await page.waitForSelector('.panel')
  await page.selectOption('.panel select[aria-label="Project status"]', 'issued')
  await page.waitForTimeout(300)
  check('issued: the watermark goes', (await page.$('.watermark')) === null)

  await page.fill('.panel input[placeholder="Your firm, job number"]', 'Nilsson Engineering')
  await page.waitForTimeout(300)
  check('the footer carries the firm line',
    /Nilsson Engineering/.test(await page.$eval('.sheet-foot', (e) => e.textContent)))
  await page.click('button:has-text("Project")')
}

// 37. the temperature that used to be a silent wrong answer
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Wall', source: 'U = 0.17 W/(m^2*K)\ndT = 22 degC\nq = U*dT\n' },
  ] }], activeSheetId: 's1' })
  const message = await page.$eval('.error .error-message', (e) => e.textContent)
  check('an absolute temperature is refused, not quietly used',
    /not a difference/.test(message), message.slice(0, 80))
  check('and the message says what to write instead', /22 K/.test(message))
}

// 38. the palette: every construct one keystroke from an empty line
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Palette', source: '# Palette\nb = 300 mm\n\n' },
  ] }], activeSheetId: 's1' })

  await page.click('.cm-content')
  await page.keyboard.press('Control+End')
  await page.keyboard.type('/')
  await page.waitForSelector('.cm-tooltip-autocomplete')
  const offered = await page.$$eval('.cm-tooltip-autocomplete li', (els) =>
    els.map((e) => e.textContent))
  check('the palette opens on a slash', offered.length > 5, JSON.stringify(offered.slice(0, 4)))
  check('and it is the language, not the variables in this sheet',
    offered.some((t) => /check/.test(t)) && offered.some((t) => /table/.test(t)),
    JSON.stringify(offered.slice(0, 6)))

  await page.keyboard.type('tolerance')
  await page.waitForTimeout(200)
  const narrowed = await page.$$eval('.cm-tooltip-autocomplete li', (els) =>
    els.map((e) => e.textContent))
  check('typing narrows it to one thing', narrowed.length <= 3 && /tolerance/.test(narrowed[0] ?? ''),
    JSON.stringify(narrowed))

  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  const source = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('longhand:store')).projects[0].sheets[0].source)
  const inserted = source.split('\n').pop()
  check('choosing one inserts the line, slash and all gone',
    inserted.includes('+-') && !inserted.includes('/tolerance'), JSON.stringify(inserted))
  // The whole line, not a skeleton with the numbers missing: an insert that
  // leaves "b =  mm" behind is worse than no palette, because it looks done.
  check('and every field it offers arrives filled in',
    /\S\s*=\s*\S+\s*\w+\s*\+-\s*\S+/.test(inserted) && !/=\s{2,}\w/.test(inserted),
    JSON.stringify(inserted))

  // and a slash inside a formula is still division
  await page.keyboard.press('Escape')
  await page.click('.cm-content')
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\nx = 10 mm/')
  await page.waitForTimeout(250)
  check('a slash in a formula is division, not a menu',
    (await page.$('.cm-tooltip-autocomplete')) === null)
}

// 39. the example project a first visit is given
{
  const first = await openPage({ viewport: { width: 1400, height: 900 } })
  first.setDefaultTimeout(45_000)
  await first.goto('http://localhost:4173/app')
  await first.waitForSelector('.sheet-page')
  await first.waitForTimeout(400)

  const named = await first.$eval('.sheet.current', (e) => e.textContent)
  const shown = await first.$eval('.sheet-page', (e) => e.textContent)
  check('a first visit opens the starter sheet, not a blank page',
    named === 'Start here' && /Longhand reads a sheet top to bottom/.test(shown), named)

  const sheets = await first.$$eval('.sheet:not(.add)', (els) => els.map((e) => e.textContent))
  check('and a project of examples behind it', sheets.length >= 5, JSON.stringify(sheets))

  const verdicts = await first.$$eval('.verdict', (els) => els.map((e) => e.textContent))
  check('the sheet it opens on passes its own check',
    verdicts.length > 0 && verdicts.every((t) => !/NOT OK/.test(t)), JSON.stringify(verdicts))

  // The examples are there to be read, not to be a wizard: adding a sheet is
  // still one click and still gives you an empty page.
  await first.click('.sheet.add')
  await first.waitForTimeout(400)
  check('a new sheet is added without asking anything', (await first.$('.templates')) === null)
  const added = await first.evaluate(() =>
    JSON.parse(localStorage.getItem('longhand:store')).projects[0].sheets.at(-1))
  check('and it is blank', added.source.trim() === '# New calculation', JSON.stringify(added.source))
  await first.close()
}

// 40. find and replace, and jumping to where a name was defined
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Nav', source: '# Nav\nb = 300 mm\nh = 500 mm\nf_yd = 235 MPa\nW = b*h^2/6\nsigma = 250 kN*m/W\n' },
  ] }], activeSheetId: 's1' })

  await page.click('.cm-content')
  await page.keyboard.press('Control+f')
  await page.waitForSelector('.cm-panel.cm-search')
  check('find and replace opens in the sheet', true)
  const replaceable = await page.$('.cm-panel.cm-search input[name="replace"]')
  check('and it can replace, not only find', replaceable !== null)
  await page.keyboard.press('Escape')

  await togglePanel('symbols', 'Symbols and export')
  await page.waitForSelector('.symbols')
  await page.click('.symbols li:has(code:text-is("sigma")) .symbol-head')
  await page.waitForSelector('.symbol-body')
  await page.click('.symbol-body button:has-text("Go to line")')
  await page.waitForTimeout(250)
  const atLine = await page.evaluate(() => {
    const active = document.querySelector('.cm-activeLine')
    return active ? active.textContent : ''
  })
  check('a symbol takes you to the line that defines it', /sigma/.test(atLine), JSON.stringify(atLine))

  await togglePanel('symbols', 'Symbols and export')
  await page.waitForTimeout(150)
  await togglePanel('symbols', 'Symbols and export')
  await page.waitForSelector('.symbols')
  await page.click('.symbols li:has(code:text-is("W")) .symbol-head')
  await page.waitForSelector('.symbol-body')
  await page.click('.symbol-body .symbol-link:text-is("b")')
  await page.waitForTimeout(250)
  const atDependency = await page.evaluate(() =>
    document.querySelector('.cm-activeLine')?.textContent ?? '')
  check('and a name in its dependency list does the same',
    /b = 300 mm/.test(atDependency), JSON.stringify(atDependency))
  await togglePanel('symbols', 'Symbols and export')
}

// 41. the command palette
{
  await seedWith(seed)
  await page.keyboard.press('Control+k')
  await page.waitForSelector('.commands')
  const offered = await page.$$eval('.command-label', (els) => els.map((e) => e.textContent))
  check('Cmd+K opens the app\'s own palette', offered.length > 8, JSON.stringify(offered.slice(0, 5)))
  check('and it can do the things the toolbar can',
    offered.some((t) => /Print this sheet/.test(t)) && offered.some((t) => /LaTeX/.test(t)),
    JSON.stringify(offered.slice(0, 12)))

  await page.keyboard.type('latex')
  await page.waitForTimeout(200)
  const narrowed = await page.$$eval('.command-label', (els) => els.map((e) => e.textContent))
  check('typing narrows it', narrowed.length === 1 && /LaTeX/.test(narrowed[0]), JSON.stringify(narrowed))

  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  check('and Escape closes it', (await page.$('.commands')) === null)

  // Switching sheets is the thing it will be used for most.
  await page.keyboard.press('Control+k')
  await page.waitForSelector('.commands')
  await page.keyboard.type('Tunnel')
  await page.waitForTimeout(200)
  const sheetRow = await page.$$eval('.command-group', (els) => els.map((e) => e.textContent))
  check('sheets and projects are commands too',
    sheetRow.some((t) => /Go to/.test(t)), JSON.stringify(sheetRow))
  await page.keyboard.press('Escape')
}

// 42. a signature that stops applying the moment the sheet changes
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Signed', source: '# Signed\nb = 300 mm\nh = 500 mm\nW = b*h^2/6\n' },
  ] }], activeSheetId: 's1' })

  await page.click('button:has-text("Project")')
  await page.waitForSelector('.panel')
  await page.fill('.panel input[aria-label="Sign as"]', 'A. Nilsson')
  await page.click('.panel button:has-text("Sign as checked")')
  await page.waitForTimeout(400)
  const signed = await page.$eval('.sheet-page .signature', (e) => e.textContent)
  check('a signed sheet says who checked it', /Checked by A. Nilsson/.test(signed), signed)
  check('and shows the fingerprint it was signed against', /signature [0-9a-f]{12}/.test(signed), signed)

  await page.click('button:has-text("Project")')
  await page.click('.cm-content')
  await page.keyboard.press('Control+End')
  await page.keyboard.type('\nx = 1 mm')
  await page.waitForTimeout(600)
  const stale = await page.$eval('.sheet-page .signature', (e) => e.textContent)
  check('and an edit makes the signature say it no longer applies',
    /no longer applies/.test(stale), stale)
  check('the warning is part of the document, not the chrome',
    (await page.$eval('.sheet-page .signature', (e) => getComputedStyle(e).display)) !== 'none')
}

// 43. export for somebody else's report
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Export me', source: '# Export me\nb = 300 mm\nh = 500 mm\nW = b*h^2/6\nsigma = 250 kN*m/W -> MPa\nsigma <= 235 MPa\n' },
  ] }], activeSheetId: 's1' })

  await togglePanel('symbols', 'Symbols and export')
  await page.waitForSelector('.panel')

  const latex = page.waitForEvent('download')
  await page.click('.panel button:has-text("Export as LaTeX")')
  const texFile = await latex
  const tex = await readDownload(texFile)
  check('LaTeX export is a document that compiles on its own',
    tex.includes('\\documentclass') && tex.includes('\\end{document}'), tex.slice(0, 40))
  check('and carries the formulas as formulas', /\\frac|\\begin\{equation\}/.test(tex))
  check('and the file is named after the sheet', /export-me\.tex$/.test(texFile.suggestedFilename()),
    texFile.suggestedFilename())

  const word = page.waitForEvent('download')
  await page.click('.panel button:has-text("Export for Word")')
  const docFile = await word
  const doc = await readDownload(docFile)
  check('Word export hands the maths over as maths, not a picture',
    doc.includes('<math') && !doc.includes('<img'), doc.slice(0, 60))
  check('and says it is a Word document', doc.includes('office:word'))
  await togglePanel('symbols', 'Symbols and export')
}

// 44. a spreadsheet export, dropped in
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Import', source: '# Import\n' },
  ] }], activeSheetId: 's1' })

  await page.setInputFiles('input[accept*=".csv"]', {
    name: 'sections.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('profile,h,A\nIPE200,200 mm,2850 mm^2\nIPE300,300 mm,5380 mm^2\n'),
  })
  await page.waitForTimeout(700)
  const source = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('longhand:store')).projects[0].sheets[0].source)
  check('a CSV becomes a table block in the sheet',
    source.includes('table sections') && source.includes('IPE300'), JSON.stringify(source.slice(0, 60)))
  const headers = await page.$$eval('.sheet-table th', (els) => els.map((e) => e.textContent))
  check('and it is a table the sheet actually computed',
    headers.join(',') === 'profile,h,A', JSON.stringify(headers))
}

// 45. a wide table turns the page instead of shrinking the type
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Wide', source: [
      '# Wide',
      'M = 250 kN*m',
      'table',
      '  case | bw     | hw     | Wt = bw*hw^2/6 | st = M/Wt | ok = st <= 235 MPa | note',
      '  A    | 300 mm | 500 mm |                |           |                    | first',
      'end',
      'table',
      '  case | bw',
      '  A    | 300 mm',
      'end',
    ].join('\n') },
  ] }], activeSheetId: 's1' })

  const classes = await page.$$eval('.table-scroll', (els) => els.map((e) => e.className))
  check('a table past six columns is marked for a landscape page',
    classes[0].includes('wide') && !classes[1].includes('wide'), JSON.stringify(classes))
}

// 46. a shared link on a phone opens the document, not the editor
{
  const phone = await openPage({ viewport: { width: 390, height: 844 } })
  phone.setDefaultTimeout(45_000)
  await phone.goto(sharedLink)
  await phone.waitForSelector('.sheet-page')
  await phone.waitForTimeout(400)

  check('the editor is out of the way', (await phone.$('.app.shared.reading')) !== null)
  check('and the document is what fills the screen',
    (await phone.$eval('.editor-pane', (e) => getComputedStyle(e).display)) === 'none')

  await phone.click('button:has-text("Show what was typed")')
  await phone.waitForTimeout(300)
  check('the source is one tap away for a reviewer who wants it',
    (await phone.$eval('.editor-pane', (e) => getComputedStyle(e).display)) !== 'none')
  await phone.close()
}

// 47. the app keeps a copy of itself
{
  const offline = await openPage({ viewport: { width: 1200, height: 800 } })
  offline.setDefaultTimeout(45_000)
  await offline.goto('http://localhost:4173/app')
  await offline.waitForSelector('.sheet-page')
  const registered = await offline.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    return Boolean(registration)
  })
  check('a service worker is registered, so the app can start without a network', registered)
  await offline.close()
}

// 48. the toolbar is one row again
{
  await seedWith(seed)
  const rows = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.toolbar button, .toolbar a')]
      .filter((element) => getComputedStyle(element).display !== 'none')
    return [...new Set(buttons.map((element) => Math.round(element.getBoundingClientRect().top)))]
  })
  // A pixel of rounding between a monospace chip and a sans-serif button is
  // not a second row; forty pixels is.
  check('the toolbar does not wrap onto a second row',
    Math.max(...rows) - Math.min(...rows) < 8, JSON.stringify(rows))

  const visible = await page.$$eval('.toolbar-actions > button, .toolbar-actions > .toolbar-menu > button',
    (els) => els.map((e) => e.textContent.trim()))
  check('and holds four controls, not eleven', visible.length <= 5, JSON.stringify(visible))

  await page.click('.toolbar-menu > button')
  await page.waitForSelector('.menu')
  const inMenu = await page.$$eval('.menu button, .menu a', (els) => els.map((e) => e.textContent.trim()))
  check('everything else is one click deeper', inMenu.length >= 7, JSON.stringify(inMenu))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  check('and the menu closes on Escape', (await page.$('.menu')) === null)
}

// 49. the verdict chip is the shortest way to the check it is talking about
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Verdict', source: '# Verdict\na = 40 MPa\nf = 30 MPa\n// filler\n// filler\na <= f\n' },
  ] }], activeSheetId: 's1' })
  await page.click('.sheet-verdict')
  await page.waitForTimeout(250)
  const atLine = await page.evaluate(() =>
    document.querySelector('.cm-activeLine')?.textContent ?? '')
  check('clicking the verdict goes to the check that failed', /a <= f/.test(atLine), JSON.stringify(atLine))
}

// 50. an empty sheet says what to do next
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Empty', source: '# Empty\n\n' },
  ] }], activeSheetId: 's1' })
  const hint = await page.$('.empty-hint')
  check('a blank sheet points at the palette rather than sitting there',
    hint !== null && /press/.test(await hint.textContent()))

  await page.click('.cm-content')
  await page.keyboard.press('Control+End')
  await page.keyboard.type('b = 300 mm')
  await page.waitForTimeout(600)
  check('and the hint goes the moment there is a calculation', (await page.$('.empty-hint')) === null)
}

// 51. a run of comment lines is one paragraph
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Prose', source: '# Prose\n// one line\n// and its continuation\nb = 300 mm\n// a separate note\n' },
  ] }], activeSheetId: 's1' })
  const paragraphs = await page.$$eval('.sheet-page .prose', (els) => els.map((e) => e.textContent))
  check('wrapped comment lines print as one paragraph',
    paragraphs.length === 2 && paragraphs[0] === 'one line and its continuation',
    JSON.stringify(paragraphs))
}

// 52. typing end closes a table, and every row says how close it came
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Rows', source: [
      '# Rows',
      'M_Ed = 250 kN*m',
      'f_ck = 30 MPa',
      'table',
      '  section | bw     | hw     | Wt = bw*hw^2/6 | st = M_Ed/Wt | ok = st <= f_ck',
      '  A       | 300 mm | 500 mm',
      '  B       | 250 mm | 450 mm',
      '  C       | 200 mm | 350 mm',
      '',
      '',
      '// below the table',
      'b_req = 200 mm',
    ].join('\n') },
  ] }], activeSheetId: 's1' })

  const before = await page.$$eval('.sheet-table tbody tr', (rows) => rows.length)
  const warned = await page.$('.table-warning')
  check('a table with no end says so, instead of only filling cells with errors',
    warned !== null && /end/.test(await warned.textContent()), `${before} rows`)

  // Type the end the way a person does: one letter at a time, on the empty
  // line under the last row. The header wraps in the editor, so arrowing down
  // counts screen lines rather than source lines; put the cursor there directly.
  // CodeMirror draws one .cm-line per source line however it wraps.
  await page.locator('.cm-line').nth(8).click()
  await page.keyboard.press('End')
  await page.keyboard.type('end', { delay: 60 })
  await page.waitForTimeout(700)

  const sections = await page.$$eval('.sheet-table tbody tr', (rows) =>
    rows.map((row) => row.children[0].textContent))
  check('typing the last letter of end closes the table there and then',
    JSON.stringify(sections) === '["A","B","C"]', JSON.stringify(sections))
  check('and the warning goes with it', (await page.$('.table-warning')) === null)

  const margins = await page.$$eval('.sheet-table .cell-margin', (els) => els.map((e) => e.textContent))
  check('every verdict in the table carries its margin',
    margins.length === 3 && margins[0] === '33.3% spare' && /over the limit/.test(margins[2]),
    JSON.stringify(margins))
}

// 53. mathematics written to be read: a system, a derivation, maths in a sentence
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Maths', source: [
      '# Övning 15.9',
      "math { y'' - y' - 2y = x ; y(0) = 2, y'(0) = 0 }",
      '// Den karakteristiska ekvationen $r^2 - r - 2 = 0$ har rötterna $r = 2$ och $r = -1$.',
      'align',
      '  r^2 - r - 2 = 0',
      '  <=> (r - 2)(r + 1) = 0',
      'end',
      'math lim(x -> 0, sin(x)/x) = 1',
    ].join('\n') },
  ] }], activeSheetId: 's1' })

  const blocks = await page.$$('.sheet-page .calc.math .katex')
  check('a math line is typeset, and so is an aligned block', blocks.length === 3, `${blocks.length}`)
  const brace = await page.$eval('.sheet-page .calc.math', (e) => e.innerHTML)
  check('the system gets its big brace', /delimsizing|mopen/.test(brace))
  const inline = await page.$$('.sheet-page .prose .inline-math .katex')
  check('maths in the middle of a sentence is typeset in the line', inline.length === 3, `${inline.length}`)
  const prose = await page.$eval('.sheet-page .prose', (e) => e.textContent)
  check('and the words around it stay words', /har rötterna/.test(prose) && !prose.includes('$'), prose.slice(0, 60))
  check('none of it is an error', (await page.$$('.sheet-page .error')).length === 0)
}

// 54. the help page shows what the maths comes out as
{
  const help = await openPage({ viewport: { width: 1200, height: 900 } })
  await help.goto('http://localhost:4173/docs#maths')
  await help.waitForSelector('#math-system')
  const previews = await help.$$('.math-preview .katex')
  check('Help typesets every maths example under its source', previews.length > 20, `${previews.length}`)
  await help.close()
}

// 55. a whole exercise: parts, a numbered equation, a solved ODE, a boxed answer
{
  await seedWith({ ...seed, projects: [{ ...seed.projects[0], sheets: [
    { id: 's1', name: 'Exercise', source: [
      '# Övning 15.9',
      "math #ode y'' - y' - 2y = x",
      'a) Lös @ode med $y(0) = 2$ och $y\'(0) = 0$.',
      'show diff(x^2*sin(x), x)',
      "y = ode y'' - y' - 2y = x, y(0) = 2, y'(0) = 0 for x from 0 to 3",
      'exact(x) = 3/4*exp(2*x) + exp(-x) - x/2 + 1/4',
      'abs(y(1) - exact(1)) <= 1e-6',
      'A = [1, 2; 3, 4]',
      'c = roots(1, 2, 5)',
      'svar y(x) = 3/4 e^(2x) + e^(-x) - x/2 + 1/4',
    ].join('\n') },
  ] }], activeSheetId: 's1' })

  const part = await page.$eval('.sheet-page .part', (e) => e.textContent)
  check('a part of an exercise prints with its letter and its reference resolved',
    /^a\)/.test(part) && part.includes('(1)'), part.slice(0, 40))
  check('a labelled equation is numbered in the margin',
    (await page.$$eval('.sheet-page .calc-block .equation', (els) => els.map((e) => e.textContent))).includes('(1)'))
  check('the answer is boxed', (await page.$$('.sheet-page .calc.math .boxpad, .sheet-page .calc.math .fbox')).length > 0)
  check('the solved ODE agrees with the hand solution',
    (await page.$$eval('.sheet-page .check .badge', (els) => els.map((e) => e.textContent))).every((t) => t === 'OK'))
  const text = await page.$eval('.sheet-page', (e) => e.textContent)
  check('a matrix prints as a matrix', !/rows ×/.test(text))
  check('nothing on the sheet is an error', (await page.$$('.sheet-page .error')).length === 0,
    JSON.stringify(await page.$$eval('.sheet-page .error', (els) => els.map((e) => e.textContent.slice(0, 80)))))

  // the live preview under the cursor
  await page.locator('.cm-line').nth(1).click()
  await page.keyboard.press('End')
  await page.waitForSelector('.cm-math-preview')
  check('the maths on the line being written is typeset under it',
    (await page.$$('.cm-math-preview .katex')).length === 1)
  await page.keyboard.type(' + (')
  await page.waitForTimeout(200)
  check('and a broken line says why, right there',
    (await page.$('.cm-math-preview.error')) !== null)
}

// 56. a phone: the document above, the source below, the sheets in a drawer
{
  const phone = await openPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  phone.setDefaultTimeout(45_000)
  await phone.goto('http://localhost:4173/app')
  await phone.waitForSelector('.sheet-page')
  await phone.waitForTimeout(500)

  const docBox = await phone.$eval('.output-pane', (e) => e.getBoundingClientRect().toJSON())
  const srcBox = await phone.$eval('.editor-pane', (e) => e.getBoundingClientRect().toJSON())
  check('phone: the document is on top and the source below it',
    docBox.top < srcBox.top && docBox.height > 250 && srcBox.height > 250,
    `${Math.round(docBox.height)} over ${Math.round(srcBox.height)}`)

  const sheetsBox = await phone.$eval('.sheets', (e) => e.getBoundingClientRect().toJSON())
  check('phone: the project list is out of the way until asked for', sheetsBox.right <= 1,
    `${Math.round(sheetsBox.right)}`)

  const toolbar = await phone.$$eval('.toolbar button, .toolbar input', (els) =>
    els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.textContent.trim() || e.value))
  check('phone: the toolbar is the menu, the name and the verdict', toolbar.length <= 5, JSON.stringify(toolbar))

  await phone.tap('.drawer-button')
  await phone.waitForTimeout(350)
  const open = await phone.$eval('.sheets', (e) => e.getBoundingClientRect().left)
  check('phone: ☰ opens the sheets', open >= -1, `${open}`)
  await phone.tap('.drawer-backdrop', { position: { x: 370, y: 400 } })
  await phone.waitForTimeout(350)
  check('phone: tapping outside puts them away again', (await phone.$('.app.drawer-open')) === null)

  await phone.tap('.drawer-button')
  await phone.waitForTimeout(350)
  await phone.tap('.sheet:has-text("Parameter study")')
  await phone.waitForTimeout(500)
  check('phone: choosing a sheet opens it and closes the drawer',
    (await phone.$('.app.drawer-open')) === null &&
      (await phone.$eval('.sheet-name', (e) => e.value)) === 'Parameter study')

  const grip = await phone.$eval('.split-handle', (e) => e.getBoundingClientRect().toJSON())
  await phone.mouse.move(grip.x + grip.width / 2, grip.y + 8)
  await phone.mouse.down()
  await phone.mouse.move(grip.x + grip.width / 2, grip.y - 200, { steps: 6 })
  await phone.mouse.up()
  await phone.waitForTimeout(250)
  const after = await phone.$eval('.output-pane', (e) => e.getBoundingClientRect().height)
  check('phone: the grip moves the split', after < docBox.height - 100, `${Math.round(docBox.height)} → ${Math.round(after)}`)

  await phone.tap('.toolbar-menu > button')
  await phone.waitForSelector('.menu')
  const menu = await phone.$$eval('.menu button', (els) =>
    els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.textContent.trim()))
  check('phone: what left the toolbar is in the menu',
    menu.some((t) => /Project/.test(t)) && menu.some((t) => /Share/.test(t)) && menu.includes('Print'),
    JSON.stringify(menu))
  await phone.close()

  // and on a desktop, none of that shows
  await seedWith(seed)
  await page.click('.toolbar-menu > button')
  await page.waitForSelector('.menu')
  const desktop = await page.$$eval('.menu button', (els) =>
    els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.textContent.trim()))
  check('desktop: the phone-only menu items stay hidden', !desktop.includes('Print'), JSON.stringify(desktop))
  check('desktop: no grip, no ☰', (await page.$eval('.split-handle', (e) => getComputedStyle(e).display)) === 'none' &&
    (await page.$eval('.drawer-button', (e) => getComputedStyle(e).display)) === 'none')
  await page.keyboard.press('Escape')
}

await browser.close()

console.log('PASS:'); ok.forEach((l) => console.log('  ✓ ' + l))
console.log('FAIL:'); bad.forEach((l) => console.log('  ✗ ' + l))
process.exit(bad.length ? 1 : 0)
