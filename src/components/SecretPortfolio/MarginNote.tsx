import { useScrollReveal } from './hooks/useScrollReveal'

interface MarginNoteProps {
  text: string
  side?: 'left' | 'right'
  rotation?: number
  top?: string
  type?: 'scribble' | 'bracket' | 'arrow' | 'circle' | 'stamp'
}

export default function MarginNote({
  text,
  side = 'right',
  rotation = 0,
  top = '0',
  type = 'scribble',
}: MarginNoteProps) {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>({ threshold: 0.3 })

  return (
    <div
      ref={ref}
      className={`sp-margin-note sp-margin-note--${side} sp-margin-note--${type} ${isVisible ? 'sp-margin-note--visible' : ''}`}
      style={{ top, transform: `rotate(${rotation}deg)` }}
      aria-hidden="true"
    >
      {type === 'stamp' ? (
        <span className="sp-margin-note__stamp">{text}</span>
      ) : (
        <span className="sp-margin-note__text">{text}</span>
      )}
      {type === 'arrow' && (
        <svg className="sp-margin-note__arrow-svg" width="40" height="20" viewBox="0 0 40 20">
          <path d="M2 10 Q15 4 28 10 M24 5 L30 10 L24 15" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )}
      {type === 'bracket' && (
        <svg className="sp-margin-note__bracket-svg" width="12" height="40" viewBox="0 0 12 40">
          <path d="M10 2 Q2 2 2 20 Q2 38 10 38" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )}
    </div>
  )
}
