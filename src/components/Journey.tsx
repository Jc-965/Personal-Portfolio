import { useEffect, useRef, useState, memo } from 'react'
import { motion, useInView, useScroll, useReducedMotion } from 'framer-motion'
import {
  Terminal,
  Gamepad2,
  Map,
  GraduationCap,
  FlaskConical,
  Shield,
  BrainCircuit,
} from 'lucide-react'
import PhoneFrame from './PhoneFrame'
import { preloadImage, preloadImages } from '../utils/preloadImage'
import portfolio from '../content/portfolio.json'

interface MediaItem {
  src: string
  label: string
  alt: string
  aspect: string
}

interface ExperienceMedia {
  kind: 'phones' | 'maps'
  items: MediaItem[]
}

interface Experience {
  id: string
  icon: React.ReactNode
  company: string
  role: string
  track: string
  period: string
  location: string
  status?: string
  summary: string
  stack: string[]
  accent: string
  media?: ExperienceMedia
}

const revealEase = [0.22, 1, 0.36, 1] as const

// Presentation-only icons are paired with résumé content from one canonical source.
const experienceIcons = {
  shield: <Shield size={15} />,
  brain: <BrainCircuit size={15} />,
  terminal: <Terminal size={15} />,
  map: <Map size={15} />,
  gamepad: <Gamepad2 size={15} />,
  graduation: <GraduationCap size={15} />,
  flask: <FlaskConical size={15} />,
}

const experiences = portfolio.experiences.map(({ icon, ...experience }) => ({
  ...experience,
  icon: experienceIcons[icon as keyof typeof experienceIcons] ?? <Terminal size={15} />,
})) as unknown as Experience[]

/* Journey media uses a text-integrated tabbed viewer (distinct from the
   Projects deck): labelled "screen" tabs live with the copy and switch a single
   framed shot in the media column. */
function ChapterTabs({
  media,
  active,
  setActive,
}: {
  media: ExperienceMedia
  active: number
  setActive: (i: number) => void
}) {
  return (
    <div className="chapter__views">
      <span className="chapter__views-label">
        {media.kind === 'phones' ? '// screens' : '// views'}
      </span>
      <ul className="chapter__views-list">
        {media.items.map((m, i) => {
          const short = m.label.split(/[·/]/).pop()?.trim() ?? m.label
          return (
            <li key={m.src}>
              <button
                type="button"
                className={`chapter__view ${i === active ? 'is-active' : ''}`}
                onClick={() => setActive(i)}
                aria-pressed={i === active}
                data-cursor
              >
                <span className="chapter__view-caret" aria-hidden="true">&rsaquo;</span>
                {short}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* Map viewport HUD — coordinates chrome, survey grid, crosshair, and a
   pulsing pin so the geospatial chapter reads as live campus tooling. */
function MapFrame({
  item,
  accent,
  priority,
}: {
  item: MediaItem
  accent: string
  priority: boolean
}) {
  return (
    <figure className="map-frame" style={{ '--mf-accent': accent } as React.CSSProperties}>
      <div className="map-frame__chrome">
        <span className="map-frame__coords">40.4433° N · 79.9436° W</span>
        <span className="map-frame__layer">osm · campus · z17</span>
      </div>
      <div className="map-frame__viewport" style={{ aspectRatio: item.aspect }}>
        <img
          className="map-frame__img"
          src={item.src}
          alt={item.alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
        />
        <span className="map-frame__grid" aria-hidden="true" />
        <span className="map-frame__crosshair" aria-hidden="true" />
        <span className="map-frame__pin" aria-hidden="true" />
        <span className="map-frame__tick map-frame__tick--tl" aria-hidden="true" />
        <span className="map-frame__tick map-frame__tick--tr" aria-hidden="true" />
        <span className="map-frame__tick map-frame__tick--bl" aria-hidden="true" />
        <span className="map-frame__tick map-frame__tick--br" aria-hidden="true" />
      </div>
      <figcaption className="map-frame__label">{item.label}</figcaption>
    </figure>
  )
}

/* Fanned deck, same interaction language as the Projects gallery: the active
   shot sits in front and the rest stack behind, swapping places on tab
   change. Tabs stay in the copy column. */
function ChapterMediaView({
  media,
  accent,
  active,
  priority,
}: {
  media: ExperienceMedia
  accent: string
  active: number
  priority: boolean
}) {
  const reduce = useReducedMotion()
  const n = media.items.length
  const phones = media.kind === 'phones'

  return (
    <div className={`chapter__media chapter__media--${media.kind}`}>
      <span className="chapter__media-glow" aria-hidden="true" />
      <div className="chapter__viewer">
        {media.items.map((item, i) => {
          const pos = (i - active + n) % n // 0 = front
          const front = pos === 0
          return (
            <motion.div
              key={item.src}
              className={`chapter__shot ${i === 0 ? 'chapter__shot--base' : ''} ${front ? 'is-active' : ''}`}
              aria-hidden={!front}
              initial={false}
              animate={{
                x: `${front ? 0 : pos * (phones ? 9 : 5)}%`,
                y: `${front ? 0 : -pos * (phones ? 3 : 4.5)}%`,
                rotate: front ? 0 : pos * (phones ? 3 : 1.6),
                scale: front ? 1 : 1 - pos * (phones ? 0.05 : 0.04),
                opacity: front ? 1 : pos > 2 ? 0 : Math.max(0.16, 0.42 - (pos - 1) * 0.18),
              }}
              transition={reduce ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{ zIndex: n - pos }}
            >
              {phones ? (
                <PhoneFrame
                  src={item.src}
                  alt={item.alt}
                  label={item.label}
                  accent={accent}
                  aspect={item.aspect}
                  loading={front && priority ? 'eager' : 'lazy'}
                />
              ) : (
                <MapFrame item={item} accent={accent} priority={front && priority} />
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

const Chapter = memo(function Chapter({ exp }: { exp: Experience }) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, amount: 0.3, margin: '0px 0px -12% 0px' })
  const [active, setActive] = useState(0)
  const select = (i: number) => {
    if (exp.media) preloadImage(exp.media.items[i]?.src)
    setActive(i)
  }

  useEffect(() => {
    if (!exp.media || !inView) return
    preloadImages(exp.media.items.map((item) => item.src))
  }, [exp.media, inView])

  return (
    <motion.article
      ref={ref}
      className={`chapter ${exp.media ? 'chapter--has-media' : ''}`}
      style={{ '--chapter-accent': exp.accent } as React.CSSProperties}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: revealEase }}
    >
      <div className="chapter__aside">
        <span className="chapter__period">{exp.period}</span>
        <span className="chapter__location">{exp.location}</span>
      </div>

      <div className="chapter__spine" aria-hidden="true">
        <span className={`chapter__node ${inView ? 'is-live' : ''}`}>{exp.icon}</span>
      </div>

      <div className="chapter__body">
        <div className="chapter__text">
          <div className="chapter__heading">
            <span className="chapter__track">{exp.track}</span>
          </div>
          <h3 className="chapter__company">{exp.company}</h3>
          <p className="chapter__role">{exp.role}</p>
          <p className="chapter__summary">{exp.summary}</p>
          <div className="chapter__stack">
            {exp.stack.map((s) => (
              <span key={s} className="chapter__chip">{s}</span>
            ))}
          </div>
          {exp.media && <ChapterTabs media={exp.media} active={active} setActive={select} />}
        </div>
        {exp.media && (
          <ChapterMediaView
            media={exp.media}
            accent={exp.accent}
            active={active}
            priority={inView}
          />
        )}
      </div>
    </motion.article>
  )
})

export default function Journey() {
  const headerRef = useRef(null)
  const headerInView = useInView(headerRef, { once: true, margin: '-50px' })
  const timelineRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: timelineRef,
    offset: ['start center', 'end 80%'],
  })

  return (
    <>
      <motion.header
        ref={headerRef}
        className="section__header"
        initial={{ opacity: 0, y: 20 }}
        animate={headerInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.35 }}
      >
        <p className="section__eyebrow">
          <span className="section__eyebrow-icon">&#9670;</span>
          Journey
        </p>
        <h2>From research labs to shipped products</h2>
      </motion.header>

      <div ref={timelineRef} className="timeline">
        <div className="timeline__track" aria-hidden="true">
          <motion.div
            className="timeline__fill"
            style={reduce ? { scaleY: 1 } : { scaleY: scrollYProgress }}
          />
        </div>
        {experiences.map((exp) => (
          <Chapter key={exp.id} exp={exp} />
        ))}
      </div>
    </>
  )
}
