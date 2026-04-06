import PaperCard from './PaperCard'
import SketchAnnotation from './SketchAnnotation'
import SketchDivider from './SketchDivider'
import StickyNote from './StickyNote'
import ScrollRevealBlock from './ScrollRevealBlock'
import InkWash from './InkWash'

interface ContactSectionProps {
  onClose: () => void
}

export default function ContactSection({ onClose }: ContactSectionProps) {
  return (
    <div className="sp-contact">
      <ScrollRevealBlock direction="up" className="sp-contact__header">
        <h2 className="sp-section-title">
          <span className="sp-section-title__marker" aria-hidden="true">§</span>
          Last Page
        </h2>
        <p className="sp-section-subtitle">Thanks for reading through my notebook</p>
        <SketchDivider delay={0.2} />
      </ScrollRevealBlock>

      <ScrollRevealBlock direction="up" delay={0.1}>
        <PaperCard variant="clean" className="sp-contact__card" tilt={-0.3}>
          <div className="sp-contact__content">
            <p className="sp-contact__message">
              If something here caught your eye — or if you just want to chat about
              code, systems, or creative engineering —
              <SketchAnnotation text=" I'd love to hear from you" type="underline" delay={0.5} />.
            </p>

            <div className="sp-contact__links">
              <a
                href="https://github.com/Jc-965"
                target="_blank"
                rel="noreferrer"
                className="sp-contact__link"
              >
                <span className="sp-contact__link-icon" aria-hidden="true">◇</span>
                GitHub
              </a>
              <a
                href="https://www.linkedin.com/in/jessechen2/"
                target="_blank"
                rel="noreferrer"
                className="sp-contact__link"
              >
                <span className="sp-contact__link-icon" aria-hidden="true">▪</span>
                LinkedIn
              </a>
            </div>
          </div>
        </PaperCard>
      </ScrollRevealBlock>

      <InkWash variant="fold" />

      {/* Closing thoughts sticky notes */}
      <div className="sp-contact__closing-notes">
        <ScrollRevealBlock direction="left" delay={0}>
          <StickyNote color="yellow" tilt={-1.5}>
            <p className="sp-contact__closing-note-text">
              <strong>What I'm looking for:</strong> Opportunities to build meaningful software
              with people who care about craft and impact.
            </p>
          </StickyNote>
        </ScrollRevealBlock>

        <ScrollRevealBlock direction="right" delay={0.08}>
          <StickyNote color="green" tilt={1.2}>
            <p className="sp-contact__closing-note-text">
              <strong>What I value:</strong> Clear thinking, honest feedback, and the belief that
              good engineering is an act of empathy.
            </p>
          </StickyNote>
        </ScrollRevealBlock>
      </div>

      <InkWash variant="bleed" />

      {/* Notebook ending */}
      <ScrollRevealBlock direction="up" delay={0.15} className="sp-contact__ending">
        <div className="sp-contact__end-marks" aria-hidden="true">
          <svg width="200" height="40" viewBox="0 0 200 40">
            <path d="M20 20 L80 20" stroke="currentColor" strokeWidth="0.8" strokeDasharray="4 3" />
            <text x="100" y="24" textAnchor="middle" fontSize="12" fontFamily="var(--sp-font-hand)" fill="currentColor" opacity="0.5">fin</text>
            <path d="M120 20 L180 20" stroke="currentColor" strokeWidth="0.8" strokeDasharray="4 3" />
          </svg>
        </div>

        <p className="sp-contact__closing-text">
          — end of notebook —
        </p>

        <button
          className="sp-contact__close-btn"
          onClick={onClose}
        >
          close notebook
        </button>
      </ScrollRevealBlock>

      {/* Extra spacer so the ending has room to breathe */}
      <div className="sp-contact__end-spacer" aria-hidden="true" />
    </div>
  )
}
