import { memo } from 'react'

interface PhoneFrameProps {
  src: string
  alt: string
  /** Mono caption under the device (e.g. "parkiwell · home"). */
  label?: string
  /** Accent color for the casing edge glow + caption. */
  accent?: string
  /** CSS aspect-ratio for the screen (reserves space → no layout shift). */
  aspect?: string
  loading?: 'eager' | 'lazy'
  className?: string
}

/**
 * In-theme phone bezel for mobile screenshots — rounded casing, punch-hole
 * island, side keys, accent edge glow, and a mono caption. The handheld
 * counterpart to WindowFrame, used wherever the work being shown is a phone
 * app rather than a desktop surface.
 */
function PhoneFrame({
  src,
  alt,
  label,
  accent = '#00ffff',
  aspect = '660 / 1434',
  loading = 'lazy',
  className = '',
}: PhoneFrameProps) {
  return (
    <figure
      className={`phone-frame ${className}`}
      style={{ '--pf-accent': accent } as React.CSSProperties}
    >
      <div className="phone-frame__device">
        <span className="phone-frame__key phone-frame__key--volume" aria-hidden="true" />
        <span className="phone-frame__key phone-frame__key--power" aria-hidden="true" />
        <div className="phone-frame__screen" style={{ aspectRatio: aspect }}>
          <img
            className="phone-frame__img"
            src={src}
            alt={alt}
            loading={loading}
            decoding="async"
            draggable={false}
          />
          <span className="phone-frame__glare" aria-hidden="true" />
        </div>
      </div>
      {label && <figcaption className="phone-frame__label">{label}</figcaption>}
    </figure>
  )
}

export default memo(PhoneFrame)
