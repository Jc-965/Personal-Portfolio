import { useEffect, useState } from 'react'
import { matchRoute, projectPath, type Route } from '../router'
import { lenisRef } from '../scroll/lenisRef'

const ROUTE_EVENT = 'app:navigate'

/** What the home entry remembers while a project page is open. */
export interface HomeReturn { scrollY: number; row: string }

const scrollTop = () => {
  if (lenisRef.current) lenisRef.current.scrollTo(0, { immediate: true })
  else window.scrollTo(0, 0)
}

/** Pushes a new entry and tells `useRoute` listeners. */
export function navigate(to: string, state: object | null = null): void {
  window.history.pushState(state, '', to)
  window.dispatchEvent(new Event(ROUTE_EVENT))
  scrollTop()
}

/** Opens a project from its row, remembering where the reader was. */
export function openProject(id: string): void {
  const returnTo: HomeReturn = { scrollY: window.scrollY, row: id }
  window.history.replaceState(returnTo, '')
  navigate(projectPath(id), { from: 'home' })
}

/** Back to the index: the previous entry when we came from it, else a fresh home. */
export function goBackToIndex(): void {
  const state = window.history.state as { from?: string } | null
  if (state?.from === 'home') window.history.back()
  else navigate('/projects/')
}

export function isPlainLeftClick(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => matchRoute(window.location.pathname))
  useEffect(() => {
    window.history.scrollRestoration = 'manual'
    const update = () => setRoute(matchRoute(window.location.pathname))
    window.addEventListener('popstate', update)
    window.addEventListener(ROUTE_EVENT, update)
    return () => {
      window.removeEventListener('popstate', update)
      window.removeEventListener(ROUTE_EVENT, update)
    }
  }, [])
  return route
}
