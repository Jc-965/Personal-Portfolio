import { useState, useCallback, type SVGProps } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Mail } from 'lucide-react'
import EmailPopup from './EmailPopup'
import portfolio from '../content/portfolio.json'

type BrandIconProps = SVGProps<SVGSVGElement> & {
  size?: number
}

function GitHubIcon({ size = 15, ...props }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" focusable="false" {...props}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.19-3.08-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18.92-.26 1.91-.38 2.89-.39.98 0 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.8 1.19 1.83 1.19 3.08 0 4.41-2.69 5.38-5.25 5.66.42.36.78 1.08.78 2.18 0 1.57-.01 2.84-.01 3.23 0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

function LinkedInIcon({ size = 15, ...props }: BrandIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" focusable="false" {...props}>
      <path d="M20.45 20.45h-3.56v-5.58c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.44-2.13 2.94v5.68H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.07 2.07 0 1 1 0-4.14 2.07 2.07 0 0 1 0 4.14Zm1.78 13.02H3.56V9h3.56v11.45ZM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.72V1.72C24 .77 23.21 0 22.23 0Z" />
    </svg>
  )
}

export default function Footer() {
  const [showEmail, setShowEmail] = useState(false)
  const closeEmail = useCallback(() => setShowEmail(false), [])

  return (
    <footer className="footer">
      <p>&copy; {new Date().getFullYear()} {portfolio.profile.name}</p>
      <div className="footer__socials" aria-label="Social links">
        <a
          className="footer__social-link"
          href={portfolio.profile.github}
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub"
          title="GitHub"
        >
          <GitHubIcon size={15} aria-hidden="true" />
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
          href={portfolio.profile.linkedin}
          target="_blank"
          rel="noreferrer"
          aria-label="LinkedIn"
          title="LinkedIn"
        >
          <LinkedInIcon size={15} aria-hidden="true" />
          <span className="footer__social-text">LinkedIn</span>
        </a>
      </div>
      <button
        className="back-to-top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        cd ~/ &uarr;
      </button>

      <AnimatePresence>
        {showEmail && <EmailPopup onClose={closeEmail} />}
      </AnimatePresence>
    </footer>
  )
}
