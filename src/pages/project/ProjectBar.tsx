import { useEffect, type MouseEvent } from 'react'
import { projectPath } from '../../router'
import { goBackToIndex, isPlainLeftClick, navigate } from '../../hooks/useRoute'

/** The sticky strip above a project: back to the index, where you are, and the next project. */
export default function ProjectBar({ id, nextId, nextName }: { id: string; nextId: string; nextName: string }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') goBackToIndex()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const back = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainLeftClick(event)) return
    event.preventDefault()
    goBackToIndex()
  }
  const next = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainLeftClick(event)) return
    event.preventDefault()
    navigate(projectPath(nextId))
  }
  return (
    <nav className="pbar" aria-label="Project navigation">
      <a className="pbar__link" href="/projects/" onClick={back}>[ &larr; index ]</a>
      <span className="pbar__path" aria-current="page">~/projects/{id}</span>
      <a className="pbar__link" href={projectPath(nextId)} onClick={next} aria-label={`Next project: ${nextName}`}>[ next &rarr; ]</a>
    </nav>
  )
}
