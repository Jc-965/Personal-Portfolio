/**
 * A tiny shell for the Toolkit terminal. Pure: a command string in, printed
 * lines out. The file system is the skills tree, nothing else.
 */

export interface SkillGroup {
  id: string
  items: string[]
}

export type Line =
  | { kind: 'text'; text: string; tone?: 'muted' | 'error' }
  | { kind: 'tree'; groups: SkillGroup[] }
  | { kind: 'items'; dir: string; items: string[] }

export const HELP: string[] = [
  'help            this list',
  'tree            print the whole skills tree',
  'ls [dir]        list directories, or the tools in one',
  'grep <term>     find tools matching a term',
  'whoami          who runs this shell',
  'pwd             where you are',
  'clear           wipe the screen',
]

/** Runs one command line against the skills tree and returns what it prints. */
export function runCommand(input: string, groups: SkillGroup[], profile: { name: string; role: string }): Line[] | 'clear' {
  const parts = input.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return []
  const [command, ...args] = parts
  const cmd = command.toLowerCase()
  const dirOf = (name: string | undefined) => groups.find(g => g.id === (name ?? '').replace(/\/$/, '').toLowerCase())

  switch (cmd) {
    case 'help':
    case '?':
      return HELP.map(text => ({ kind: 'text', text }))
    case 'tree':
      return [{ kind: 'text', text: 'skills' }, { kind: 'tree', groups }]
    case 'ls':
    case 'dir': {
      if (args.length === 0) return [{ kind: 'text', text: groups.map(g => `${g.id}/`).join('  ') }]
      const dir = dirOf(args[0])
      return dir ? [{ kind: 'items', dir: dir.id, items: dir.items }] : [{ kind: 'text', text: `ls: no such directory: ${args[0]}`, tone: 'error' }]
    }
    case 'grep':
    case 'find': {
      const term = args.join(' ').toLowerCase()
      if (!term) return [{ kind: 'text', text: 'grep: give me a term, for example: grep py', tone: 'muted' }]
      const hits = groups.flatMap(g => g.items.filter(item => item.toLowerCase().includes(term)).map(item => `${g.id}/${item}`))
      return hits.length ? hits.map(text => ({ kind: 'text' as const, text })) : [{ kind: 'text', text: `grep: nothing matches "${term}"`, tone: 'muted' }]
    }
    case 'whoami':
      return [{ kind: 'text', text: `${profile.name.toLowerCase().replace(/\s+/g, '')}  ·  ${profile.role}` }]
    case 'pwd':
      return [{ kind: 'text', text: '~/skills' }]
    case 'echo':
      return [{ kind: 'text', text: args.join(' ') }]
    case 'clear':
    case 'cls':
      return 'clear'
    case 'exit':
    case 'logout':
      return [{ kind: 'text', text: 'there is no leaving. try help', tone: 'muted' }]
    default:
      return [{ kind: 'text', text: `zsh: command not found: ${command}`, tone: 'error' }]
  }
}
