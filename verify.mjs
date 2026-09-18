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

await page.addInitScript((s) => localStorage.setItem('longhand:store', JSON.stringify(s)), seed)
await page.goto('http://localhost:4173/')
await page.waitForSelector('.sheet-page')

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
await page.evaluate((s) => localStorage.setItem('longhand:store', JSON.stringify(s)), seed)
await page.reload()
await page.waitForSelector('.sheet-page')
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
await page.evaluate(() => localStorage.removeItem('longhand:store'))
await page.reload()
await page.waitForSelector('.sheet-page')
const big = ['# Big', 'b = 300 mm +- 2 mm', 'h = 500 mm']
for (let i = 0; i < 300; i += 1) big.push(`W${i} = b*h^2/${i + 6}`)
await page.evaluate((src) => {
  const s = JSON.parse(localStorage.getItem('longhand:store'))
  s.projects[0].sheets[0].source = src
  localStorage.setItem('longhand:store', JSON.stringify(s))
}, big.join('\n'))
await page.reload()
await page.waitForSelector('.sheet-page')
await page.click('.cm-content')
await page.keyboard.press('Control+Home')
const t0 = Date.now()
await page.keyboard.type('// x', { delay: 0 })
const typed = Date.now() - t0
await page.waitForTimeout(1500)
const stillStale = await page.$('.output-pane.stale')
check('typing not blocked on a 300-line sheet', typed < 600, `${typed}ms for 4 keystrokes`)
check('stale clears once caught up', !stillStale)

// 10. nothing clipped or overflowing, in either theme and at phone width
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
