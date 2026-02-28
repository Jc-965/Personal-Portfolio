import { Github, Linkedin, Mail } from 'lucide-react'

export default function Footer() {
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
        <a
          className="footer__social-link"
          href="mailto:jessec2@andrew.cmu.edu"
          aria-label="Send an email"
          title="Send an email"
        >
          <Mail size={15} strokeWidth={2.25} aria-hidden="true" />
          <span className="footer__social-text">Email</span>
        </a>
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
    </footer>
  )
}
