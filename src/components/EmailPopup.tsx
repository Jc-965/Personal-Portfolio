import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { X, Send } from 'lucide-react'

const FORMSPREE_URL = 'https://formspree.io/f/mykdvoyz'

export default function EmailPopup({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [emailError, setEmailError] = useState('')

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const isValidEmail = (value: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !message.trim()) return

    if (!isValidEmail(email.trim())) {
      setEmailError('Please enter a valid email address.')
      return
    }
    setEmailError('')

    setStatus('sending')
    try {
      const res = await fetch(FORMSPREE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, message }),
      })
      if (res.ok) {
        setStatus('sent')
        setTimeout(onClose, 2000)
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <motion.div
      className="email-popup__backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className="email-popup__card"
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <div className="email-popup__scanlines" />

        <button className="email-popup__close" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>

        <div className="email-popup__header">
          <span className="email-popup__prompt">&gt;_</span>
          <span className="email-popup__title">CONTACT</span>
        </div>

        {status === 'sent' ? (
          <div className="email-popup__success">
            <p>Message sent successfully.</p>
            <p className="email-popup__success-sub">Thanks for reaching out!</p>
          </div>
        ) : (
          <form className="email-popup__form" onSubmit={handleSubmit}>
            <div className="email-popup__field">
              <label className="email-popup__label" htmlFor="popup-email">Email</label>
              <input
                id="popup-email"
                className="email-popup__input"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setEmailError('') }}
                disabled={status === 'sending'}
              />
              {emailError && <p className="email-popup__error">{emailError}</p>}
            </div>

            <div className="email-popup__field">
              <label className="email-popup__label" htmlFor="popup-message">Message</label>
              <textarea
                id="popup-message"
                className="email-popup__textarea"
                required
                placeholder="What's on your mind?"
                rows={5}
                value={message}
                onChange={e => setMessage(e.target.value)}
                disabled={status === 'sending'}
              />
            </div>

            {status === 'error' && (
              <p className="email-popup__error">Something went wrong. Try again.</p>
            )}

            <button
              className="email-popup__submit"
              type="submit"
              disabled={status === 'sending'}
            >
              <Send size={14} />
              <span>{status === 'sending' ? 'Sending...' : 'Send message'}</span>
            </button>
          </form>
        )}
      </motion.div>
    </motion.div>
  )
}
