import { motion } from 'framer-motion'

interface ScrollProgressProps {
  progress: number
}

export default function ScrollProgress({ progress }: ScrollProgressProps) {
  return (
    <div className="sp-scroll-progress" aria-hidden="true">
      <motion.div
        className="sp-scroll-progress__fill"
        style={{ scaleY: progress }}
      />
      <div className="sp-scroll-progress__marker" style={{ top: `${progress * 100}%` }}>
        <svg width="8" height="8" viewBox="0 0 8 8">
          <circle cx="4" cy="4" r="3" fill="rgba(30,25,18,0.5)" />
        </svg>
      </div>
    </div>
  )
}
