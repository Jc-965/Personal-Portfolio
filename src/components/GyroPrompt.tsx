import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGyroscope } from '../context/GyroscopeContext'

export default function GyroPrompt() {
  const gyro = useGyroscope()
  const [dismissed, setDismissed] = useState(false)

  // Only show on iOS devices that need permission
  const needsPrompt = gyro.supported && !gyro.permitted && !dismissed
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)

  if (!isIOS || !needsPrompt) return null

  const handleEnable = async () => {
    const granted = await gyro.requestPermission()
    if (!granted) setDismissed(true)
    else setDismissed(true)
  }

  return (
    <AnimatePresence>
      <motion.button
        className="gyro-prompt"
        initial={{ opacity: 0, y: 20, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.9 }}
        transition={{ duration: 0.35, delay: 2 }}
        onClick={handleEnable}
        aria-label="Enable motion effects"
      >
        <span className="gyro-prompt__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
        </span>
        <span className="gyro-prompt__text">Enable motion</span>
      </motion.button>
    </AnimatePresence>
  )
}
