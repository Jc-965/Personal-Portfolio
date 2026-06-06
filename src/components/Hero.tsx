import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { motion } from 'framer-motion'
import DecryptedText from './DecryptedText'
import Magnet from './Magnet'
import useIsPhone from '../hooks/useIsPhone'
import { useGyroscope } from '../context/GyroscopeContext'

// Lazy so the Three.js bundle isn't pulled into the eager hero chunk. The
// parent .hero__title-line--ascii reserves a fixed height, so the null
// fallback causes no layout shift, and vendor-3d is typically already cached
// from the loading screen by the time the hero mounts.
const ASCIIText = lazy(() => import('./ASCIIText'))

export default function Hero() {
  const [showContent, setShowContent] = useState(false)
  const isPhone = useIsPhone()
  const gyro = useGyroscope()
  const eyebrowRef = useRef<HTMLParagraphElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const descRef = useRef<HTMLParagraphElement>(null)
  const ctaRef = useRef<HTMLDivElement>(null)

  // Gyroscope parallax: each layer moves at a different depth
  useEffect(() => {
    if (!isPhone || !gyro.permitted) return

    return gyro.subscribe((gx, gy) => {
      // Layers at different depths: eyebrow barely moves, CTA moves most
      if (eyebrowRef.current) {
        eyebrowRef.current.style.transform = `translate(${gx * 5}px, ${gy * 3}px)`
      }
      if (titleRef.current) {
        titleRef.current.style.transform = `translate(${gx * 14}px, ${gy * 8}px)`
      }
      if (descRef.current) {
        descRef.current.style.transform = `translate(${gx * 8}px, ${gy * 5}px)`
      }
      if (ctaRef.current) {
        ctaRef.current.style.transform = `translate(${gx * 18}px, ${gy * 10}px)`
      }
    })
  }, [isPhone, gyro])

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
          ref={eyebrowRef}
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

        <div ref={titleRef} className="hero__title hero__title--centered" aria-hidden="true">
          {isPhone ? (
            <>
              <motion.span
                className="hero__title-line hero__title-line--mobile"
                initial={{ opacity: 0, y: 24 }}
                animate={showContent ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.45, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              >
                Building technology
              </motion.span>
              <motion.span
                className="hero__title-line hero__title-line--mobile hero__title-line--mobile-accent"
                initial={{ opacity: 0, y: 24 }}
                animate={showContent ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.45, delay: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
              >
                that solves real problems
              </motion.span>
              <motion.span
                className="hero__title-line hero__title-line--mobile"
                initial={{ opacity: 0, y: 24 }}
                animate={showContent ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.45, delay: 0.44, ease: [0.2, 0.8, 0.2, 1] }}
              >
                for real people
              </motion.span>
            </>
          ) : (
            <Suspense fallback={null}>
              <motion.div
                className="hero__title-line hero__title-line--ascii hero__title-line--ascii-bright"
                initial={{ opacity: 0, y: 40, rotateX: -30 }}
                animate={showContent ? { opacity: 1, y: 0, rotateX: 0 } : {}}
                transition={{ duration: 0.6, delay: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <ASCIIText
                  text="Building technology"
                  enableWaves
                  asciiFontSize={4}
                  textFontSize={260}
                  textColor="#f8fbff"
                  planeBaseHeight={6.2}
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
                  asciiFontSize={4}
                  textFontSize={260}
                  textColor="#7efcff"
                  planeBaseHeight={6.2}
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
                  asciiFontSize={4}
                  textFontSize={260}
                  textColor="#f8fbff"
                  planeBaseHeight={6.2}
                  interactionMode="viewport"
                />
              </motion.div>
            </Suspense>
          )}
        </div>

        <motion.p
          ref={descRef}
          className="hero__description hero__description--centered"
          initial={{ opacity: 0, y: 20 }}
          animate={showContent ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.65 }}
        >
          First-year CS student at Carnegie Mellon focused on developing
          technology that addresses meaningful challenges.
        </motion.p>

        <motion.div
          ref={ctaRef}
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
