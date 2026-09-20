import { describe, expect, it } from 'vitest'
import { filterCommands, type Command } from './Commands'

const commands: Command[] = [
  { id: 'a', label: 'Print this sheet', group: 'Sheet', hint: 'Cmd+P', run: () => {} },
  { id: 'b', label: 'Print the whole project', group: 'Project', run: () => {} },
  { id: 'c', label: 'Beam check', group: 'Sheets', hint: 'switch to', run: () => {} },
  { id: 'd', label: 'Export as LaTeX', group: 'Sheet', run: () => {} },
]

describe('the command palette', () => {
  it('shows everything before anything is typed', () => {
    expect(filterCommands(commands, '  ')).toHaveLength(commands.length)
  })

  it('matches on all the words, not any of them', () => {
    expect(filterCommands(commands, 'print project').map((c) => c.id)).toEqual(['b'])
    expect(filterCommands(commands, 'print zzz')).toHaveLength(0)
  })

  it('finds a sheet by its name, which is the point on a big project', () => {
    expect(filterCommands(commands, 'beam').map((c) => c.id)).toEqual(['c'])
  })

  it('matches the group, so "sheets" narrows to sheets', () => {
    expect(filterCommands(commands, 'sheets').map((c) => c.id)).toEqual(['c'])
  })

  it('ignores case', () => {
    expect(filterCommands(commands, 'LATEX').map((c) => c.id)).toEqual(['d'])
  })
})
