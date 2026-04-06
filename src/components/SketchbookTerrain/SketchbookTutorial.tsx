import { useState, type CSSProperties } from 'react'

interface SketchbookTutorialProps {
  onClose: () => void
}

type TutorialStep = {
  id: 'survey' | 'explore' | 'capture'
  eyebrow: string
  title: string
  body: string
  graphicCaption: string
  controls: string[]
  callouts: { label: string; x: string; y: string }[]
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'survey',
    eyebrow: 'step 1',
    title: 'survey the field and sculpt the terrain',
    body: 'Start in Sculpt mode. Drag to look around, scroll to zoom, use Q and E to rotate, and use R and C to move up or down. Turn Sculpt on when you want to raise, lower, or smooth the terrain.',
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
    body: 'Switch to Explore. Click the scene to lock your view, move with WASD, and use the mouse to look around. Q and E turn, R and C move vertically, Tab changes modes, and Escape frees the cursor.',
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
    body: 'Press Photo to capture two images: your exact view and a cleaner recommended angle. Hide the UI if you want a cleaner frame, then save or copy the shot you want from the contact sheet.',
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
        >
          <header className="sketch-tutorial__header">
            <div className="sketch-tutorial__copy">
              <span className="sketch-tutorial__eyebrow">field guide</span>
              <h2 id="sketch-tutorial-title" className="sketch-tutorial__title">how the sketchbook works</h2>
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
            </div>

            <div className="sketch-tutorial__panel">
              <div className="sketch-tutorial__panel-head">
                <span className="sketch-tutorial__step-tag">{step.eyebrow}</span>
                <h3 className="sketch-tutorial__panel-title">{step.title}</h3>
              </div>
              <p className="sketch-tutorial__panel-body">{step.body}</p>

              <div className="sketch-tutorial__controls-block">
                <span className="sketch-tutorial__controls-label">controls</span>
                <div className="sketch-tutorial__controls">
                  {step.controls.map(control => (
                    <span key={control} className="sketch-tutorial__control-chip">{control}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <footer className="sketch-tutorial__footer">
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
