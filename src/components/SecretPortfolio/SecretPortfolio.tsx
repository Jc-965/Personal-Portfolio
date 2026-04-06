import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import PencilCursor from './PencilCursor'
import ScrollProgress from './ScrollProgress'
import FloatingDoodles from './FloatingDoodles'
import CoverPage from './CoverPage'
import NotebookNav, { type SectionId } from './NotebookNav'
import ProjectIndex from './ProjectIndex'
import ProjectDetail from './ProjectDetail'
import AboutSection from './AboutSection'
import SkillsSection from './SkillsSection'
import ArchiveSection from './ArchiveSection'
import ContactSection from './ContactSection'
import InkWash from './InkWash'
import PageNumber from './PageNumber'
import MarginNote from './MarginNote'
import { useScrollProgress, useParallaxOffset } from './hooks/useScrollReveal'
import { projects, skills, archiveEntries } from '../../data/secretPortfolioData'

interface SecretPortfolioProps {
  onClose: () => void
}

type View = 'cover' | 'notebook'

export default function SecretPortfolio({ onClose }: SecretPortfolioProps) {
  const [view, setView] = useState<View>('cover')
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sectionRefs = useRef<Record<SectionId, HTMLElement | null>>({
    projects: null,
    about: null,
    skills: null,
    archive: null,
    contact: null,
  })

  const scrollProgress = useScrollProgress(scrollRef)
  const parallaxOffset = useParallaxOffset(scrollRef, 1)

  // Scroll-spy: track which section is active
  const [activeSection, setActiveSection] = useState<SectionId>('projects')

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const onScroll = () => {
      const ids: SectionId[] = ['projects', 'about', 'skills', 'archive', 'contact']
      let current: SectionId = 'projects'

      for (const id of ids) {
        const section = sectionRefs.current[id]
        if (!section) continue
        const rect = section.getBoundingClientRect()
        const containerRect = el.getBoundingClientRect()
        const relativeTop = rect.top - containerRect.top
        if (relativeTop <= 200) current = id
      }

      setActiveSection(current)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [view])

  const enterNotebook = useCallback(() => setView('notebook'), [])

  const handleNavigate = useCallback((id: SectionId) => {
    setSelectedProject(null)
    const section = sectionRefs.current[id]
    if (section && scrollRef.current) {
      const containerTop = scrollRef.current.getBoundingClientRect().top
      const sectionTop = section.getBoundingClientRect().top
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollTop + (sectionTop - containerTop) - 60,
        behavior: 'smooth',
      })
    }
  }, [])

  const handleSelectProject = useCallback((slug: string) => {
    setSelectedProject(slug)
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleBackToIndex = useCallback(() => {
    setSelectedProject(null)
    // Scroll back to projects section
    const section = sectionRefs.current.projects
    if (section && scrollRef.current) {
      const containerTop = scrollRef.current.getBoundingClientRect().top
      const sectionTop = section.getBoundingClientRect().top
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollTop + (sectionTop - containerTop) - 60,
        behavior: 'smooth',
      })
    }
  }, [])

  // Lock body scroll & restore cursor
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.classList.add('sp-active')
    return () => {
      document.body.style.overflow = prev
      document.documentElement.classList.remove('sp-active')
    }
  }, [])

  // Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedProject) setSelectedProject(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedProject, onClose])

  const selectedProjectData = selectedProject
    ? projects.find(p => p.slug === selectedProject)
    : null

  const content = (
    <motion.div
      className="sp-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      <PencilCursor />

      {/* Paper background */}
      <div className="sp-overlay__bg" aria-hidden="true">
        <div className="sp-overlay__grain" />
      </div>

      <AnimatePresence mode="wait">
        {view === 'cover' ? (
          <CoverPage key="cover" onEnter={enterNotebook} />
        ) : (
          <motion.div
            key="notebook"
            className="sp-notebook"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            {/* Scroll progress bar */}
            <ScrollProgress progress={scrollProgress} />

            {/* Sticky top bar */}
            <div className="sp-notebook__top-bar">
              <NotebookNav active={activeSection} onNavigate={handleNavigate} />
              <button
                className="sp-notebook__close"
                onClick={onClose}
                aria-label="Close notebook"
                title="Close notebook"
              >
                ✕
              </button>
            </div>

            {/* Single continuous scroll area */}
            <div className="sp-notebook__content" ref={scrollRef}>
              {/* Parallax floating doodle layer */}
              <FloatingDoodles scrollOffset={parallaxOffset} />

              {/* Parallax floating annotations */}
              <div className="sp-parallax-notes" aria-hidden="true">
                <span className="sp-parallax-note sp-parallax-note--1" style={{ transform: `translateY(${parallaxOffset * -0.06}px)` }}>draft v3</span>
                <span className="sp-parallax-note sp-parallax-note--2" style={{ transform: `translateY(${parallaxOffset * -0.1}px)` }}>→ review</span>
                <span className="sp-parallax-note sp-parallax-note--3" style={{ transform: `translateY(${parallaxOffset * -0.04}px)` }}>!important</span>
                <span className="sp-parallax-note sp-parallax-note--4" style={{ transform: `translateY(${parallaxOffset * -0.08}px)` }}>see p.3</span>
                <span className="sp-parallax-note sp-parallax-note--5" style={{ transform: `translateY(${parallaxOffset * -0.12}px)` }}>TODO</span>
                <span className="sp-parallax-note sp-parallax-note--6" style={{ transform: `translateY(${parallaxOffset * -0.05}px)` }}>v2 idea ↓</span>
              </div>

              {/* Margin ruler */}
              <div className="sp-margin-ruler" aria-hidden="true">
                <div className="sp-margin-ruler__line" />
              </div>

              <AnimatePresence mode="wait">
                {selectedProjectData ? (
                  <ProjectDetail
                    key={`detail-${selectedProjectData.slug}`}
                    project={selectedProjectData}
                    onBack={handleBackToIndex}
                  />
                ) : (
                  <div key="all-sections" className="sp-sections">
                    {/* ═══ PROJECTS ═══ */}
                    <section
                      ref={el => { sectionRefs.current.projects = el }}
                      id="sp-projects"
                      className="sp-section"
                    >
                      <PageNumber number={1} label="projects" />
                      <ProjectIndex projects={projects} onSelectProject={handleSelectProject} />
                      <MarginNote text="best work ★" side="right" rotation={-5} top="120px" type="scribble" />
                      <MarginNote text="click to expand →" side="right" rotation={3} top="400px" type="arrow" />
                    </section>

                    <InkWash variant="fold" />

                    {/* ═══ ABOUT ═══ */}
                    <section
                      ref={el => { sectionRefs.current.about = el }}
                      id="sp-about"
                      className="sp-section"
                    >
                      <PageNumber number={2} label="about" />
                      <AboutSection />
                      <MarginNote text="CMU SCS '28" side="left" rotation={-3} top="80px" type="scribble" />
                      <MarginNote text="important" side="right" rotation={6} top="300px" type="stamp" />
                    </section>

                    <InkWash variant="tape-strip" />

                    {/* ═══ SKILLS ═══ */}
                    <section
                      ref={el => { sectionRefs.current.skills = el }}
                      id="sp-skills"
                      className="sp-section"
                    >
                      <PageNumber number={3} label="stack" />
                      <SkillsSection skills={skills} />
                      <MarginNote text="core tools" side="right" rotation={-4} top="60px" type="bracket" />
                    </section>

                    <InkWash variant="bleed" />

                    {/* ═══ ARCHIVE ═══ */}
                    <section
                      ref={el => { sectionRefs.current.archive = el }}
                      id="sp-archive"
                      className="sp-section"
                    >
                      <PageNumber number={4} label="archive" />
                      <ArchiveSection entries={archiveEntries} />
                      <MarginNote text="rough drafts" side="left" rotation={5} top="50px" type="scribble" />
                      <MarginNote text="WIP" side="right" rotation={-8} top="350px" type="stamp" />
                    </section>

                    <InkWash variant="splatter" />

                    {/* ═══ CONTACT ═══ */}
                    <section
                      ref={el => { sectionRefs.current.contact = el }}
                      id="sp-contact"
                      className="sp-section sp-section--last"
                    >
                      <PageNumber number={5} label="end" />
                      <ContactSection onClose={onClose} />
                      <MarginNote text="thanks for reading" side="right" rotation={4} top="200px" type="scribble" />
                    </section>
                  </div>
                )}
              </AnimatePresence>

              {/* Notebook ruled lines background */}
              <div className="sp-notebook__lines" aria-hidden="true" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )

  return createPortal(content, document.body)
}
