import { useScrollReveal } from './hooks/useScrollReveal'

interface InkWashProps {
  variant?: 'fold' | 'bleed' | 'splatter' | 'tape-strip'
  className?: string
}

/** Decorative divider between sections — different ink/paper effects */
export default function InkWash({ variant = 'fold', className = '' }: InkWashProps) {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>({ threshold: 0.1 })

  return (
    <div
      ref={ref}
      className={`sp-ink-wash sp-ink-wash--${variant} ${isVisible ? 'sp-ink-wash--visible' : ''} ${className}`}
      aria-hidden="true"
    >
      {variant === 'fold' && (
        <div className="sp-ink-wash__fold-line">
          <div className="sp-ink-wash__fold-shadow" />
        </div>
      )}
      {variant === 'bleed' && (
        <svg className="sp-ink-wash__bleed" viewBox="0 0 800 12" preserveAspectRatio="none">
          <path
            d="M0 6 Q80 2 160 7 T320 5 T480 8 T640 4 T800 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="0.8"
            strokeDasharray="3 5"
          />
        </svg>
      )}
      {variant === 'splatter' && (
        <div className="sp-ink-wash__splatter">
          {[12, 28, 55, 72, 88].map((left, i) => (
            <span
              key={i}
              className="sp-ink-wash__dot"
              style={{ left: `${left}%`, animationDelay: `${i * 0.08}s` }}
            />
          ))}
        </div>
      )}
      {variant === 'tape-strip' && (
        <div className="sp-ink-wash__tape">
          <div className="sp-ink-wash__tape-inner" />
        </div>
      )}
    </div>
  )
}
