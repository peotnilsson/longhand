import { math } from './units'
import { toTex } from './tex'

/**
 * Symbolic working, shown: `show diff(x^2*sin(x), x)` prints
 * d/dx (x² sin x) = 2x sin x + x² cos x.
 *
 * A numeric derivative answers "what is the slope here"; a written solution
 * needs the other thing — the derivative as a formula, the way it is worked
 * out on paper and checked by a marker. mathjs can differentiate and simplify
 * symbolically, so this is a thin layer that asks it to and prints both sides.
 *
 * Nothing here looks at the sheet's values. The letters in a `show` line are
 * letters, which is what makes it symbolic: x stays x even if a line above
 * gave x a value.
 */

export class ShowError extends Error {}

/**
 * The tree as it is written on paper rather than as mathjs keeps it:
 * exp(2x) as e^{2x}, and a number times a letter without a dot between them.
 * Only for printing — the working itself is done on the untouched tree.
 */
function forPaper(tree: any): any {
  const m = math as any
  return tree.transform((node: any) => {
    if (node.type === 'FunctionNode' && node.fn?.name === 'exp' && node.args.length === 1) {
      return new m.OperatorNode('^', 'pow', [new m.SymbolNode('e'), forPaper(node.args[0])])
    }
    if (node.type === 'OperatorNode' && node.op === '*' && node.args.length === 2) {
      const [left, right] = node.args
      const leftIsNumber = left.type === 'ConstantNode'
      const rightIsNumber = right.type === 'ConstantNode'
      if (leftIsNumber && !rightIsNumber) {
        return new m.OperatorNode('*', 'multiply', [left, forPaper(right)], true)
      }
    }
    return node
  })
}

/** The shortest of several equivalent forms is the one a person would write. */
const shortest = (forms: any[]): any =>
  forms.reduce((best, form) => (form.toString().length < best.toString().length ? form : best))

const FORMS = 'show diff(f, x), show diff(f, x, 2), show simplify(f) or show expand(f)'

export function showWorking(body: string): { tex: string; result: string } {
  let node: any
  try {
    // ln is how everybody writes the natural logarithm, and mathjs calls it log.
    node = math.parse(body).transform((child: any) =>
      child.type === 'FunctionNode' && child.fn?.name === 'ln'
        ? new (math as any).FunctionNode(new (math as any).SymbolNode('log'), child.args)
        : child,
    )
  } catch (error) {
    throw new ShowError(`${error instanceof Error ? error.message : String(error)} — show takes ${FORMS}.`)
  }
  if (node.type !== 'FunctionNode') throw new ShowError(`show takes ${FORMS}.`)

  const name = node.fn?.name
  const args = node.args as any[]
  const tex = (tree: any) => toTex(forPaper(tree), {})

  if (name === 'diff') {
    if (args.length < 2 || args.length > 3 || args[1].type !== 'SymbolNode') {
      throw new ShowError('diff takes the expression and the variable, and optionally the order: diff(x^2*sin(x), x, 2).')
    }
    const variable = args[1].name as string
    const order = args[2] ? Number(args[2].evaluate()) : 1
    if (!Number.isInteger(order) || order < 1 || order > 6) {
      throw new ShowError('The order of a derivative is a whole number from 1 to 6.')
    }
    let result = args[0]
    try {
      for (let step = 0; step < order; step += 1) result = math.derivative(result, variable)
      result = math.simplify(result)
    } catch (error) {
      throw new ShowError(
        `Could not differentiate that symbolically: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    const operator =
      order === 1 ? `\\frac{d}{d${variable}}` : `\\frac{d^{${order}}}{d${variable}^{${order}}}`
    return {
      tex: `${operator}\\left(${tex(args[0])}\\right) = ${tex(result)}`,
      result: result.toString(),
    }
  }

  if (name === 'simplify' || name === 'expand') {
    if (args.length !== 1) throw new ShowError(`${name} takes one expression: ${name}((x + 1)^2 - 1).`)
    let result: any
    try {
      if (name === 'simplify') {
        // mathjs's simplify does not multiply brackets out, so a difference of
        // squares stays a difference of squares. Trying the expanded form too
        // and keeping whichever is shorter gets the answer a person would.
        const forms = [math.simplify(args[0])]
        try {
          forms.push(math.simplify((math as any).rationalize(args[0])))
        } catch {
          /* not a rational expression: simplify alone will do */
        }
        result = shortest(forms)
      } else {
        // rationalize expands a polynomial fully, which is what "expand" means on paper
        result = (math as any).rationalize(args[0])
      }
    } catch (error) {
      throw new ShowError(`Could not ${name} that: ${error instanceof Error ? error.message : String(error)}`)
    }
    return { tex: `${tex(args[0])} = ${tex(result)}`, result: result.toString() }
  }

  throw new ShowError(`show takes ${FORMS}.`)
}
