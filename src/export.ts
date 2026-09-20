import type { Line } from './engine'

/**
 * A sheet, out of Longhand and into somebody else's document.
 *
 * Printing is for the calculation that stands on its own. This is for the
 * other case, which is more common than it ought to be: the calculation is an
 * appendix to a report written in Word or LaTeX, in a house template, and the
 * only thing anybody wants from Longhand is the working — as editable text,
 * not as a picture of text.
 *
 * Both formats are generated from the same `Line[]` the screen renders, and
 * both carry the formulas as formulas: `\\[ ... \\]` in LaTeX, MathML in the
 * Word file. A calculation exported as flattened prose is a calculation the
 * receiving document cannot renumber, restyle or correct, which is the whole
 * reason people refuse to accept appendices as images.
 */

export interface DocumentMeta {
  project?: string
  client?: string
  author?: string
  checkedBy?: string
  revision?: string
  /** The signature line, when the sheet carries one. */
  signature?: string
}

const escapeLatex = (text: string): string =>
  text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const SECTIONS = ['section', 'subsection', 'subsubsection', 'paragraph', 'paragraph', 'paragraph']

/**
 * The sheet as a LaTeX document.
 *
 * Standalone and compilable — `pdflatex` on the output produces the sheet —
 * but written so that the interesting part can be lifted out: everything
 * between the two `% ---` markers is body text that drops into an existing
 * document unchanged.
 */
export function toLatex(title: string, lines: Line[], meta: DocumentMeta = {}): string {
  const head = [
    '\\documentclass[11pt,a4paper]{article}',
    '\\usepackage[T1]{fontenc}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage{amsmath}',
    '\\usepackage{booktabs}',
    '\\usepackage[margin=25mm]{geometry}',
    '\\usepackage{longtable}',
    '',
    `\\title{${escapeLatex(title)}}`,
    meta.author ? `\\author{${escapeLatex(meta.author)}}` : '\\date{}',
    '',
    '\\begin{document}',
    '\\maketitle',
  ]

  const facts = [
    meta.project && `Project: ${meta.project}`,
    meta.client && `Client: ${meta.client}`,
    meta.revision && `Revision: ${meta.revision}`,
    meta.checkedBy && `Checked: ${meta.checkedBy}`,
  ].filter(Boolean) as string[]

  const body: string[] = []
  if (facts.length > 0) {
    body.push(`\\noindent ${facts.map(escapeLatex).join(' \\quad ')}\\par\\medskip`, '')
  }
  if (meta.signature) body.push(`\\noindent\\textit{${escapeLatex(meta.signature)}}\\par\\medskip`, '')

  for (const line of lines) {
    switch (line.kind) {
      case 'heading':
        body.push('', `\\${SECTIONS[Math.min(line.level - 1, SECTIONS.length - 1)]}{${escapeLatex(line.text)}}`, '')
        break
      case 'prose':
      case 'note':
        body.push(escapeLatex(line.text), '')
        break
      case 'definition':
        body.push(`\\[ ${line.tex} \\]`)
        if (line.note) body.push(escapeLatex(line.note), '')
        break
      case 'calc':
        // The equation number is the sheet's own, so a reference written as
        // "eq. 7" in the report still points at the right line.
        body.push(
          line.equation === undefined
            ? `\\[ ${line.tex} \\]`
            : `\\begin{equation}\\tag{${line.equation}}\n${line.tex}\n\\end{equation}`,
        )
        if (line.tolerance) body.push(`\\noindent ${escapeLatex(line.tolerance.text)}\\par`)
        if (line.note) body.push(escapeLatex(line.note), '')
        if (line.query) body.push(`\\textbf{Query:} ${escapeLatex(line.query)}`, '')
        break
      case 'check':
        body.push(`\\[ ${line.tex} \\]`)
        body.push(
          `\\noindent\\textbf{${line.pass ? 'OK' : 'NOT OK'}}${
            line.margin ? ` --- ${escapeLatex(line.margin)}` : ''
          }\\par\\medskip`,
          '',
        )
        break
      case 'figure':
        body.push(
          '',
          `\\begin{center}\\textit{Figure ${line.number}${
            line.caption ? ` --- ${escapeLatex(line.caption)}` : ''
          }}\\end{center}`,
          '',
        )
        break
      case 'table': {
        const columns = 'l'.repeat(line.headers.length)
        body.push(
          '',
          `\\begin{longtable}{${columns}}`,
          '\\toprule',
          `${line.headers.map(escapeLatex).join(' & ')} \\\\`,
          '\\midrule',
          ...line.rows.map((row) => `${row.map((cell) => escapeLatex(cell.text)).join(' & ')} \\\\`),
          '\\bottomrule',
          '\\end{longtable}',
          '',
        )
        break
      }
      case 'error':
        body.push(`\\textbf{${escapeLatex(line.source)}}: ${escapeLatex(line.message)}`, '')
        break
      default:
        break
    }
  }

  return [
    ...head,
    '',
    '% --- sheet body begins',
    ...body,
    '% --- sheet body ends',
    '',
    '\\end{document}',
    '',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
}

/**
 * The sheet as a document Word will open, formulas included.
 *
 * Word has read HTML with MathML in it for twenty years, and turns it into
 * its own equations — which is the difference between an appendix somebody
 * can correct a typo in and a screenshot. `mathml` is a function so this
 * module does not depend on KaTeX: the caller hands in whatever renders TeX,
 * and the tests hand in something trivial.
 */
export function toWordHtml(
  title: string,
  lines: Line[],
  mathml: (tex: string) => string,
  meta: DocumentMeta = {},
): string {
  const body: string[] = []

  const facts = [
    meta.project && ['Project', meta.project],
    meta.client && ['Client', meta.client],
    meta.author && ['Author', meta.author],
    meta.checkedBy && ['Checked', meta.checkedBy],
    meta.revision && ['Revision', meta.revision],
  ].filter(Boolean) as string[][]

  body.push(`<h1>${escapeHtml(title)}</h1>`)
  if (facts.length > 0) {
    body.push(
      `<p class="meta">${facts
        .map(([label, value]) => `<b>${escapeHtml(label)}:</b> ${escapeHtml(value)}`)
        .join(' &nbsp; ')}</p>`,
    )
  }
  if (meta.signature) body.push(`<p class="sig">${escapeHtml(meta.signature)}</p>`)

  for (const line of lines) {
    switch (line.kind) {
      case 'heading':
        body.push(`<h${Math.min(line.level + 1, 6)}>${escapeHtml(line.text)}</h${Math.min(line.level + 1, 6)}>`)
        break
      case 'prose':
      case 'note':
        body.push(`<p>${escapeHtml(line.text)}</p>`)
        break
      case 'definition':
      case 'calc':
        body.push(
          `<p class="calc">${mathml(line.tex)}${
            line.kind === 'calc' && line.equation !== undefined
              ? `<span class="eq">(${line.equation})</span>`
              : ''
          }</p>`,
        )
        if (line.kind === 'calc' && line.tolerance) {
          body.push(`<p class="tol">${escapeHtml(line.tolerance.text)}</p>`)
        }
        if (line.note) body.push(`<p class="note">${escapeHtml(line.note)}</p>`)
        if (line.query) body.push(`<p class="query"><b>Query:</b> ${escapeHtml(line.query)}</p>`)
        break
      case 'check':
        body.push(
          `<p class="calc">${mathml(line.tex)}</p>`,
          `<p class="verdict"><b>${line.pass ? 'OK' : 'NOT OK'}</b>${
            line.margin ? ` — ${escapeHtml(line.margin)}` : ''
          }</p>`,
        )
        break
      case 'figure':
        body.push(
          `<p class="figure"><i>Figure ${line.number}${
            line.caption ? ` — ${escapeHtml(line.caption)}` : ''
          }</i></p>`,
        )
        break
      case 'table':
        body.push(
          '<table border="1" cellspacing="0" cellpadding="4">',
          `<tr>${line.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`,
          ...line.rows.map(
            (row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell.text)}</td>`).join('')}</tr>`,
          ),
          '</table>',
        )
        break
      case 'error':
        body.push(`<p class="error"><b>${escapeHtml(line.source)}</b>: ${escapeHtml(line.message)}</p>`)
        break
      default:
        break
    }
  }

  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: Calibri, "Segoe UI", sans-serif; font-size: 11pt; }
h1 { font-size: 16pt; }
p.meta, p.sig { color: #555; font-size: 9pt; }
p.calc { margin: 6pt 0; }
p.tol, p.note, p.query { color: #555; font-size: 9pt; margin: 2pt 0 8pt; }
p.verdict { margin: 0 0 10pt; }
span.eq { float: right; color: #777; }
table { border-collapse: collapse; font-size: 10pt; }
th { background: #f2f0ec; text-align: left; }
</style>
</head>
<body>
${body.join('\n')}
</body>
</html>
`
}
