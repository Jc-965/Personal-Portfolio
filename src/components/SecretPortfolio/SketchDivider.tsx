import { motion } from 'framer-motion'

interface SketchDividerProps {
  className?: string
  delay?: number
}

export default function SketchDivider({ className = '', delay = 0 }: SketchDividerProps) {
  return (
    <div className={`sp-divider ${className}`} aria-hidden="true">
      <svg viewBox="0 0 600 6" preserveAspectRatio="none">
        <motion.path
          d="M0 3 Q50 1 100 3 T200 3 T300 2 T400 4 T500 3 T600 3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeDasharray="4 6"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.4 }}
          transition={{ delay, duration: 1, ease: 'easeOut' }}
        />
      </svg>
    </div>
  )
}
