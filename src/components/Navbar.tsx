import { useState, useEffect } from 'react'

const links = [
  { href: '#top', label: 'Home' },
  { href: '#journey', label: 'Journey' },
  { href: '#projects', label: 'Projects' },
  { href: '#skills', label: 'Skills' },
]

export default function Navbar() {
  const [active, setActive] = useState('#top')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const sections = document.querySelectorAll('section[id]')
    let timeout: number

    const update = () => {
      const scrollY = window.scrollY
      const windowH = window.innerHeight
      let best: string | null = null
      let maxVis = 0

      sections.forEach(sec => {
        const rect = sec.getBoundingClientRect()
        const top = rect.top + scrollY
        const visTop = Math.max(scrollY, top)
        const visBot = Math.min(scrollY + windowH, top + rect.height)
        const visH = Math.max(0, visBot - visTop)
        const weight = 1 - Math.min(Math.abs(rect.top) / windowH, 1) * 0.5
        const vis = visH * weight
        if (vis > maxVis) { maxVis = vis; best = `#${sec.id}` }
      })

      if (best) setActive(best)
    }

    const onScroll = () => {
      if (timeout) return
      timeout = window.setTimeout(() => { update(); timeout = 0 }, 50)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleClick = (href: string) => {
    setMenuOpen(false)
    if (href === '#top') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <header className="nav">
      <div className="nav__brand">
        <span className="nav__brand-icon">&gt;_</span>
        Jesse &middot; CMU SCS
      </div>
      <nav className={`nav__menu ${menuOpen ? 'is-open' : ''}`}>
        {links.map(l => (
          <a
            key={l.href}
            href={l.href}
            className={active === l.href ? 'is-active' : ''}
            onClick={() => handleClick(l.href)}
          >
            {l.label}
          </a>
        ))}
      </nav>
      <button
        className={`nav__toggle ${menuOpen ? 'is-active' : ''}`}
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label="Toggle navigation"
      >
        <span /><span /><span />
      </button>
    </header>
  )
}
