/**
 * What the tests cannot check: the app in a real browser.
 *
 *   npm run build && npx vite preview --port 4173 &
 *   npm i --no-save playwright && node verify.mjs
 *
 * Writes verify-light.png, verify-dark.png and verify-phone.png to look at.
 */
import { chromium } from 'playwright'

const ok = []
const bad = []
const check = (name, pass, detail = '') => (pass ? ok : bad).push(`${name}${detail ? ' — ' + detail : ''}`)

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
page.on('pageerror', (e) => bad.push('PAGE ERROR: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') bad.push('CONSOLE: ' + m.text()) })

const seed = {
  version: 3,
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

const seedWith = async (store) => {
  await page.addInitScript((s) => localStorage.setItem('longhand:store', JSON.stringify(s)), store)
  await page.goto('http://localhost:4173/')
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
await page.click('button:has-text("Settings")')
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
  const sel = await page.$('.panel select')
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
  check('package prints every sheet, numbered', pages.length === 3 &&
    positions.join('|') === 'Sheet1 of 3|Sheet2 of 3|Sheet3 of 3',
    `${pages.length} pages, ${JSON.stringify(positions)}`)
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
await page.click('.cm-content')
await page.keyboard.press('Control+Home')
const t0 = Date.now()
await page.keyboard.type('// x', { delay: 0 })
const typed = Date.now() - t0
await page.waitForTimeout(1500)
const stillStale = await page.$('.output-pane.stale')
check('typing not blocked on a 300-line sheet', typed < 600, `${typed}ms for 4 keystrokes`)
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

// 12. help
await page.click('button:has-text("Help")')
await page.waitForSelector('.panel.help')
{
  const codes = await page.$$eval('.panel.help .syntax code', (els) => els.map((e) => e.textContent))
  check('help lists the syntax', codes.includes('b = 300 mm +- 2 mm') && codes.length > 10,
    `${codes.length} examples`)
  const before = (await page.evaluate(() => JSON.parse(localStorage.getItem('longhand:store'))))
    .projects[0].sheets.length
  await page.click('button:has-text("New sheet from the example")')
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('longhand:store')))
  check('the example becomes a real sheet', after.projects[0].sheets.length === before + 1 &&
    after.projects[0].sheets.at(-1).name === 'Example',
    `${after.projects[0].sheets.length} sheets`)
  await page.waitForTimeout(300)
  const rendered = await page.$eval('.output-pane', (e) => e.textContent)
  check('the example evaluates without an error', rendered.includes('OK') && !rendered.includes('Error'),
    rendered.slice(0, 60))
  await page.click('button:has-text("Help")')
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
  await page.click('button:has-text("Help")')
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
    lit.length === 1 && lit[0].text === 'Help' &&
      lit[0].border !== 'rgba(0, 0, 0, 0)' && lit[0].background !== 'rgba(0, 0, 0, 0)',
    JSON.stringify(lit))
  await page.click('button:has-text("Help")')
  check('pressing it again puts it out', (await page.$$('.toolbar button.on')).length === 0)
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
  await page.keyboard.press('Alt+h')
  await page.waitForTimeout(200)
  check('Alt+H opens Help', !!(await page.$('.panel.help')))
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
  await page.click('button:has-text("Settings")')
  await page.waitForSelector('.panel')
  await page.click('button:has-text("Keep a copy on disk")')
  await page.waitForTimeout(700)
  check('the file is connected', /Saving to verify/.test(await panelText()),
    (await panelText()).match(/Saving to \S+/)?.[0] ?? 'not saving')

  await page.click('button:has-text("Settings")')
  await page.click('.cm-content')
  await page.keyboard.type('\nfrom_the_test = 5 mm')
  await page.waitForTimeout(1600)
  const written = await page.evaluate(() => window.__readDisk())
  check('an edit reaches the file', written.includes('from_the_test'), `${written.length} bytes`)

  await page.reload()
  await page.waitForSelector('.sheet-page')
  await page.waitForTimeout(900)
  await page.click('button:has-text("Settings")')
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
  await page.click('button:has-text("Settings")')
  await page.click('.cm-content')
  await page.keyboard.type('\nagain = 1')
  await page.waitForTimeout(1700)
  await page.click('button:has-text("Settings")')
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
  await page.click('button:has-text("Settings")')
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

// 19. nothing clipped or overflowing, in either theme and at phone width
for (const [theme, width, height, tag] of [
  ['light', 1400, 900, 'light'],
  ['dark', 1400, 900, 'dark'],
  ['light', 390, 780, 'phone'],
]) {
  const view = await browser.newPage({ viewport: { width, height }, colorScheme: theme })
  await view.addInitScript((s) => localStorage.setItem('longhand:store', JSON.stringify(s)),
    { ...seed, settings: { ...seed.settings, theme } })
  await view.goto('http://localhost:4173/')
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

await browser.close()

console.log('PASS:'); ok.forEach((l) => console.log('  ✓ ' + l))
console.log('FAIL:'); bad.forEach((l) => console.log('  ✗ ' + l))
process.exit(bad.length ? 1 : 0)
