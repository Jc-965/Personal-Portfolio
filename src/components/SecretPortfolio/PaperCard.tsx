import { motion } from 'framer-motion'
import type { ReactNode, CSSProperties } from 'react'

interface PaperCardProps {
  children: ReactNode
  variant?: 'clean' | 'worn' | 'taped' | 'pinned'
  className?: string
  style?: CSSProperties
  tilt?: number
  onClick?: () => void
  hoverable?: boolean
  as?: 'div' | 'article' | 'section'
}

const tapeColors = [
  'rgba(218, 200, 160, 0.7)',
  'rgba(200, 190, 170, 0.65)',
  'rgba(225, 215, 190, 0.6)',
]

export default function PaperCard({
  children,
  variant = 'clean',
  className = '',
  style,
  tilt = 0,
  onClick,
  hoverable = false,
  as: Tag = 'div',
}: PaperCardProps) {
  const MotionTag = motion.create(Tag)
  const tapeColor = tapeColors[Math.abs(tilt * 100) % tapeColors.length]

  return (
    <MotionTag
      className={`sp-paper sp-paper--${variant} ${hoverable ? 'sp-paper--hoverable' : ''} ${className}`}
      style={{ ...style, '--paper-tilt': `${tilt}deg` } as CSSProperties}
      onClick={onClick}
      whileHover={hoverable ? { y: -4, rotate: 0, boxShadow: '4px 6px 20px rgba(30,25,18,0.12)' } : undefined}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
    >
      {variant === 'taped' && (
        <>
          <div className="sp-paper__tape sp-paper__tape--top" style={{ backgroundColor: tapeColor }} aria-hidden="true" />
          <div className="sp-paper__tape sp-paper__tape--bottom" style={{ backgroundColor: tapeColor }} aria-hidden="true" />
        </>
      )}
      {variant === 'pinned' && (
        <div className="sp-paper__pin" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 14 14">
            <circle cx="7" cy="7" r="5" fill="#c0392b" stroke="#922b21" strokeWidth="1.5" />
            <circle cx="5.5" cy="5" r="1.5" fill="rgba(255,255,255,0.3)" />
          </svg>
        </div>
      )}
      {children}
    </MotionTag>
  )
}
