import { useState, useEffect, useRef, type MouseEvent } from 'react'

const links = [
  { href: '#top', label: 'Home' },
  { href: '#journey', label: 'Journey' },
  { href: '#projects', label: 'Projects' },
  { href: '#life', label: 'Beyond' },
  { href: '#skills', label: 'Skills' },
  { href: '#contact', label: 'Contact' },
]

export default function Navbar() {
  const [active, setActive] = useState('#top')
  const [menuOpen, setMenuOpen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const lastY = useRef(0)
  const activeRef = useRef('#top')
  const hiddenRef = useRef(false)
  const scrolledRef = useRef(false)
  const headerRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const scrollTimers = useRef<number[]>([])
  // After a click the spy stays on that link until the scroll lands, so the underline cannot flicker.
  const spyLock = useRef<{ href: string; landedAt: number | null } | null>(null)

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('section[id], footer[id]'))
    const desktopNav = window.matchMedia('(min-width: 769px)')
    let sectionMetrics: Array<{ id: string; top: number; height: number }> = []
    let timeout = 0
    let measureFrame = 0

    const measureSections = () => {
      measureFrame = 0
      const scrollY = window.scrollY
      sectionMetrics = sections.map(section => {
        const rect = section.getBoundingClientRect()
        return { id: section.id, top: rect.top + scrollY, height: rect.height }
      })
    }

    const update = () => {
      const scrollY = window.scrollY
      const windowH = window.innerHeight
      const lock = spyLock.current
      if (lock) {
        // Hold the clicked link while the page travels, and keep holding it after
        // landing until the reader scrolls at least 40px away on their own.
        if (lock.landedAt === null) {
          const target = lock.href === '#top' ? 0 : (sectionMetrics.find(s => `#${s.id}` === lock.href)?.top ?? -1) - (window.innerWidth <= 768 ? 80 : 96)
          if (target >= 0 && Math.abs(scrollY - Math.max(0, target)) < 8) lock.landedAt = scrollY
        }
        if (lock.landedAt === null || Math.abs(scrollY - lock.landedAt) < 40) {
          if (activeRef.current !== lock.href) { activeRef.current = lock.href; setActive(lock.href) }
          return
        }
        spyLock.current = null
      }
      let best: string | null = null
      let maxVis = 0

      sectionMetrics.forEach(({ id, top, height }) => {
        const viewportTop = top - scrollY
        const visTop = Math.max(scrollY, top)
        const visBot = Math.min(scrollY + windowH, top + height)
        const visH = Math.max(0, visBot - visTop)
        const weight = 1 - Math.min(Math.abs(viewportTop) / windowH, 1) * 0.5
        const vis = visH * weight
        if (vis > maxVis) { maxVis = vis; best = `#${id}` }
      })

      if (best && best !== activeRef.current) {
        activeRef.current = best
        setActive(best)
      }
    }

    const scheduleMeasure = () => {
      if (measureFrame) return
      measureFrame = window.requestAnimationFrame(() => {
        measureSections()
        update()
      })
    }

    const onScroll = () => {
      // Auto-hide on scroll-down, reveal on scroll-up / near top (kept out of
      // the debounce so it feels immediate).
      const y = window.scrollY
      const shouldAutoHide = desktopNav.matches
      const nextScrolled = y > 12
      if (nextScrolled !== scrolledRef.current) {
        scrolledRef.current = nextScrolled
        setScrolled(nextScrolled)
      }
      const goingDown = y > lastY.current + 4
      const goingUp = y < lastY.current - 4
      let nextHidden = hiddenRef.current
      if (!shouldAutoHide || menuOpen || y < 120) nextHidden = false
      else if (goingDown) nextHidden = true
      else if (goingUp) nextHidden = false
      if (nextHidden !== hiddenRef.current) {
        hiddenRef.current = nextHidden
        setHidden(nextHidden)
      }
      lastY.current = y

      if (timeout) return
      timeout = window.setTimeout(() => { update(); timeout = 0 }, 50)
    }

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure)
    sections.forEach(section => resizeObserver?.observe(section))
    window.addEventListener('resize', scheduleMeasure, { passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    measureSections()
    update()
    return () => {
      if (timeout) window.clearTimeout(timeout)
      if (measureFrame) window.cancelAnimationFrame(measureFrame)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', scheduleMeasure)
      window.removeEventListener('scroll', onScroll)
    }
  }, [menuOpen])

  const handleClick = (event: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    scrollTimers.current.forEach(window.clearTimeout)
    scrollTimers.current = []
    setMenuOpen(false)
    activeRef.current = href
    setActive(href)
    spyLock.current = { href, landedAt: null }
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    if (href === '#top') {
      window.scrollTo({ top: 0, behavior })
      window.history.replaceState(null, '', window.location.pathname)
      scrollTimers.current = [window.setTimeout(() => { if (spyLock.current && spyLock.current.landedAt === null) spyLock.current.landedAt = window.scrollY }, 1700)]
      return
    }

    const scrollToTarget = (scrollBehavior: ScrollBehavior = behavior) => {
      const target = document.querySelector(href)
      if (!target) return

      const offset = window.innerWidth <= 768 ? 80 : 96
      const top = target.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top, behavior: scrollBehavior })
    }

    scrollToTarget()
    scrollTimers.current = [
      window.setTimeout(() => scrollToTarget(), 550),
      window.setTimeout(() => scrollToTarget('auto'), 1250),
      window.setTimeout(() => { if (spyLock.current && spyLock.current.landedAt === null) spyLock.current.landedAt = window.scrollY }, 1700),
    ]
    window.history.replaceState(null, '', href)
  }

  const toggleMenu = () => {
    hiddenRef.current = false
    setHidden(false)
    setMenuOpen(open => !open)
  }

  useEffect(() => {
    const closeOnResize = () => {
      if (window.innerWidth > 768) setMenuOpen(false)
    }
    window.addEventListener('resize', closeOnResize, { passive: true })
    return () => {
      window.removeEventListener('resize', closeOnResize)
      scrollTimers.current.forEach(window.clearTimeout)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      toggleRef.current?.focus()
    }
    const closeOutside = (event: PointerEvent | FocusEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('focusin', closeOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('focusin', closeOutside)
    }
  }, [menuOpen])

  return (
    <header ref={headerRef} className={`nav ${hidden ? 'nav--hidden' : ''} ${scrolled ? 'nav--scrolled' : ''} ${menuOpen ? 'nav--open' : ''}`}>
      <button
        ref={toggleRef}
        type="button"
        className={`nav__toggle ${menuOpen ? 'is-active' : ''}`}
        onClick={toggleMenu}
        aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
        aria-expanded={menuOpen}
        aria-controls="nav-menu"
      >
        <span aria-hidden="true">[</span>
        <span className="nav__toggle-word">{menuOpen ? 'close' : 'menu'}</span>
        <span aria-hidden="true">]</span>
      </button>
      <nav id="nav-menu" aria-label="Main navigation" className={`nav__menu ${menuOpen ? 'is-open' : ''}`}>
        <span className="nav__caption" aria-hidden="true">// index</span>
        {links.map(l => (
          <a
            key={l.href}
            href={l.href}
            data-target-cursor="off"
            className={`${active === l.href ? 'is-active' : ''} ${l.href === '#contact' ? 'nav__contact' : ''}`}
            aria-current={active === l.href ? 'location' : undefined}
            onClick={(event) => handleClick(event, l.href)}
          >
            {l.label}
            {l.href === '#contact' && <span aria-hidden="true">↗</span>}
          </a>
        ))}
      </nav>
    </header>
  )
}
