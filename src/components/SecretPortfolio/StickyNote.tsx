import { motion } from 'framer-motion'
import type { ReactNode, CSSProperties } from 'react'

interface StickyNoteProps {
  children: ReactNode
  color?: 'yellow' | 'blue' | 'pink' | 'green'
  tilt?: number
  className?: string
  style?: CSSProperties
}

const colorMap = {
  yellow: { bg: '#fef3c7', border: '#d4a843' },
  blue: { bg: '#dbeafe', border: '#7ba4cc' },
  pink: { bg: '#fce7f3', border: '#d4829b' },
  green: { bg: '#d1fae5', border: '#6daa8c' },
}

export default function StickyNote({
  children,
  color = 'yellow',
  tilt = 0,
  className = '',
  style,
}: StickyNoteProps) {
  const { bg, border } = colorMap[color]

  return (
    <motion.div
      className={`sp-sticky ${className}`}
      style={{
        ...style,
        backgroundColor: bg,
        borderLeftColor: border,
        transform: `rotate(${tilt}deg)`,
      } as CSSProperties}
      initial={{ opacity: 0, y: 10, rotate: tilt - 2 }}
      animate={{ opacity: 1, y: 0, rotate: tilt }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    >
      {children}
    </motion.div>
  )
}
