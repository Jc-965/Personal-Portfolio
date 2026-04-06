interface FloatingDoodlesProps {
  scrollOffset: number
}

/** Parallax-driven decorative sketches floating at different depths */
export default function FloatingDoodles({ scrollOffset }: FloatingDoodlesProps) {
  return (
    <div className="sp-doodles" aria-hidden="true">
      {/* Slow layer — farthest */}
      <svg
        className="sp-doodle sp-doodle--1"
        style={{ transform: `translateY(${scrollOffset * -0.08}px)` }}
        width="60" height="60" viewBox="0 0 60 60"
      >
        <rect x="10" y="10" width="40" height="40" rx="2" fill="none" stroke="currentColor" strokeWidth="0.8" strokeDasharray="4 3" />
        <line x1="15" y1="22" x2="45" y2="22" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
        <line x1="15" y1="30" x2="38" y2="30" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
        <line x1="15" y1="38" x2="42" y2="38" stroke="currentColor" strokeWidth="0.5" opacity="0.25" />
      </svg>

      {/* Small circle cluster */}
      <svg
        className="sp-doodle sp-doodle--2"
        style={{ transform: `translateY(${scrollOffset * -0.15}px) rotate(${scrollOffset * 0.02}deg)` }}
        width="40" height="40" viewBox="0 0 40 40"
      >
        <circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="0.7" />
        <circle cx="20" cy="20" r="5" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="2 2" />
        <circle cx="20" cy="20" r="1.5" fill="currentColor" opacity="0.3" />
      </svg>

      {/* Wavy line */}
      <svg
        className="sp-doodle sp-doodle--3"
        style={{ transform: `translateY(${scrollOffset * -0.12}px)` }}
        width="80" height="20" viewBox="0 0 80 20"
      >
        <path d="M2 10 Q12 3 22 10 T42 10 T62 10 T78 10" fill="none" stroke="currentColor" strokeWidth="0.7" strokeLinecap="round" />
      </svg>

      {/* Star/asterisk */}
      <svg
        className="sp-doodle sp-doodle--4"
        style={{ transform: `translateY(${scrollOffset * -0.2}px) rotate(${scrollOffset * -0.03}deg)` }}
        width="30" height="30" viewBox="0 0 30 30"
      >
        <line x1="15" y1="4" x2="15" y2="26" stroke="currentColor" strokeWidth="0.8" />
        <line x1="4" y1="15" x2="26" y2="15" stroke="currentColor" strokeWidth="0.8" />
        <line x1="7" y1="7" x2="23" y2="23" stroke="currentColor" strokeWidth="0.6" />
        <line x1="23" y1="7" x2="7" y2="23" stroke="currentColor" strokeWidth="0.6" />
      </svg>

      {/* Arrow pointing down */}
      <svg
        className="sp-doodle sp-doodle--5"
        style={{ transform: `translateY(${scrollOffset * -0.1}px)` }}
        width="24" height="50" viewBox="0 0 24 50"
      >
        <path d="M12 2 L12 42 M6 36 L12 44 L18 36" fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      {/* Grid dots */}
      <svg
        className="sp-doodle sp-doodle--6"
        style={{ transform: `translateY(${scrollOffset * -0.18}px)` }}
        width="50" height="50" viewBox="0 0 50 50"
      >
        {[10, 25, 40].map(x =>
          [10, 25, 40].map(y => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="1.2" fill="currentColor" opacity="0.25" />
          ))
        )}
      </svg>

      {/* Bracket */}
      <svg
        className="sp-doodle sp-doodle--7"
        style={{ transform: `translateY(${scrollOffset * -0.14}px)` }}
        width="20" height="60" viewBox="0 0 20 60"
      >
        <path d="M16 4 Q4 4 4 30 Q4 56 16 56" fill="none" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" />
      </svg>
    </div>
  )
}
