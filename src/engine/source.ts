/**
 * Line-level text handling, shared by the evaluator and the solver so they
 * always read a line the same way.
 */

/**
 * Split a trailing note off a line of maths:
 *
 *   b = 300 mm    // from drawing A-102, rev C
 *
 * A calculation carries its reasons — which drawing, which clause, which load
 * case — and they belong on the line they explain rather than above it. `//`
 * cannot appear in a valid expression, so the only thing to be careful of is a
 * `//` inside a quoted string, which a lookup label can have.
 */
export function splitNote(line: string): { body: string; note?: string } {
  let quote: string | null = null

  for (let index = 0; index < line.length - 1; index += 1) {
    const character = line[index]

    if (quote) {
      if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      continue
    }
    if (character === '/' && line[index + 1] === '/') {
      return {
        body: line.slice(0, index).trim(),
        note: line.slice(index + 2).trim() || undefined,
      }
    }
  }

  return { body: line.trim() }
}
