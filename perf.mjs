import { evaluateSheet } from './eng.mjs'

const build = (n) => {
  const lines = ['# Big sheet', 'b = 300 mm +- 2 mm', 'h = 500 mm']
  for (let i = 0; i < n; i += 1) {
    lines.push(`W${i} = b*h^2/${i + 6}`)
    if (i % 5 === 0) lines.push(`W${i} <= 1e9 mm^3`)
  }
  return lines.join('\n')
}

for (const n of [100, 300, 500]) {
  const source = build(n)
  const count = source.split('\n').length

  const cold = performance.now()
  evaluateSheet(source)
  const coldMs = performance.now() - cold

  // warm: one character changed near the end, which is the common case
  const edited = source.replace(`W${n - 1} = b*h^2/${n + 5}`, `W${n - 1} = b*h^2/${n + 6}`)
  const warm = performance.now()
  evaluateSheet(edited)
  const warmMs = performance.now() - warm

  // worst case: a change on the first line invalidates everything
  const top = edited.replace('b = 300 mm +- 2 mm', 'b = 301 mm +- 2 mm')
  const start = performance.now()
  evaluateSheet(top)
  const topMs = performance.now() - start

  console.log(
    `${String(count).padStart(4)} lines | cold ${coldMs.toFixed(0)}ms | edit near end ${warmMs.toFixed(0)}ms | edit at top ${topMs.toFixed(0)}ms`,
  )
}
