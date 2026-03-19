import { useState, type CSSProperties } from 'react'

interface SketchbookTutorialProps {
  onClose: () => void
}

type TutorialStep = {
  id: 'survey' | 'explore' | 'capture'
  eyebrow: string
  title: string
  body: string
  featureLabel: string
  featureBody: string
  graphicCaption: string
  controls: string[]
  callouts: { label: string; x: string; y: string }[]
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'survey',
    eyebrow: 'step 1',
    title: 'survey the field and sculpt the terrain',
    body: 'Start in sculpt view. Drag to turn your camera, scroll to zoom, use Q and E to rotate, then use R and C to raise or lower the camera before flipping sculpt on to push, pull, and smooth the paper landscape.',
    featureLabel: 'field note',
    featureBody: 'Cycle viewpoints for quick compositions, tune brush strength, and let decay ease sharp edits back into softer hills.',
    graphicCaption: 'survey view + live sculpt controls',
    controls: ['drag look', 'scroll zoom', 'q/e rotate', 'r/c move', 'tab switch mode', 'sculpt on'],
    callouts: [
      { label: 'survey views', x: '20%', y: '14%' },
      { label: 'brush + decay', x: '82%', y: '24%' },
      { label: 'terrain edits', x: '58%', y: '78%' },
    ],
  },
  {
    id: 'explore',
    eyebrow: 'step 2',
    title: 'switch to explore and walk the sketch',
    body: 'Hit explore, click the field to capture your view, then move with WASD. Use the mouse or Q and E to turn, R and C to move vertically, tab to switch modes, and escape when you want the cursor back.',
    featureLabel: 'field note',
    featureBody: 'Perches jump you to curated locations, so you can scout the scene quickly before dropping into first-person movement.',
    graphicCaption: 'first-person roam with pinned perches',
    controls: ['explore mode', 'click to look', 'wasd walk', 'q/e rotate', 'r/c move', 'tab switch mode', 'esc release'],
    callouts: [
      { label: 'click to lock view', x: '22%', y: '20%' },
      { label: 'perch jump', x: '80%', y: '36%' },
      { label: 'walk the trail', x: '52%', y: '78%' },
    ],
  },
  {
    id: 'capture',
    eyebrow: 'step 3',
    title: 'capture a clean postcard when you find a frame',
    body: 'Use photo to generate both your live framing and a recommended angle. Hide UI for a cleaner composition, then save or copy either shot from the contact sheet.',
    featureLabel: 'field note',
    featureBody: 'The photo sheet always keeps two takes ready: the exact camera you composed and a cleaner postcard picked from the terrain.',
    graphicCaption: 'contact-sheet export with clean ui toggle',
    controls: ['photo', 'save or copy', 'hide ui', 'back to portfolio'],
    callouts: [
      { label: 'photo stack', x: '22%', y: '18%' },
      { label: 'recommended angle', x: '80%', y: '28%' },
      { label: 'clean ui frame', x: '56%', y: '78%' },
    ],
  },
]

export default function SketchbookTutorial({ onClose }: SketchbookTutorialProps) {
  const [stepIndex, setStepIndex] = useState(0)
  const step = TUTORIAL_STEPS[stepIndex]
  const isLastStep = stepIndex === TUTORIAL_STEPS.length - 1

  return (
    <>
      <div className="sketch-tutorial-backdrop" aria-hidden="true" />
      <div className="sketch-tutorial-shell">
        <section
          className={`sketch-tutorial sketch-tutorial--${step.id}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="sketch-tutorial-title"
          aria-describedby="sketch-tutorial-description"
        >
          <header className="sketch-tutorial__header">
            <div className="sketch-tutorial__copy">
              <span className="sketch-tutorial__eyebrow">field guide</span>
              <h2 id="sketch-tutorial-title" className="sketch-tutorial__title">how the sketchbook works</h2>
              <p id="sketch-tutorial-description" className="sketch-tutorial__description">
                A quick three-step walkthrough before you head into the terrain.
              </p>
            </div>
            <div className="sketch-tutorial__progress">
              <span className="sketch-tutorial__progress-label">{step.eyebrow}</span>
              <span className="sketch-tutorial__progress-index">{stepIndex + 1} / {TUTORIAL_STEPS.length}</span>
            </div>
          </header>

          <div className="sketch-tutorial__body">
            <div className="sketch-tutorial__graphic" aria-hidden="true">
              <div className={`sketch-tutorial-photo sketch-tutorial-photo--${step.id}`}>
                <div className="sketch-tutorial-photo__frame">
                  <div className="sketch-tutorial-photo__mat">
                    <div className="sketch-tutorial-photo__scene">
                      <span className="sketch-tutorial-photo__sun" />
                      <span className="sketch-tutorial-photo__ridge sketch-tutorial-photo__ridge--back" />
                      <span className="sketch-tutorial-photo__ridge sketch-tutorial-photo__ridge--mid" />
                      <span className="sketch-tutorial-photo__ridge sketch-tutorial-photo__ridge--front" />
                      <span className="sketch-tutorial-photo__trail" />
                      <span className="sketch-tutorial-photo__reticle" />
                      <span className="sketch-tutorial-photo__toolbar" />
                      <span className="sketch-tutorial-photo__capture sketch-tutorial-photo__capture--left" />
                      <span className="sketch-tutorial-photo__capture sketch-tutorial-photo__capture--right" />
                    </div>
                    <div className="sketch-tutorial-photo__caption">{step.graphicCaption}</div>
                  </div>
                </div>

                {step.callouts.map(callout => (
                  <span
                    key={callout.label}
                    className="sketch-tutorial-photo__callout"
                    style={{ '--callout-x': callout.x, '--callout-y': callout.y } as CSSProperties}
                  >
                    {callout.label}
                  </span>
                ))}
              </div>

              <div className="sketch-tutorial-strip">
                {TUTORIAL_STEPS.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`sketch-tutorial-strip__thumb ${index === stepIndex ? 'is-active' : ''}`}
                    onClick={() => setStepIndex(index)}
                  >
                    <span className={`sketch-tutorial-strip__image sketch-tutorial-strip__image--${item.id}`} />
                    <span className="sketch-tutorial-strip__meta">
                      <span className="sketch-tutorial-strip__step">{item.eyebrow}</span>
                      <span className="sketch-tutorial-strip__label">{item.title}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="sketch-tutorial__panel">
              <span className="sketch-tutorial__step-tag">{step.eyebrow}</span>
              <h3 className="sketch-tutorial__panel-title">{step.title}</h3>
              <p className="sketch-tutorial__panel-body">{step.body}</p>

              <div className="sketch-tutorial__controls">
                {step.controls.map(control => (
                  <span key={control} className="sketch-tutorial__control-chip">{control}</span>
                ))}
              </div>

              <div className="sketch-tutorial__note">
                <span className="sketch-tutorial__note-label">{step.featureLabel}</span>
                <p className="sketch-tutorial__note-body">{step.featureBody}</p>
              </div>
            </div>
          </div>

          <footer className="sketch-tutorial__footer">
            <div className="sketch-tutorial__dots" aria-hidden="true">
              {TUTORIAL_STEPS.map((item, index) => (
                <span key={item.id} className={`sketch-tutorial__dot ${index === stepIndex ? 'is-active' : ''}`} />
              ))}
            </div>

            <div className="sketch-tutorial__actions">
              <button type="button" className="sketch-btn" onClick={onClose}>skip intro</button>
              {stepIndex > 0 && (
                <button type="button" className="sketch-btn" onClick={() => setStepIndex(index => index - 1)}>
                  back
                </button>
              )}
              <button
                type="button"
                className={`sketch-btn ${isLastStep ? 'sketch-btn--active' : ''}`}
                onClick={() => {
                  if (isLastStep) {
                    onClose()
                    return
                  }
                  setStepIndex(index => index + 1)
                }}
              >
                {isLastStep ? 'start sketching' : 'next step'}
              </button>
            </div>
          </footer>
        </section>
      </div>
    </>
  )
}
