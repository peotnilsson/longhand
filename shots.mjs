/**
 * The pictures on the landing page are screenshots of the real thing, taken
 * from the built app rather than drawn. Run after a build, with
 * `npx vite preview --port 4173` running:
 *
 *   npm i --no-save playwright && node shots.mjs
 */
import { chromium } from 'playwright'
import { readFileSync } from 'fs'

const source = readFileSync('src/examples.ts', 'utf8')
const example = (id) =>
  source.match(new RegExp(`id: '${id}',[\\s\\S]*?source: \`([\\s\\S]*?)\`,\\n  \\},`))[1]

const store = {
  version: 3,
  projects: [
    {
      id: 'p1',
      name: 'F31G Building',
      meta: { client: 'Stockholm', author: 'Peo Nilsson', checkedBy: 'AN', revision: 'B' },
      sheets: [
        { id: 's1', name: 'Steel beam, section A-A', source: example('beam') },
        { id: 's2', name: 'Wall U-value', source: example('wall') },
      ],
    },
  ],
  activeProjectId: 'p1',
  activeSheetId: 's1',
  precision: 4,
  mode: 'quadrature',
  settings: { theme: 'light', author: 'Peo Nilsson', project: 'F31G Building' },
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const page = await browser.newPage({
  // wide enough that the longest line in the example is not cut off
  viewport: { width: 1520, height: 880 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
})
await page.addInitScript((s) => localStorage.setItem('longhand:store', JSON.stringify(s)), store)

// 1. the app itself, for the hero
await page.goto('http://localhost:4173/app')
await page.waitForSelector('.sheet-page')
await page.waitForTimeout(800)
await page.screenshot({ path: 'public/shot-sheet.png' })
console.log('public/shot-sheet.png')

// 2. the package, paginated, for the printing section and as a sample PDF
await page.click('button:has-text("Project")')
await page.click('button:has-text("Preview whole project")')
await page.waitForTimeout(400)
await page.click('button:has-text("Number the pages")')
await page.waitForFunction(() => document.querySelectorAll('.pagedjs_page').length > 0, null, {
  timeout: 20000,
})
await page.waitForTimeout(1500)
const pages = await page.$$('.pagedjs_page')
console.log(`${pages.length} printed pages`)

// the preview bar is part of the app, not of the page being printed — and the
// window has to be wide enough for a whole A4 page to be painted, or the
// screenshot of it comes back with the right-hand side cut off
await page.addStyleTag({ content: '.package-bar { display: none !important }' })
await page.setViewportSize({ width: 1900, height: 1100 })
await page.waitForTimeout(600)
await (await page.$$('.pagedjs_page'))[0].screenshot({ path: 'public/shot-print.png' })
console.log('public/shot-print.png')

await page.emulateMedia({ media: 'print' })
await page.pdf({ path: 'public/sample-package.pdf', format: 'A4', printBackground: true })
console.log('public/sample-package.pdf')

await browser.close()
