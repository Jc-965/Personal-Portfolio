import { motion } from 'framer-motion'

export default function ScrollInvitation({ progress }: { progress: number }) {
  if (progress > 0.3) return null

  return (
    <motion.div
      className="sketch-scroll-hint"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 - progress * 3 }}
      transition={{ duration: 0.5 }}
    >
      <span className="sketch-scroll-hint__line" />
      <span className="sketch-scroll-hint__text">keep scrolling</span>
    </motion.div>
  )
}
