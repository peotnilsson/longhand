import { create, all, type MathNode } from 'mathjs'

const math = create(all, {})

export type Line =
  | { kind: 'blank' }
  | { kind: 'heading'; text: string; level: number }
  | { kind: 'prose'; text: string }
  | { kind: 'calc'; tex: string }
  | { kind: 'error'; source: string; message: string }

const GREEK = new Set([
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta',
  'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma',
  'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
])

const isUnitName = (name: string): boolean => {
  try {
    return (math as any).Unit.isValuelessUnit(name)
  } catch {
    return false
  }
}

/**
 * Engineers write M_Ed, f_ck, sigma_max. mathjs renders those as literal
 * underscores and spaced-out italics. Render them the way they are written on
 * paper: variables italic, units upright, real subscripts, Greek where meant.
 *
 * Note the braces around single letters: mathjs concatenates our output onto
 * things like \cdot, and "\cdot m" without a group becomes the undefined
 * command \cdotm.
 */
function symbolToTex(name: string, scope: Record<string, unknown> = {}): string {
  const [head, ...rest] = name.split('_')
  const upright = !(name in scope) && isUnitName(name)
  const base = GREEK.has(head)
    ? `\\${head}`
    : head.length === 1 && !upright
      ? `{${head}}`
      : `\\mathrm{${head}}`
  if (rest.length === 0) return base
  const sub = rest.join('\\_')
  return `${base}_{${GREEK.has(sub) ? `\\${sub}` : `\\mathrm{${sub}}`}}`
}

const toTex = (node: MathNode, scope: Record<string, unknown>): string =>
  node.toTex({
    handler: (n: any) => (n.isSymbolNode ? symbolToTex(n.name, scope) : undefined),
  } as any)

/**
 * Replace every symbol in the tree with its current value, so a reader can see
 * the numbers that went in. This substituted middle line is the whole point of
 * the product: a calculation you can check by eye.
 */
function substitute(node: MathNode, scope: Record<string, unknown>): MathNode {
  return node.transform((n: any, path: string, parent: any) => {
    const isFunctionName = parent && parent.isFunctionNode && path === 'fn'
    if (n.isSymbolNode && !isFunctionName) {
      const value = scope[n.name]
      if (value !== undefined) {
        try {
          return math.parse(math.format(value, { precision: 4 }))
        } catch {
          return n
        }
      }
    }
    return n
  })
}

function valueToTex(value: unknown, scope: Record<string, unknown>): string {
  const formatted = math.format(value, { precision: 4 })
  try {
    return toTex(math.parse(formatted), scope)
  } catch {
    return `\\text{${formatted}}`
  }
}

/** Two stages are "the same" if they differ only in spacing or multiplication dots. */
const normalise = (tex: string) => tex.replace(/~|\\cdot|\s|\\left|\\right|[{}]/g, '')

function processLine(raw: string, scope: Record<string, unknown>): Line {
  const line = raw.trim()

  if (line === '') return { kind: 'blank' }

  if (line.startsWith('#')) {
    const level = line.match(/^#+/)![0].length
    return { kind: 'heading', text: line.replace(/^#+\s*/, ''), level }
  }

  if (line.startsWith('//')) {
    return { kind: 'prose', text: line.replace(/^\/\/\s*/, '') }
  }

  // Optional display unit:  sigma = M_Ed/W  -> MPa
  let expression = line
  let displayUnit: string | null = null
  const arrow = line.lastIndexOf('->')
  if (arrow !== -1) {
    expression = line.slice(0, arrow).trim()
    displayUnit = line.slice(arrow + 2).trim()
  }

  try {
    const node = math.parse(expression)
    let value = node.evaluate(scope)

    if (displayUnit) {
      if (typeof (value as any)?.to !== 'function') {
        throw new Error(`Cannot convert a plain number to ${displayUnit}`)
      }
      value = (value as any).to(displayUnit)
    }

    const isAssignment = (node as any).type === 'AssignmentNode'
    const lhs = isAssignment ? symbolToTex((node as any).object.name, scope) : null
    const rhs: MathNode = isAssignment ? (node as any).value : node

    const stages: string[] = []
    for (const stage of [
      toTex(rhs, scope),
      toTex(substitute(rhs, scope), scope),
      valueToTex(value, scope),
    ]) {
      const previous = stages[stages.length - 1]
      if (previous === undefined || normalise(previous) !== normalise(stage)) {
        stages.push(stage)
      }
    }

    return { kind: 'calc', tex: (lhs ? `${lhs} = ` : '') + stages.join(' = ') }
  } catch (error) {
    return {
      kind: 'error',
      source: line,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export function evaluateSheet(source: string): Line[] {
  const scope: Record<string, unknown> = {}
  return source.split('\n').map((raw) => processLine(raw, scope))
}
