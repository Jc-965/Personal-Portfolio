/**
 * Which role's journey is open, and the moves between the home page's rows and a journey. Opening pushes `/<id>`,
 * adds roles-open to the root (which hides every other section), and scrolls to the journey's start. Moving to
 * another role from a journey's rail replaces the entry, so Back always returns home. Closing (the back control,
 * Escape, the browser's Back, or scrolling on past the end) restores the home offset. A close runs once.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { lenisRef } from '../../scroll/lenisRef'
import { pageScrollY } from '../../scroll/scrollSignal'
import { useReturnAtEnd } from '../chapter/stageHooks'
import { journeyAt, journeyPath } from '../teardown/route'

/** The root class while a role's journey is open. roles.css hides everything else under it. */
export const ROLES_OPEN = 'roles-open'

export interface RolesViewOptions {
  ids: readonly string[]
  titleOf(id: string): string
  /** The open journey's pinned track. */
  trackRef: RefObject<HTMLElement | null>
  /** Runs after the view's layout and scroll have settled for an open, a move, or a close. */
  onSettled(change: { kind: 'open' | 'switch'; id: string } | { kind: 'close'; id: string }): void
}

export function useRolesView({ ids, titleOf, trackRef, onSettled }: RolesViewOptions) {
  const [openId, setOpenId] = useState<string | null>(() => journeyAt(window.location.pathname, ids))
  const openRef = useRef(openId)
  const homeYRef = useRef<number | null>(null)
  const pushedRef = useRef(false)
  const titleRef = useRef('')
  const closingRef = useRef(false)
  const backPendingRef = useRef(false)
  const returnRef = useRef<HTMLParagraphElement>(null)
  const pendingRef = useRef<{ kind: 'open' | 'switch'; id: string } | { kind: 'close'; id: string; y: number | null } | null>(null)

  const enter = useCallback((id: string, kind: 'open' | 'switch') => {
    if (!titleRef.current) titleRef.current = document.title
    document.title = titleOf(id)
    document.documentElement.classList.add(ROLES_OPEN)
    openRef.current = id
    pendingRef.current = { kind, id }
    setOpenId(id)
  }, [titleOf])

  const leave = useCallback(() => {
    const id = openRef.current
    if (!id || closingRef.current) return
    closingRef.current = true
    if (titleRef.current) document.title = titleRef.current
    document.documentElement.classList.remove(ROLES_OPEN)
    const y = homeYRef.current
    homeYRef.current = null
    openRef.current = null
    pendingRef.current = { kind: 'close', id, y }
    setOpenId(null)
  }, [])

  const open = useCallback((id: string) => {
    if (openRef.current) return
    homeYRef.current = pageScrollY()
    window.history.scrollRestoration = 'manual'
    window.history.pushState({ role: id }, '', journeyPath(id))
    pushedRef.current = true
    enter(id, 'open')
  }, [enter])

  const switchTo = useCallback((id: string) => {
    if (!openRef.current || openRef.current === id) return
    window.history.replaceState({ role: id }, '', journeyPath(id))
    enter(id, 'switch')
  }, [enter])

  const back = useCallback(() => {
    if (!openRef.current || closingRef.current || backPendingRef.current) return
    if (pushedRef.current) {
      backPendingRef.current = true
      window.history.back()
      return
    }
    window.history.replaceState(null, '', '/')
    leave()
  }, [leave])

  useEffect(() => {
    const onPop = () => {
      const at = journeyAt(window.location.pathname, ids)
      if (at && !openRef.current) {
        pushedRef.current = true
        homeYRef.current = pageScrollY()
        enter(at, 'open')
      } else if (!at && openRef.current) {
        pushedRef.current = false
        backPendingRef.current = false
        leave()
      }
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && openRef.current) back() }
    window.addEventListener('popstate', onPop)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('keydown', onKey)
    }
  }, [ids, enter, leave, back])

  const blocked = useCallback(() => closingRef.current || backPendingRef.current, [])
  useReturnAtEnd(openId !== null, back, returnRef, blocked)

  // A direct load of a role's path opens its journey before the first paint.
  useLayoutEffect(() => {
    if (!openRef.current) return
    titleRef.current = document.title
    document.title = titleOf(openRef.current)
    document.documentElement.classList.add(ROLES_OPEN)
    pendingRef.current = { kind: 'open', id: openRef.current }
    return () => document.documentElement.classList.remove(ROLES_OPEN)
  }, [titleOf])

  // After a change commits, the scroll lands at the journey's start or back at the home offset, and the caller
  // hears about it in the same frame, before any frame draws with the old layout.
  useLayoutEffect(() => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    let y: number
    if (pending.kind === 'close') {
      const row = document.getElementById(`role-${pending.id}`)
      y = pending.y ?? (row ? row.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.2 : 0)
    } else {
      const track = trackRef.current
      y = track ? track.getBoundingClientRect().top + window.scrollY : 0
    }
    const lenis = lenisRef.current
    if (lenis) {
      lenis.resize()
      lenis.scrollTo(y, { immediate: true, force: true })
    } else window.scrollTo({ top: y, behavior: 'instant' })
    onSettled(pending.kind === 'close' ? { kind: 'close', id: pending.id } : pending)
    if (pending.kind === 'close') {
      closingRef.current = false
      backPendingRef.current = false
    }
    const resync = requestAnimationFrame(() => {
      const live = lenisRef.current
      if (live && Math.abs(live.animatedScroll - window.scrollY) > 0.5) live.scrollTo(window.scrollY, { immediate: true, force: true })
    })
    return () => cancelAnimationFrame(resync)
  }, [openId, trackRef, onSettled])

  return { openId, open, switchTo, back, returnRef }
}
