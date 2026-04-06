import { useScrollReveal } from './hooks/useScrollReveal'

interface PageNumberProps {
  number: number
  label?: string
}

export default function PageNumber({ number, label }: PageNumberProps) {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>({ threshold: 0.5 })

  return (
    <div
      ref={ref}
      className={`sp-page-num ${isVisible ? 'sp-page-num--visible' : ''}`}
      aria-hidden="true"
    >
      <span className="sp-page-num__number">{number}</span>
      {label && <span className="sp-page-num__label">{label}</span>}
      <svg className="sp-page-num__line" width="40" height="2" viewBox="0 0 40 2">
        <line x1="0" y1="1" x2="40" y2="1" stroke="currentColor" strokeWidth="0.8" />
      </svg>
    </div>
  )
}
