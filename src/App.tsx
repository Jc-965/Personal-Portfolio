import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import LoadingScreen from './components/LoadingScreen'
import Cursor from './components/Cursor'
import Background from './components/Background'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import LazySection from './components/LazySection'
import Footer from './components/Footer'

function App() {
  const [isLoading, setIsLoading] = useState(true)
  const onLoadingComplete = useCallback(() => setIsLoading(false), [])

  return (
    <>
      <Cursor />
      <div className="vintage-overlay" />
      <AnimatePresence mode="wait">
        {isLoading ? (
          <LoadingScreen key="loading" onComplete={onLoadingComplete} />
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Background />
            <Navbar />
            <main>
              <Hero />
              <LazySection id="journey" className="section journey" load={() => import('./components/Journey')} />
              <LazySection id="projects" className="section projects" load={() => import('./components/Projects')} />
              <LazySection id="life" className="section beyond" load={() => import('./components/BeyondBuild')} />
              <LazySection id="skills" className="section toolkit" load={() => import('./components/Toolkit')} />
              <LazySection id="constellation" className="section constellation-section" load={() => import('./components/Constellation')} />
            </main>
            <Footer />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default App
