import { useRef } from 'react'
import { m, useInView } from 'framer-motion'
import RolesSection from './roles/RolesSection'

/** The Journey section: its header and every role as a stop with a live island (RolesSection). */
export default function Journey() {
  const headerRef = useRef(null)
  const headerInView = useInView(headerRef, { once: true, margin: '-50px' })

  return (
    <>
      <m.header
        ref={headerRef}
        className="section__header"
        initial={{ opacity: 0, y: 20 }}
        animate={headerInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.35 }}
      >
        <p className="section__eyebrow">
          <span className="section__eyebrow-icon">&#9670;</span>
          Journey
        </p>
        <h2>From research labs to shipped products</h2>
      </m.header>
      <RolesSection />
    </>
  )
}
