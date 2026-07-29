import { useState, useEffect, useRef, type MouseEvent } from 'react'

const links = [
  { href: '#top', label: 'Home' },
  { href: '#journey', label: 'Journey' },
  { href: '#projects', label: 'Projects' },
  { href: '#life', label: 'Beyond' },
  { href: '#skills', label: 'Skills' },
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

  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('section[id]'))
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
    event.preventDefault()
    setMenuOpen(false)
    activeRef.current = href
    setActive(href)
    if (href === '#top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      window.history.replaceState(null, '', window.location.pathname)
      return
    }

    const scrollToTarget = (behavior: ScrollBehavior = 'smooth') => {
      const target = document.querySelector(href)
      if (!target) return

      const top = target.getBoundingClientRect().top + window.scrollY - 62
      window.scrollTo({ top, behavior })
    }

    scrollToTarget()
    window.setTimeout(() => scrollToTarget(), 550)
    window.setTimeout(() => scrollToTarget('auto'), 1250)
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
    return () => window.removeEventListener('resize', closeOnResize)
  }, [])

  return (
    <header className={`nav ${hidden ? 'nav--hidden' : ''} ${scrolled ? 'nav--scrolled' : ''}`}>
      <nav id="nav-menu" className={`nav__menu ${menuOpen ? 'is-open' : ''}`}>
        {links.map(l => (
          <a
            key={l.href}
            href={l.href}
            data-target-cursor="off"
            className={active === l.href ? 'is-active' : ''}
            onClick={(event) => handleClick(event, l.href)}
          >
            {l.label}
          </a>
        ))}
      </nav>
      <button
        type="button"
        className={`nav__toggle ${menuOpen ? 'is-active' : ''}`}
        onClick={toggleMenu}
        aria-label="Toggle navigation"
        aria-expanded={menuOpen}
        aria-controls="nav-menu"
      >
        <span /><span /><span />
      </button>
    </header>
  )
}
