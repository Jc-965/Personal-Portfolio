import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import LoadingScreen from './components/LoadingScreen'
import Cursor from './components/Cursor'
import Background from './components/Background'
import Navbar from './components/Navbar'
import Hero from './components/Hero'
import Journey from './components/Journey'
import Projects from './components/Projects'
import BeyondBuild from './components/BeyondBuild'
import Toolkit from './components/Toolkit'
import Constellation from './components/Constellation'
import Footer from './components/Footer'

function App() {
  const [isLoading, setIsLoading] = useState(true)

  return (
    <>
      <AnimatePresence mode="wait">
        {isLoading ? (
          <LoadingScreen key="loading" onComplete={() => setIsLoading(false)} />
        ) : (
          <motion.div
            key="main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Cursor />
            <Background />
            <Navbar />
            <main>
              <Hero />
              <Journey />
              <Projects />
              <BeyondBuild />
              <Toolkit />
              <Constellation />
            </main>
            <Footer />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default App
