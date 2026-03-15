import { useRef, useEffect, useState, useCallback } from 'react'
import { gsap } from 'gsap'
import { useGyroscope } from '../context/GyroscopeContext'

export interface MagicBentoItem {
  id: string
  icon: React.ReactNode
  title: string
  subtitle: string
  bullets: string[]
  stats: { label: string; value: string }[]
  accent: string
  feature?: {
    variant?: 'metrics' | 'app'
    eyebrow: string
    title: string
    tags: string[]
    meters: { label: string; value: string; level: number }[]
    notifications?: string[]
  }
}

export interface MagicBentoProps {
  items: MagicBentoItem[]
  textAutoHide?: boolean
  enableStars?: boolean
  enableSpotlight?: boolean
  enableBorderGlow?: boolean
  disableAnimations?: boolean
  spotlightRadius?: number
  particleCount?: number
  enableTilt?: boolean
  glowColor?: string
  clickEffect?: boolean
  enableMagnetism?: boolean
}

const DEFAULT_PARTICLE_COUNT = 12
const DEFAULT_SPOTLIGHT_RADIUS = 300
const DEFAULT_GLOW_COLOR = '132, 0, 255'
const MOBILE_BREAKPOINT = 768
const APP_QR_PATTERN = [
  1, 1, 1, 0, 1,
  1, 0, 1, 1, 0,
  1, 1, 0, 1, 1,
  0, 1, 1, 0, 1,
  1, 0, 1, 1, 1,
]

const createParticleElement = (x: number, y: number, color: string) => {
  const el = document.createElement('div')
  el.className = 'magic-bento__particle'
  el.style.left = `${x}px`
  el.style.top = `${y}px`
  el.style.background = `rgba(${color}, 1)`
  el.style.boxShadow = `0 0 10px rgba(${color}, 0.6)`
  return el
}

const calculateSpotlightValues = (radius: number) => ({
  proximity: radius * 0.5,
  fadeDistance: radius * 0.75,
})

const updateCardGlowProperties = (card: HTMLElement, mouseX: number, mouseY: number, glow: number, radius: number) => {
  const rect = card.getBoundingClientRect()
  const relativeX = ((mouseX - rect.left) / rect.width) * 100
  const relativeY = ((mouseY - rect.top) / rect.height) * 100

  card.style.setProperty('--glow-x', `${relativeX}%`)
  card.style.setProperty('--glow-y', `${relativeY}%`)
  card.style.setProperty('--glow-intensity', glow.toString())
  card.style.setProperty('--glow-radius', `${radius}px`)
}

function useMobileDetection() {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  return isMobile
}

function useParticles(
  cardRef: React.RefObject<HTMLDivElement>,
  enabled: boolean,
  particleCount: number,
  glowColor: string
) {
  const particlesRef = useRef<HTMLDivElement[]>([])
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const templatesRef = useRef<HTMLDivElement[]>([])
  const initializedRef = useRef(false)

  const initializeParticles = useCallback(() => {
    if (initializedRef.current || !cardRef.current) return
    const { width, height } = cardRef.current.getBoundingClientRect()
    templatesRef.current = Array.from({ length: particleCount }, () =>
      createParticleElement(Math.random() * width, Math.random() * height, glowColor)
    )
    initializedRef.current = true
  }, [cardRef, particleCount, glowColor])

  const clearParticles = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout)
    timeoutsRef.current = []
    particlesRef.current.forEach(particle => {
      gsap.to(particle, {
        scale: 0,
        opacity: 0,
        duration: 0.25,
        ease: 'power2.in',
        onComplete: () => particle.remove(),
      })
    })
    particlesRef.current = []
  }, [])

  const spawnParticles = useCallback(() => {
    if (!enabled || !cardRef.current) return
    initializeParticles()

    templatesRef.current.forEach((particle, index) => {
      const timeout = setTimeout(() => {
        if (!cardRef.current) return
        const clone = particle.cloneNode(true) as HTMLDivElement
        cardRef.current.appendChild(clone)
        particlesRef.current.push(clone)

        gsap.fromTo(clone, { scale: 0, opacity: 0 }, { scale: 1, opacity: 0.7, duration: 0.25, ease: 'power2.out' })
        gsap.to(clone, {
          x: (Math.random() - 0.5) * 80,
          y: (Math.random() - 0.5) * 80,
          duration: 1.8 + Math.random(),
          ease: 'none',
          repeat: -1,
          yoyo: true,
        })
        gsap.to(clone, {
          opacity: 0.2,
          duration: 1.2,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
      }, index * 70)

      timeoutsRef.current.push(timeout)
    })
  }, [cardRef, enabled, initializeParticles])

  return { clearParticles, spawnParticles }
}

function InteractiveCard({
  item,
  index,
  textAutoHide,
  enableStars,
  shouldDisableAnimations,
  particleCount,
  glowColor,
  enableTilt,
  clickEffect,
  enableMagnetism,
  enableBorderGlow,
  isMobile,
}: {
  item: MagicBentoItem
  index: number
  textAutoHide: boolean
  enableStars: boolean
  shouldDisableAnimations: boolean
  particleCount: number
  glowColor: string
  enableTilt: boolean
  clickEffect: boolean
  enableMagnetism: boolean
  enableBorderGlow: boolean
  isMobile: boolean
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const magnetTweenRef = useRef<gsap.core.Tween | null>(null)
  const gyro = useGyroscope()
  const { clearParticles, spawnParticles } = useParticles(cardRef, enableStars && !shouldDisableAnimations, particleCount, glowColor)

  // Gyroscope-driven tilt on mobile
  useEffect(() => {
    const el = cardRef.current
    if (!el || !isMobile || !gyro.permitted || !enableTilt) return

    return gyro.subscribe((gx, gy) => {
      gsap.set(el, {
        rotateX: gy * -6,
        rotateY: gx * 6,
        transformPerspective: 800,
      })
    })
  }, [isMobile, gyro, enableTilt])

  useEffect(() => {
    const el = cardRef.current
    if (!el || shouldDisableAnimations) return

    const handleMouseEnter = () => {
      if (enableStars) spawnParticles()
    }

    const handleMouseLeave = () => {
      clearParticles()
      gsap.to(el, {
        rotateX: 0,
        rotateY: 0,
        x: 0,
        y: 0,
        duration: 0.28,
        ease: 'power2.out',
      })
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const centerX = rect.width / 2
      const centerY = rect.height / 2

      if (enableTilt) {
        gsap.to(el, {
          rotateX: ((y - centerY) / centerY) * -8,
          rotateY: ((x - centerX) / centerX) * 8,
          duration: 0.12,
          ease: 'power2.out',
          transformPerspective: 1000,
        })
      }

      if (enableMagnetism) {
        magnetTweenRef.current?.kill()
        magnetTweenRef.current = gsap.to(el, {
          x: (x - centerX) * 0.035,
          y: (y - centerY) * 0.035,
          duration: 0.22,
          ease: 'power2.out',
        })
      }
    }

    const handleClick = (e: MouseEvent) => {
      if (!clickEffect) return

      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      const maxDistance = Math.max(
        Math.hypot(x, y),
        Math.hypot(x - rect.width, y),
        Math.hypot(x, y - rect.height),
        Math.hypot(x - rect.width, y - rect.height)
      )

      const ripple = document.createElement('div')
      ripple.className = 'magic-bento__ripple'
      ripple.style.width = `${maxDistance * 2}px`
      ripple.style.height = `${maxDistance * 2}px`
      ripple.style.left = `${x - maxDistance}px`
      ripple.style.top = `${y - maxDistance}px`
      ripple.style.background = `radial-gradient(circle, rgba(${glowColor}, 0.28) 0%, rgba(${glowColor}, 0.16) 35%, transparent 72%)`
      el.appendChild(ripple)

      gsap.fromTo(
        ripple,
        { scale: 0, opacity: 1 },
        {
          scale: 1,
          opacity: 0,
          duration: 0.8,
          ease: 'power2.out',
          onComplete: () => ripple.remove(),
        }
      )
    }

    el.addEventListener('mouseenter', handleMouseEnter)
    el.addEventListener('mouseleave', handleMouseLeave)
    el.addEventListener('mousemove', handleMouseMove)
    el.addEventListener('click', handleClick)

    return () => {
      magnetTweenRef.current?.kill()
      el.removeEventListener('mouseenter', handleMouseEnter)
      el.removeEventListener('mouseleave', handleMouseLeave)
      el.removeEventListener('mousemove', handleMouseMove)
      el.removeEventListener('click', handleClick)
      clearParticles()
    }
  }, [clearParticles, clickEffect, enableMagnetism, enableStars, enableTilt, glowColor, shouldDisableAnimations, spawnParticles])

  const className = [
    'magic-bento-card',
    index === 0 ? 'magic-bento-card--featured' : '',
    textAutoHide ? 'magic-bento-card--text-autohide' : '',
    enableBorderGlow ? 'magic-bento-card--border-glow' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <article
      ref={cardRef}
      className={className}
      data-cursor
      style={
        {
          '--magic-accent': item.accent,
          '--magic-glow-color': glowColor,
        } as React.CSSProperties
      }
    >
      <div className="magic-bento-card__grid" />
      <div className="magic-bento-card__header">
        <div className="magic-bento-card__badge">{item.icon}</div>
        <div className="magic-bento-card__titles">
          <h3>{item.title}</h3>
          <span className="magic-bento-card__subtitle">{item.subtitle}</span>
        </div>
      </div>

      <div className="magic-bento-card__stats">
        {item.stats.map(stat => (
          <div key={stat.label} className="magic-bento-card__stat">
            <span className="magic-bento-card__stat-label">{stat.label}</span>
            <span className="magic-bento-card__stat-value">{stat.value}</span>
          </div>
        ))}
      </div>

      <ul className="magic-bento-card__list">
        {item.bullets.map(bullet => (
          <li key={bullet}>
            <span className="magic-bento-card__bullet">›</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>

      {item.feature ? (
        item.feature.variant === 'app' ? (
          <div className="magic-bento-card__feature magic-bento-card__feature--app">
            <div className="magic-bento-card__app-shell">
              <div className="magic-bento-card__app-phone">
                <div className="magic-bento-card__app-statusbar">
                  <span>9:41</span>
                  <span>AHS</span>
                </div>
                <div className="magic-bento-card__app-hero">
                  <span className="magic-bento-card__app-eyebrow">{item.feature.eyebrow}</span>
                  <span className="magic-bento-card__app-title">{item.feature.title}</span>
                </div>
                <div className="magic-bento-card__app-pass">
                  <div className="magic-bento-card__app-pass-head">
                    <div>
                      <div className="magic-bento-card__app-pass-label">Digital ID</div>
                      <div className="magic-bento-card__app-pass-name">Library Check-In Ready</div>
                    </div>
                    <span className="magic-bento-card__app-pass-badge">ACTIVE</span>
                  </div>
                  <div className="magic-bento-card__app-pass-body">
                    <div className="magic-bento-card__app-qr">
                      {APP_QR_PATTERN.map((cell, qrIndex) => (
                        <span
                          key={qrIndex}
                          className={`magic-bento-card__app-qr-cell${cell ? ' is-on' : ''}`}
                        />
                      ))}
                    </div>
                    <div className="magic-bento-card__app-pass-meta">
                      <span>Tap or scan for student access</span>
                    </div>
                  </div>
                </div>
                <div className="magic-bento-card__app-shortcuts">
                  {item.feature.tags.slice(0, 4).map(tag => (
                    <span key={tag} className="magic-bento-card__app-shortcut">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="magic-bento-card__app-side">
              <div className="magic-bento-card__app-stack">
                {(item.feature.notifications ?? []).map(note => (
                  <div key={note} className="magic-bento-card__app-note">
                    <span className="magic-bento-card__app-note-dot" />
                    <span>{note}</span>
                  </div>
                ))}
              </div>
              <div className="magic-bento-card__app-signals">
                {item.feature.meters.map(meter => (
                  <div key={meter.label} className="magic-bento-card__app-signal">
                    <div className="magic-bento-card__app-signal-head">
                      <span>{meter.label}</span>
                      <span>{meter.value}</span>
                    </div>
                    <div className="magic-bento-card__app-signal-track">
                      <span
                        className="magic-bento-card__app-signal-fill"
                        style={{ width: `${meter.level}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
        <div className="magic-bento-card__feature">
          <div className="magic-bento-card__feature-top">
            <span className="magic-bento-card__feature-eyebrow">{item.feature.eyebrow}</span>
            <span className="magic-bento-card__feature-status">
              <span className="magic-bento-card__feature-dot" />
              online
            </span>
          </div>
          <div className="magic-bento-card__feature-title">{item.feature.title}</div>
          <div className="magic-bento-card__feature-tags">
            {item.feature.tags.map(tag => (
              <span key={tag} className="magic-bento-card__feature-tag">
                {tag}
              </span>
            ))}
          </div>
          <div className="magic-bento-card__feature-meters">
            {item.feature.meters.map(meter => (
              <div key={meter.label} className="magic-bento-card__feature-meter">
                <div className="magic-bento-card__feature-meter-head">
                  <span>{meter.label}</span>
                  <span>{meter.value}</span>
                </div>
                <div className="magic-bento-card__feature-track">
                  <span
                    className="magic-bento-card__feature-fill"
                    style={{ width: `${meter.level}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        )
      ) : null}
    </article>
  )
}

function GlobalSpotlight({
  gridRef,
  enabled,
  disableAnimations,
  spotlightRadius,
  glowColor,
}: {
  gridRef: React.RefObject<HTMLDivElement>
  enabled: boolean
  disableAnimations: boolean
  spotlightRadius: number
  glowColor: string
}) {
  const spotlightRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!enabled || disableAnimations || !gridRef.current) return

    const spotlight = document.createElement('div')
    spotlight.className = 'magic-bento__spotlight'
    spotlight.style.background = `radial-gradient(circle, rgba(${glowColor}, 0.14) 0%, rgba(${glowColor}, 0.06) 22%, rgba(${glowColor}, 0.02) 40%, transparent 70%)`
    document.body.appendChild(spotlight)
    spotlightRef.current = spotlight

    const handleMouseMove = (e: MouseEvent) => {
      if (!spotlightRef.current || !gridRef.current) return

      const rect = gridRef.current.getBoundingClientRect()
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom

      const cards = Array.from(gridRef.current.querySelectorAll<HTMLElement>('.magic-bento-card'))
      if (!inside) {
        gsap.to(spotlightRef.current, { opacity: 0, duration: 0.25, ease: 'power2.out' })
        cards.forEach(card => card.style.setProperty('--glow-intensity', '0'))
        return
      }

      const { proximity, fadeDistance } = calculateSpotlightValues(spotlightRadius)
      let minDistance = Infinity

      cards.forEach(card => {
        const cardRect = card.getBoundingClientRect()
        const centerX = cardRect.left + cardRect.width / 2
        const centerY = cardRect.top + cardRect.height / 2
        const distance =
          Math.hypot(e.clientX - centerX, e.clientY - centerY) - Math.max(cardRect.width, cardRect.height) / 2
        const effectiveDistance = Math.max(0, distance)

        minDistance = Math.min(minDistance, effectiveDistance)

        let glow = 0
        if (effectiveDistance <= proximity) glow = 1
        else if (effectiveDistance <= fadeDistance) glow = (fadeDistance - effectiveDistance) / (fadeDistance - proximity)

        updateCardGlowProperties(card, e.clientX, e.clientY, glow, spotlightRadius)
      })

      gsap.to(spotlightRef.current, {
        left: e.clientX,
        top: e.clientY,
        opacity:
          minDistance <= proximity
            ? 0.8
            : minDistance <= fadeDistance
              ? ((fadeDistance - minDistance) / (fadeDistance - proximity)) * 0.8
              : 0,
        duration: 0.12,
        ease: 'power2.out',
      })
    }

    const handleMouseLeave = () => {
      if (!spotlightRef.current || !gridRef.current) return
      gsap.to(spotlightRef.current, { opacity: 0, duration: 0.25, ease: 'power2.out' })
      Array.from(gridRef.current.querySelectorAll<HTMLElement>('.magic-bento-card')).forEach(card => {
        card.style.setProperty('--glow-intensity', '0')
      })
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeave)
      spotlightRef.current?.remove()
    }
  }, [disableAnimations, enabled, glowColor, gridRef, spotlightRadius])

  return null
}

export default function MagicBento({
  items,
  textAutoHide = true,
  enableStars = false,
  enableSpotlight = true,
  enableBorderGlow = true,
  disableAnimations = false,
  spotlightRadius = DEFAULT_SPOTLIGHT_RADIUS,
  particleCount = DEFAULT_PARTICLE_COUNT,
  enableTilt = true,
  glowColor = DEFAULT_GLOW_COLOR,
  clickEffect = true,
  enableMagnetism = true,
}: MagicBentoProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const isMobile = useMobileDetection()
  const shouldDisableAnimations = disableAnimations || isMobile

  return (
    <>
      <GlobalSpotlight
        gridRef={gridRef}
        enabled={enableSpotlight}
        disableAnimations={shouldDisableAnimations}
        spotlightRadius={spotlightRadius}
        glowColor={glowColor}
      />

      <div ref={gridRef} className="magic-bento-grid">
        {items.map((item, index) => (
          <InteractiveCard
            key={item.id}
            item={item}
            index={index}
            textAutoHide={textAutoHide}
            enableStars={enableStars}
            shouldDisableAnimations={shouldDisableAnimations}
            particleCount={particleCount}
            glowColor={glowColor}
            enableTilt={enableTilt}
            clickEffect={clickEffect}
            enableMagnetism={enableMagnetism}
            enableBorderGlow={enableBorderGlow}
            isMobile={isMobile}
          />
        ))}
      </div>
    </>
  )
}
