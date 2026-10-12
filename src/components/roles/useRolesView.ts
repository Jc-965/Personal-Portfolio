/**
 * Which role's journey is open, and the moves between the home page's rows and a journey. Opening pushes `/<id>`,
 * adds roles-open to the root (which hides every other section), and scrolls to the journey's start. Moving to
 * another role (the stops rail, or scrolling on past a journey's end) replaces the entry, so Back always returns
 * home. Closing (the back control, Escape, the browser's Back, or scrolling on past the last role's end) lands on
 * the current role's row.
 *
 * A switch or a close first runs a leave phase of `onLeave`'s milliseconds, with the root's roles-leaving class
 * fading the journey's copy and the page held still, and only then changes the page. One move runs at a time.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { lenisRef } from '../../scroll/lenisRef'
import { useReturnAtEnd } from '../chapter/stageHooks'
import { prefersReduced } from '../chapter/dom'
import { journeyAt, journeyPath } from '../teardown/route'
import { EXPAND_MS, FORM_MS } from './timing'

/** The root class while a role's journey is open. roles.css hides everything else under it. */
export const ROLES_OPEN = 'roles-open'
/** The root class during a leave phase. roles.css fades the journey's copy under it. */
export const ROLES_LEAVING = 'roles-leaving'

export interface RolesViewOptions {
  ids: readonly string[]
  titleOf(id: string): string
  /** The open journey's pinned track. */
  trackRef: RefObject<HTMLElement | null>
  /** Starts a leave phase and returns its length in milliseconds. */
  onLeave(kind: 'switch' | 'close'): number
  /** Runs after the view's layout and scroll have settled for an open, a move, or a close. */
  onSettled(change: { kind: 'open' | 'switch' | 'close'; id: string }): void
}

export function useRolesView({ ids, titleOf, trackRef, onLeave, onSettled }: RolesViewOptions) {
  const [openId, setOpenId] = useState<string | null>(() => journeyAt(window.location.pathname, ids))
  const openRef = useRef(openId)
  const pushedRef = useRef(false)
  const titleRef = useRef('')
  /** True from the start of a switch or a close until the page has settled after it. */
  const movingRef = useRef(false)
  const backPendingRef = useRef(false)
  const returnRef = useRef<HTMLParagraphElement>(null)
  const pendingRef = useRef<{ kind: 'open' | 'switch' | 'close'; id: string } | null>(null)

  const enter = useCallback((id: string, kind: 'open' | 'switch') => {
    if (!titleRef.current) titleRef.current = document.title
    document.title = titleOf(id)
    document.documentElement.classList.add(ROLES_OPEN)
    openRef.current = id
    pendingRef.current = { kind, id }
    setOpenId(id)
  }, [titleOf])

  /**
   * Runs `change` after a leave phase of `kind`, holding the page still from the start of the leave until `settle`
   * milliseconds after the change.
   */
  const afterLeave = useCallback((kind: 'switch' | 'close', settle: number, change: () => void) => {
    movingRef.current = true
    const lenis = lenisRef.current
    lenis?.stop()
    const reduced = prefersReduced()
    if (!reduced) document.documentElement.classList.add(ROLES_LEAVING)
    const wait = reduced ? 0 : onLeave(kind)
    window.setTimeout(() => {
      document.documentElement.classList.remove(ROLES_LEAVING)
      change()
      window.setTimeout(() => {
        movingRef.current = false
        backPendingRef.current = false
        lenis?.start()
      }, reduced ? 0 : settle)
    }, wait)
  }, [onLeave])

  const leave = useCallback(() => {
    const id = openRef.current
    if (!id || movingRef.current) return
    afterLeave('close', EXPAND_MS, () => {
      if (titleRef.current) document.title = titleRef.current
      document.documentElement.classList.remove(ROLES_OPEN)
      openRef.current = null
      pendingRef.current = { kind: 'close', id }
      setOpenId(null)
    })
  }, [afterLeave])

  const open = useCallback((id: string) => {
    if (openRef.current) return
    window.history.scrollRestoration = 'manual'
    window.history.pushState({ role: id }, '', journeyPath(id))
    pushedRef.current = true
    enter(id, 'open')
  }, [enter])

  const switchTo = useCallback((id: string) => {
    if (!openRef.current || openRef.current === id || movingRef.current) return
    afterLeave('switch', FORM_MS * 0.6, () => {
      window.history.replaceState({ role: id }, '', journeyPath(id))
      enter(id, 'switch')
    })
  }, [afterLeave, enter])

  const back = useCallback(() => {
    if (!openRef.current || movingRef.current || backPendingRef.current) return
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
        enter(at, 'open')
      } else if (!at && openRef.current) {
        pushedRef.current = false
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

  // Scrolling on past a journey's end moves to the next role, and past the last role's end returns home.
  const nextId = openId ? ids[ids.indexOf(openId) + 1] ?? null : null
  const advance = useCallback(() => {
    if (nextId) switchTo(nextId)
    else back()
  }, [nextId, switchTo, back])
  const blocked = useCallback(() => movingRef.current || backPendingRef.current, [])
  useReturnAtEnd(openId !== null, advance, returnRef, blocked)

  // A direct load of a role's path opens its journey before the first paint.
  useLayoutEffect(() => {
    if (!openRef.current) return
    titleRef.current = document.title
    document.title = titleOf(openRef.current)
    document.documentElement.classList.add(ROLES_OPEN)
    pendingRef.current = { kind: 'open', id: openRef.current }
    return () => document.documentElement.classList.remove(ROLES_OPEN)
  }, [titleOf])

  // After a change commits, the scroll lands at the journey's start, or with the role's row centred after a close,
  // and the caller hears about it in the same frame, before any frame draws with the old layout.
  useLayoutEffect(() => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    let y = 0
    if (pending.kind === 'close') {
      const row = document.getElementById(`role-${pending.id}`)
      if (row) y = row.getBoundingClientRect().top + window.scrollY + row.offsetHeight / 2 - window.innerHeight / 2
    } else {
      const track = trackRef.current
      if (track) y = track.getBoundingClientRect().top + window.scrollY
    }
    const lenis = lenisRef.current
    if (lenis) {
      lenis.resize()
      lenis.scrollTo(y, { immediate: true, force: true })
    } else window.scrollTo({ top: y, behavior: 'instant' })
    onSettled(pending)
    const resync = requestAnimationFrame(() => {
      const live = lenisRef.current
      if (live && Math.abs(live.animatedScroll - window.scrollY) > 0.5) live.scrollTo(window.scrollY, { immediate: true, force: true })
    })
    return () => cancelAnimationFrame(resync)
  }, [openId, trackRef, onSettled])

  return { openId, nextId, open, switchTo, back, returnRef }
}
