import { useState, useCallback } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Github, Linkedin, Mail } from 'lucide-react'
import EmailPopup from './EmailPopup'

interface FooterProps {
  onOpenSketchbook: () => void
}

export default function Footer({ onOpenSketchbook }: FooterProps) {
  const [showEmail, setShowEmail] = useState(false)
  const closeEmail = useCallback(() => setShowEmail(false), [])

  return (
    <footer className="footer">
      <p>&copy; {new Date().getFullYear()} Jesse Chen</p>
      <div className="footer__socials" aria-label="Social links">
        <a
          className="footer__social-link"
          href="https://github.com/Jc-965"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
          title="GitHub"
        >
          <Github size={15} strokeWidth={2.25} aria-hidden="true" />
          <span className="footer__social-text">GitHub</span>
        </a>
        <button
          className="footer__social-link"
          onClick={() => setShowEmail(true)}
          aria-label="Send an email"
          title="Send an email"
        >
          <Mail size={15} strokeWidth={2.25} aria-hidden="true" />
          <span className="footer__social-text">Email</span>
        </button>
        <a
          className="footer__social-link"
          href="https://www.linkedin.com/in/jessechen2/"
          target="_blank"
          rel="noreferrer"
          aria-label="LinkedIn"
          title="LinkedIn"
        >
          <Linkedin size={15} strokeWidth={2.25} aria-hidden="true" />
          <span className="footer__social-text">LinkedIn</span>
        </a>
      </div>
      <button
        className="back-to-top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        cd ~/ &uarr;
      </button>

      {/* Easter egg — fixed position sketchbook trigger */}
      <button
        className="sketchbook-trigger"
        onClick={onOpenSketchbook}
        aria-label="Open sketchbook"
      >
        &#x270E;
      </button>

      <AnimatePresence>
        {showEmail && <EmailPopup onClose={closeEmail} />}
      </AnimatePresence>
    </footer>
  )
}
