import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import ASCIIText from './ASCIIText'
import DecryptedText from './DecryptedText'
import Magnet from './Magnet'
import useIsPhone from '../hooks/useIsPhone'

export default function Hero() {
  const [showContent, setShowContent] = useState(false)
  const isPhone = useIsPhone()

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
          <DecryptedText
            text="Jesse Chen // Carnegie Mellon SCS"
            speed={18}
            sequential
            revealDirection="start"
            animateOn="view"
            characters="ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/_-"
            parentClassName="hero__eyebrow-text"
            className="hero__eyebrow-char"
            encryptedClassName="hero__eyebrow-char hero__eyebrow-char--encrypted"
          />
        </motion.p>

        <h1 className="hero__title-sr">
          Building technology that solves real problems for real people
        </h1>

        <div className="hero__title hero__title--centered" aria-hidden="true">
          <motion.div
            className="hero__title-line hero__title-line--ascii hero__title-line--ascii-bright"
            initial={{ opacity: 0, y: 40, rotateX: -30 }}
            animate={showContent ? { opacity: 1, y: 0, rotateX: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <ASCIIText
              text="Building technology"
              enableWaves
              asciiFontSize={isPhone ? 3 : 4}
              textFontSize={isPhone ? 200 : 260}
              textColor="#f8fbff"
              planeBaseHeight={isPhone ? 4.5 : 6.2}
              interactionMode="viewport"
            />
          </motion.div>
          <motion.div
            className="hero__title-line hero__title-line--ascii hero__title-line--ascii-accent"
            initial={{ opacity: 0, y: 40, rotateX: -30 }}
            animate={showContent ? { opacity: 1, y: 0, rotateX: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <ASCIIText
              text="that solves real problems"
              enableWaves
              asciiFontSize={isPhone ? 3 : 4}
              textFontSize={isPhone ? 200 : 260}
              textColor="#7efcff"
              planeBaseHeight={isPhone ? 4.5 : 6.2}
              interactionMode="viewport"
            />
          </motion.div>
          <motion.div
            className="hero__title-line hero__title-line--ascii hero__title-line--ascii-bright"
            initial={{ opacity: 0, y: 40, rotateX: -30 }}
            animate={showContent ? { opacity: 1, y: 0, rotateX: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <ASCIIText
              text="for real people"
              enableWaves
              asciiFontSize={isPhone ? 3 : 4}
              textFontSize={isPhone ? 200 : 260}
              textColor="#f8fbff"
              planeBaseHeight={isPhone ? 4.5 : 6.2}
              interactionMode="viewport"
            />
          </motion.div>
        </div>

        <motion.p
          className="hero__description hero__description--centered"
          initial={{ opacity: 0, y: 20 }}
          animate={showContent ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.65 }}
        >
          First-year CS student at Carnegie Mellon focused on developing
          technology that addresses meaningful challenges.
        </motion.p>

        <motion.div
          className="hero__cta hero__cta--centered"
          initial={{ opacity: 0, y: 20 }}
          animate={showContent ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.8 }}
        >
          <Magnet
            padding={72}
            disabled={isPhone}
            magnetStrength={12}
            activeTransition="transform 0.14s cubic-bezier(0.16, 1, 0.3, 1)"
            inactiveTransition="transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)"
          >
            <a className="btn btn--primary btn--glow" href="#projects">
              <span className="btn__icon">&#9654;</span>
              Browse projects
            </a>
          </Magnet>
          <Magnet
            padding={72}
            disabled={isPhone}
            magnetStrength={12}
            activeTransition="transform 0.14s cubic-bezier(0.16, 1, 0.3, 1)"
            inactiveTransition="transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)"
          >
            <a className="btn btn--ghost" href="#journey">
              <span className="btn__icon">$</span>
              See the journey
            </a>
          </Magnet>
        </motion.div>
      </motion.div>
    </section>
  )
}
