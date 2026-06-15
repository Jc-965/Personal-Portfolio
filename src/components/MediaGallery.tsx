import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import WindowFrame from './WindowFrame'
import useIsPhone from '../hooks/useIsPhone'

export interface GalleryImage {
  src: string
  label: string
  alt: string
  aspect: string
  variant?: 'browser' | 'terminal'
}

interface MediaGalleryProps {
  images: GalleryImage[]
  accent: string
  defaultVariant?: 'browser' | 'terminal'
  /** Direction the deck fans toward (peek away from the copy). */
  side?: 'left' | 'right'
}

/**
 * Projects gallery — the active screenshot sits in front of a 3D-fanned deck
 * (depth), navigated with visible prev/next arrows, dots, and a counter so
 * every screenshot is reachable. One card stays in flow to reserve height.
 */
export default function MediaGallery({
  images,
  accent,
  defaultVariant = 'browser',
  side = 'left',
}: MediaGalleryProps) {
  const [active, setActive] = useState(0)
  const isPhone = useIsPhone()
  const n = images.length
  const dir = side === 'right' ? 1 : -1
  const go = (d: number) => setActive((p) => (p + d + n) % n)
  const cards = isPhone
    ? [{ img: images[active], i: active }]
    : images.map((img, i) => ({ img, i }))

  return (
    <div className="gallery" style={{ '--gallery-accent': accent } as React.CSSProperties}>
      <div className="gallery__deck">
        {cards.map(({ img, i }) => {
          if (!img) return null
          const pos = (i - active + n) % n // 0 = front
          const front = pos === 0
          return (
            <motion.div
              key={img.src}
              className={`gallery__card ${i === 0 || isPhone ? 'gallery__card--base' : ''} ${front ? 'is-active' : ''}`}
              aria-hidden={!front}
              initial={false}
              animate={{
                x: `${front ? 0 : dir * pos * 7}%`,
                y: `${front ? 0 : -pos * 6}%`,
                rotate: front ? 0 : dir * pos * 3.6,
                scale: front ? 1 : 1 - pos * 0.06,
                opacity: front ? 1 : Math.max(0.18, 0.66 - (pos - 1) * 0.22),
              }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{ zIndex: n - pos }}
            >
              <WindowFrame
                src={img.src}
                alt={img.alt}
                label={img.label}
                variant={img.variant ?? defaultVariant}
                accent={accent}
                aspect={img.aspect}
                tilt={false}
              />
            </motion.div>
          )
        })}

        {n > 1 && (
          <>
            <button
              type="button"
              className="gallery__nav gallery__nav--prev"
              onClick={() => go(-1)}
              aria-label="Previous screenshot"
              data-cursor
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              className="gallery__nav gallery__nav--next"
              onClick={() => go(1)}
              aria-label="Next screenshot"
              data-cursor
            >
              <ChevronRight size={20} />
            </button>
          </>
        )}
      </div>

      {n > 1 && (
        <div className="gallery__footer">
          <div className="gallery__dots">
            {images.map((img, idx) => (
              <button
                key={img.src}
                type="button"
                className={`gallery__dot ${idx === active ? 'is-active' : ''}`}
                onClick={() => setActive(idx)}
                aria-label={`View ${img.label}`}
                aria-pressed={idx === active}
                data-cursor
              />
            ))}
          </div>
          <span className="gallery__count">
            {String(active + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
          </span>
        </div>
      )}
    </div>
  )
}
