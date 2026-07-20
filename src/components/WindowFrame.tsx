import { memo, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import useCardTilt from '../hooks/useCardTilt'

interface WindowFrameProps {
  src: string
  alt: string
  /** Path / url text shown in the chrome bar. */
  label: string
  variant?: 'terminal' | 'browser'
  /** Accent color for the frame glow + chrome highlights. */
  accent?: string
  /** CSS aspect-ratio for the screen (reserves space → no layout shift). */
  aspect?: string
  /** Status pill text (e.g. "LIVE"). */
  status?: string
  tilt?: boolean
  /** object-fit for the image. 'cover' fills (may crop); 'contain' letterboxes. */
  fit?: 'cover' | 'contain'
  loading?: 'eager' | 'lazy'
  className?: string
  children?: ReactNode
}

interface WindowFrameShellProps extends WindowFrameProps {
  tiltRef?: Ref<HTMLDivElement>
  tiltProps?: HTMLAttributes<HTMLDivElement>
}

function WindowFrameShell({
  src,
  alt,
  label,
  variant = 'terminal',
  accent = '#00ffff',
  aspect = '16 / 10',
  status,
  fit = 'cover',
  loading = 'lazy',
  className = '',
  children,
  tiltRef,
  tiltProps,
}: WindowFrameShellProps) {
  return (
    <div
      className={`window-frame window-frame--${variant} ${className}`}
      style={{ '--wf-accent': accent } as React.CSSProperties}
    >
      <div
        className="window-frame__tilt"
        ref={tiltRef}
        {...tiltProps}
      >
        <div className="window-frame__chrome">
          <div className="window-frame__dots" aria-hidden="true">
            <span className="window-frame__dot window-frame__dot--r" />
            <span className="window-frame__dot window-frame__dot--y" />
            <span className="window-frame__dot window-frame__dot--g" />
          </div>
          {variant === 'browser' ? (
            <div className="window-frame__url">
              <span className="window-frame__lock">&#9679;</span>
              {label}
            </div>
          ) : (
            <div className="window-frame__path">{label}</div>
          )}
          {status && <div className="window-frame__live">&#9679; {status}</div>}
        </div>

        <div className="window-frame__screen" style={{ aspectRatio: aspect }}>
          <img
            className="window-frame__img"
            src={src}
            alt={alt}
            loading={loading}
            decoding="async"
            draggable={false}
            style={{ objectFit: fit }}
          />
          <span className="window-frame__scan" aria-hidden="true" />
          {children}
        </div>

        <span className="window-frame__corner window-frame__corner--tl" aria-hidden="true" />
        <span className="window-frame__corner window-frame__corner--tr" aria-hidden="true" />
        <span className="window-frame__corner window-frame__corner--bl" aria-hidden="true" />
        <span className="window-frame__corner window-frame__corner--br" aria-hidden="true" />
      </div>
    </div>
  )
}

function TiltedWindowFrame(props: WindowFrameProps) {
  const { ref, tiltProps } = useCardTilt({ max: 6, perspective: 1100 })
  return <WindowFrameShell {...props} tiltRef={ref} tiltProps={tiltProps} />
}

/**
 * In-theme terminal/browser "window" wrapping a screenshot — title-bar dots,
 * path label, corner brackets, scanline sheen, accent glow, and pointer/gyro
 * 3D tilt. The standard presentation for every screenshot in the portfolio.
 */
function WindowFrame(props: WindowFrameProps) {
  if (props.tilt === false) return <WindowFrameShell {...props} />
  return <TiltedWindowFrame {...props} />
}

export default memo(WindowFrame)
