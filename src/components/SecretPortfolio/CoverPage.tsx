import { motion } from 'framer-motion'
import SketchAnnotation from './SketchAnnotation'

interface CoverPageProps {
  onEnter: () => void
}

export default function CoverPage({ onEnter }: CoverPageProps) {
  return (
    <motion.div
      className="sp-cover"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -40 }}
      transition={{ duration: 0.6 }}
    >
      {/* Notebook cover */}
      <div className="sp-cover__notebook">
        {/* Binding edge */}
        <div className="sp-cover__binding" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="sp-cover__binding-ring" />
          ))}
        </div>

        <div className="sp-cover__content">
          {/* Title label */}
          <div className="sp-cover__label">
            <motion.div
              className="sp-cover__label-tape"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.3, duration: 0.5, ease: 'easeOut' }}
              aria-hidden="true"
            />
            <motion.h1
              className="sp-cover__title"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
            >
              Jesse Chen
            </motion.h1>
          </div>

          {/* Subtitle */}
          <motion.p
            className="sp-cover__subtitle"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.4 }}
          >
            Carnegie Mellon SCS · Software Engineer
          </motion.p>

          {/* Annotations */}
          <motion.div
            className="sp-cover__annotations"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            <SketchAnnotation text="projects & notes →" type="arrow-right" delay={1.4} />
          </motion.div>

          {/* Scribbled details */}
          <motion.div
            className="sp-cover__details"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <span className="sp-cover__detail">2024 – present</span>
            <span className="sp-cover__detail">vol. I</span>
          </motion.div>

          {/* Subject line */}
          <motion.div
            className="sp-cover__subject"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
          >
            <span className="sp-cover__subject-label">subject:</span>
            <span className="sp-cover__subject-text">
              <SketchAnnotation text="everything I've built" type="underline" delay={1.3} />
            </span>
          </motion.div>

          {/* Open button */}
          <motion.button
            className="sp-cover__open-btn"
            onClick={onEnter}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.6, duration: 0.4 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="sp-cover__open-text">open notebook</span>
            <svg width="18" height="12" viewBox="0 0 18 12" className="sp-cover__open-arrow" aria-hidden="true">
              <path d="M1 6h14M12 1l4 5-4 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
        </div>

        {/* Corner wear */}
        <div className="sp-cover__corner sp-cover__corner--tl" aria-hidden="true" />
        <div className="sp-cover__corner sp-cover__corner--br" aria-hidden="true" />
      </div>
    </motion.div>
  )
}
