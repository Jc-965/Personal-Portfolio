import { useEffect, useRef } from 'react'

export default function PencilCursor() {
  const cursorRef = useRef<HTMLDivElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const pos = useRef({ x: 0, y: 0 })
  const target = useRef({ x: 0, y: 0 })
  const isHovering = useRef(false)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      target.current = { x: e.clientX, y: e.clientY }

      // Check if hovering a clickable element
      const el = e.target as HTMLElement
      const clickable = el.closest('button, a, [role="button"], .sp-paper--hoverable')
      isHovering.current = !!clickable
    }

    const animate = () => {
      const dx = target.current.x - pos.current.x
      const dy = target.current.y - pos.current.y
      pos.current.x += dx * 0.15
      pos.current.y += dy * 0.15

      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px)`
        cursorRef.current.classList.toggle('sp-cursor--hover', isHovering.current)
      }
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${target.current.x}px, ${target.current.y}px)`
      }

      raf = requestAnimationFrame(animate)
    }

    let raf = requestAnimationFrame(animate)
    window.addEventListener('mousemove', onMove)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
    }
  }, [])

  return (
    <>
      {/* Precise dot at exact mouse position */}
      <div ref={dotRef} className="sp-cursor-dot" aria-hidden="true" />
      {/* Trailing pencil icon */}
      <div ref={cursorRef} className="sp-cursor" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="sp-cursor__icon">
          {/* Pencil shape */}
          <path
            d="M4 20 L6 14 L17 3 L21 7 L10 18 Z"
            fill="rgba(30, 25, 18, 0.08)"
            stroke="rgba(30, 25, 18, 0.55)"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Tip */}
          <path
            d="M4 20 L6 14 L10 18 Z"
            fill="rgba(30, 25, 18, 0.15)"
            stroke="rgba(30, 25, 18, 0.55)"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {/* Eraser */}
          <path
            d="M17 3 L21 7 L19.5 8.5 L15.5 4.5 Z"
            fill="rgba(192, 57, 43, 0.3)"
            stroke="rgba(30, 25, 18, 0.4)"
            strokeWidth="1"
          />
          {/* Pencil tip point */}
          <circle cx="4" cy="20" r="1.2" fill="rgba(30, 25, 18, 0.7)" />
        </svg>
      </div>
    </>
  )
}
