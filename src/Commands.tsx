import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Everything the app can do, on one keystroke.
 *
 * The `/` palette in the editor answers "how do I write this"; this one
 * answers "how do I do this" — switch sheet, print, share, export, sign —
 * and the two are deliberately the same habit at different addresses. A
 * toolbar can hold eight buttons before it stops being readable, and the app
 * passed eight a long time ago; the rest have been living in panels where
 * nobody finds them.
 *
 * Sheets are commands too, which is the part that earns the feature: on a
 * project of twenty sheets, typing three letters of a name beats hunting the
 * sidebar every time.
 */
export interface Command {
  id: string
  label: string
  /** What the row says on the right: a shortcut, or where it lives. */
  hint?: string
  group: string
  run: () => void
}

/** Every word has to match somewhere, the same rule as the reference search. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return commands
  return commands.filter((command) => {
    const hay = `${command.label} ${command.group} ${command.hint ?? ''}`.toLowerCase()
    return words.every((word) => hay.includes(word))
  })
}

export function CommandPalette({
  commands,
  onClose,
}: {
  commands: Command[]
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [at, setAt] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  const shown = useMemo(() => filterCommands(commands, query), [commands, query])
  const selected = Math.min(at, Math.max(0, shown.length - 1))

  useEffect(() => {
    input.current?.focus()
  }, [])

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    list.current?.children[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const run = (command: Command | undefined) => {
    if (!command) return
    onClose()
    command.run()
  }

  return (
    <div className="commands-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className="commands"
        role="dialog"
        aria-label="Commands"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={input}
          className="commands-query"
          value={query}
          placeholder="What do you want to do?"
          aria-label="Search commands"
          onChange={(event) => {
            setQuery(event.target.value)
            setAt(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setAt((current) => Math.min(current + 1, shown.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setAt((current) => Math.max(current - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              run(shown[selected])
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
            }
          }}
        />
        {shown.length === 0 ? (
          <p className="commands-empty">Nothing matches that.</p>
        ) : (
          <ul className="commands-list" ref={list}>
            {shown.map((command, index) => (
              <li key={command.id}>
                <button
                  className={index === selected ? 'command on' : 'command'}
                  onMouseEnter={() => setAt(index)}
                  onClick={() => run(command)}
                >
                  <span className="command-group">{command.group}</span>
                  <span className="command-label">{command.label}</span>
                  {command.hint && <span className="command-hint">{command.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
