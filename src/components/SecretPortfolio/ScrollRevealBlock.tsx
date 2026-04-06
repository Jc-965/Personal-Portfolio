import type { ReactNode, CSSProperties } from 'react'
import { useScrollReveal } from './hooks/useScrollReveal'

type RevealDirection = 'up' | 'down' | 'left' | 'right' | 'scale' | 'rotate'

interface ScrollRevealBlockProps {
  children: ReactNode
  direction?: RevealDirection
  delay?: number
  className?: string
  style?: CSSProperties
  as?: keyof JSX.IntrinsicElements
  distance?: number
}

/** Wraps children in a scroll-triggered reveal with CSS-only animation (no framer motion) */
export default function ScrollRevealBlock({
  children,
  direction = 'up',
  delay = 0,
  className = '',
  style,
  as: Tag = 'div',
  distance = 30,
}: ScrollRevealBlockProps) {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>({ threshold: 0.12 })

  const dirClass = `sp-reveal--${direction}`

  return (
    <Tag
      ref={ref as any}
      className={`sp-reveal ${dirClass} ${isVisible ? 'sp-reveal--visible' : ''} ${className}`}
      style={{ ...style, '--reveal-delay': `${delay}s`, '--reveal-distance': `${distance}px` } as CSSProperties}
    >
      {children}
    </Tag>
  )
}
