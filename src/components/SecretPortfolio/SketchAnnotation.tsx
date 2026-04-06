import { motion } from 'framer-motion'
import type { CSSProperties } from 'react'

interface SketchAnnotationProps {
  text: string
  type?: 'underline' | 'circle' | 'arrow-left' | 'arrow-right' | 'bracket'
  className?: string
  style?: CSSProperties
  delay?: number
}

export default function SketchAnnotation({
  text,
  type = 'underline',
  className = '',
  style,
  delay = 0,
}: SketchAnnotationProps) {
  return (
    <motion.span
      className={`sp-annotation sp-annotation--${type} ${className}`}
      style={style}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay, duration: 0.4 }}
    >
      {text}
      {type === 'underline' && (
        <svg className="sp-annotation__underline" viewBox="0 0 200 8" preserveAspectRatio="none" aria-hidden="true">
          <motion.path
            d="M2 5 Q50 2 100 5 T198 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: delay + 0.2, duration: 0.6, ease: 'easeOut' }}
          />
        </svg>
      )}
      {type === 'circle' && (
        <svg className="sp-annotation__circle" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <motion.ellipse
            cx="50"
            cy="20"
            rx="46"
            ry="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: delay + 0.2, duration: 0.8, ease: 'easeOut' }}
          />
        </svg>
      )}
      {type === 'arrow-right' && (
        <svg className="sp-annotation__arrow sp-annotation__arrow--right" viewBox="0 0 30 16" aria-hidden="true">
          <motion.path
            d="M2 8 L22 8 M18 3 L24 8 L18 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: delay + 0.2, duration: 0.5 }}
          />
        </svg>
      )}
    </motion.span>
  )
}
