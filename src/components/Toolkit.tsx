import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { m, useInView, useReducedMotion } from 'framer-motion'
import portfolio from '../content/portfolio.json'
import { runCommand, type Line, type SkillGroup } from './toolkitShell'

/** The three groups from the resume, in its order. */
const groups: SkillGroup[] = [
  { id: 'languages', items: ['Python', 'TypeScript', 'Kotlin', 'Java', 'C', 'SQL', 'Dart', 'JavaScript', 'HTML/CSS'] },
  { id: 'technologies', items: ['React', 'FastAPI', 'LangGraph', 'Android SDK', 'Flutter', 'Node.js', 'MCP', 'Supabase'] },
  { id: 'platforms', items: ['PostgreSQL', 'pgvector', 'Docker', 'AWS', 'Firebase', 'Git', 'GitHub Actions (CI/CD)'] },
]

const INTRO = 'tree ~/skills'
const fileCount = groups.reduce((sum, group) => sum + group.items.length, 0)

interface Entry {
  id: number
  command: string
  output: Line[]
}

let nextId = 0

/**
 * Toolkit as a working terminal. The first command types itself and prints
 * the skills tree, then the prompt is yours: ls, grep, whoami, help.
 * Clicking a directory in the tree lists it. Every tool is on screen from
 * the start, so the shell is a bonus, never the only way in.
 */
export default function Toolkit() {
  const headerRef = useRef<HTMLElement>(null)
  const terminalRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const headerInView = useInView(headerRef, { once: true, margin: '-60px' })
  const terminalInView = useInView(terminalRef, { once: true, margin: '-80px' })
  const reduce = useReducedMotion()
  const [typed, setTyped] = useState('')
  const [entries, setEntries] = useState<Entry[]>([])
  const [ready, setReady] = useState(false)
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  // The opening command types itself, then its output arrives.
  useEffect(() => {
    if (!terminalInView || ready) return
    let i = 0
    const timers: number[] = []
    if (reduce) {
      // Reduced motion skips the typing but still prints on the next tick, so the effect stays a subscription.
      timers.push(window.setTimeout(() => {
        setTyped(INTRO)
        setEntries([{ id: nextId++, command: INTRO, output: runCommand(INTRO, groups, portfolio.profile) as Line[] }])
        setReady(true)
      }, 0))
      return () => timers.forEach(window.clearTimeout)
    }
    const type = () => {
      i += 1
      setTyped(INTRO.slice(0, i))
      if (i < INTRO.length) timers.push(window.setTimeout(type, 42 + Math.random() * 40))
      else timers.push(window.setTimeout(() => {
        setEntries([{ id: nextId++, command: INTRO, output: runCommand(INTRO, groups, portfolio.profile) as Line[] }])
        timers.push(window.setTimeout(() => setReady(true), 900))
      }, 260))
    }
    timers.push(window.setTimeout(type, 400))
    return () => timers.forEach(window.clearTimeout)
  }, [terminalInView, ready, reduce])

  const run = useCallback((raw: string) => {
    const command = raw.trim()
    if (!command) return
    const output = runCommand(command, groups, portfolio.profile)
    if (output === 'clear') setEntries([])
    // The window grows with its output but never scrolls, so only the last few entries stay.
    else setEntries(prev => [...prev.slice(-4), { id: nextId++, command, output }])
    setHistory(prev => [command, ...prev.slice(0, 40)])
    setHistoryIndex(-1)
    setInput('')
  }, [])

  const onSubmit = (event: FormEvent) => { event.preventDefault(); run(input) }
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      const next = Math.min(history.length - 1, historyIndex + 1)
      setHistoryIndex(next)
      setInput(history[next] ?? '')
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      const next = Math.max(-1, historyIndex - 1)
      setHistoryIndex(next)
      setInput(next < 0 ? '' : history[next])
    } else if (event.key === 'Tab') {
      // Complete a directory name.
      const match = groups.find(g => g.id.startsWith(input.split(' ').pop() ?? ''))
      if (match && input.includes(' ')) { event.preventDefault(); setInput(`${input.split(' ')[0]} ${match.id}`) }
    }
  }
  const focusInput = () => { if (window.getSelection()?.toString()) return; inputRef.current?.focus({ preventScroll: true }) }

  const renderLine = (line: Line, key: number) => {
    if (line.kind === 'text') return <p key={key} className={`toolkit__line ${line.tone ? `toolkit__line--${line.tone}` : ''}`}>{line.text}</p>
    if (line.kind === 'items') return (
      <p key={key} className="toolkit__line">
        <span className="toolkit__dir">{line.dir}/</span>{'  '}
        {line.items.map(item => <span key={item} className="toolkit__item">{item}</span>)}
      </p>
    )
    return (
      <div key={key} className="toolkit__tree">
        {line.groups.map((group, i) => (
          <m.div
            key={group.id}
            className="toolkit__row"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, delay: reduce ? 0 : 0.12 + i * 0.14 }}
          >
            <span className="toolkit__branch" aria-hidden="true">{i === line.groups.length - 1 ? '└──' : '├──'}</span>
            <button type="button" className="toolkit__dir toolkit__dir--button" onClick={() => run(`ls ${group.id}`)} title={`ls ${group.id}`}>{group.id}/</button>
            <ul className="toolkit__items" aria-label={group.id}>
              {group.items.map(item => <li key={item} className="toolkit__item">{item}</li>)}
            </ul>
          </m.div>
        ))}
        <p className="toolkit__line toolkit__line--muted">{line.groups.length} directories, {fileCount} files</p>
      </div>
    )
  }

  return (
    <>
      <m.header
        ref={headerRef}
        className="section__header"
        initial={{ opacity: 0, y: 30 }}
        animate={headerInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.4 }}
      >
        <p className="section__eyebrow">
          <span className="section__eyebrow-icon">&#9670;</span>
          Toolkit
        </p>
        <h2>Technologies and tools I work with</h2>
      </m.header>

      {/* A press anywhere on the glass puts the caret in the prompt, like a real terminal window. */}
      <div ref={terminalRef} className="toolkit__terminal" data-cursor onPointerDown={focusInput}>
        <div className="toolkit__bar">
          <span className="toolkit__bar-title">~/skills</span>
          <span className="toolkit__bar-hint">{ready ? 'type help' : 'zsh'}</span>
        </div>
        <div ref={bodyRef} className="toolkit__body">
          {entries.length === 0 && (
            <p className="toolkit__line toolkit__line--cmd">
              <span className="toolkit__prompt">$</span> {typed}
              {!ready && <span className="toolkit__cursor" aria-hidden="true" />}
            </p>
          )}
          {entries.map(entry => (
            <div key={entry.id} className="toolkit__entry">
              <p className="toolkit__line toolkit__line--cmd"><span className="toolkit__prompt">$</span> {entry.command}</p>
              {entry.output.map((line, i) => renderLine(line, i))}
            </div>
          ))}
          {ready && (
            <form className="toolkit__line toolkit__line--cmd toolkit__form" onSubmit={onSubmit}>
              <label htmlFor="toolkit-input" className="toolkit__prompt">$</label>
              <input
                id="toolkit-input"
                ref={inputRef}
                className="toolkit__input"
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={onKey}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-label="Type a command, for example help"
                placeholder="help"
              />
            </form>
          )}
        </div>
      </div>
    </>
  )
}
