import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'

function useTypewriter(text: string, speed = 30, startDelay = 0) {
  const [displayed, setDisplayed] = useState('')
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), startDelay)
    return () => clearTimeout(timer)
  }, [startDelay])

  useEffect(() => {
    if (!started || displayed.length >= text.length) return
    const t = setTimeout(() => setDisplayed(text.slice(0, displayed.length + 1)), speed)
    return () => clearTimeout(t)
  }, [displayed, started, text, speed])

  return displayed
}

export default function Hero() {
  const [showContent, setShowContent] = useState(false)

  const eyebrow = useTypewriter(
    'Jesse Chen // Carnegie Mellon SCS',
    25,
    showContent ? 200 : 1000
  )

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 300)
    return () => clearTimeout(timer)
  }, [])

  return (
    <section className="hero" id="top">
      <div className="hero__scanlines" aria-hidden="true" />

      <motion.div
        className="hero__content hero__content--centered"
        initial={{ opacity: 0 }}
        animate={showContent ? { opacity: 1 } : {}}
        transition={{ duration: 0.6 }}
      >
        <motion.p
          className="hero__eyebrow"
          initial={{ opacity: 0, y: 20 }}
          animate={showContent ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <span className="hero__prompt">&gt; </span>
          {eyebrow}
          <span className="hero__cursor">_</span>
        </motion.p>

        <h1 className="hero__title hero__title--centered">
          <motion.span
            className="hero__title-line"
            initial={{ opacity: 0, y: 40, rotateX: -30 }}
            animate={showContent ? { opacity: 1, y: 0, rotateX: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            Building technology
          </motion.span>
          <motion.span
            className="hero__title-line hero__title-line--accent"
            initial={{ opacity: 0, y: 40, rotateX: -30 }}
            animate={showContent ? { opacity: 1, y: 0, rotateX: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          >
            that solves real problems
          </motion.span>
          <motion.span
            className="hero__title-line"
            initial={{ opacity: 0, y: 40, rotateX: -30 }}
            animate={showContent ? { opacity: 1, y: 0, rotateX: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          >
            for real people.
          </motion.span>
        </h1>

        <motion.p
          className="hero__description hero__description--centered"
          initial={{ opacity: 0, y: 20 }}
          animate={showContent ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.65 }}
        >
          First-year CS student at Carnegie Mellon focused on developing
          technology that addresses meaningful challenges. Building software
          that bridges engineering and human needs.
        </motion.p>

        <motion.div
          className="hero__cta hero__cta--centered"
          initial={{ opacity: 0, y: 20 }}
          animate={showContent ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <a className="btn btn--primary btn--glow" href="#projects">
            <span className="btn__icon">&#9654;</span>
            Browse selected work
          </a>
          <a className="btn btn--ghost" href="#journey">
            <span className="btn__icon">$</span>
            See the journey
          </a>
        </motion.div>

        <motion.div
          className="hero__status hero__status--centered"
          initial={{ opacity: 0 }}
          animate={showContent ? { opacity: 1 } : {}}
          transition={{ duration: 0.5, delay: 0.95 }}
        >
          <div className="hero__status-item">
            <span className="hero__status-label">LOCATION</span>
            <span className="hero__status-value">Pittsburgh, PA</span>
          </div>
          <div className="hero__status-item">
            <span className="hero__status-label">FOCUS</span>
            <span className="hero__status-value">Human-centered computing</span>
          </div>
          <div className="hero__status-item">
            <span className="hero__status-label">STATUS</span>
            <span className="hero__status-value is-pulse">
              <span className="hero__status-dot" />
              Online
            </span>
          </div>
        </motion.div>
      </motion.div>
    </section>
  )
}
