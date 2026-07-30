import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import GridBoot from './GridBoot'
import GridHud from './GridHud'
import useDialogFocus from '../../hooks/useDialogFocus'
import { storageGet, storageSet } from '../../utils/safeStorage'
import { getGridQuality } from './gridPerformance'
import { useVirtualScroll } from './useVirtualScroll'
import {
  STATION_COUNT,
  stationT,
  STATION_ENTER,
  STATION_EXIT,
  PROJECT_SITES,
  content as gridContent,
} from './gridConfig'
import type { SkyState, SkyTooltip, GridSelection } from './city/interaction'
import '../../styles/grid.css'

// Shared promise: the boot bar tracks the same import React.lazy resolves,
// so "grid online" and the chunk actually being ready can never disagree.
let scenePromise: Promise<typeof import('./GridScene')> | null = null
const loadScene = () => (scenePromise ??= import('./GridScene'))
const GridSceneLazy = lazy(loadScene)

type Phase = 'boot' | 'active' | 'exiting'

export default function GridOverlay({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('boot')
  const [chunkReady, setChunkReady] = useState(false)
  const [chunkFailed, setChunkFailed] = useState(false)
  const [station, setStation] = useState(0)
  const [sky, setSky] = useState<SkyState>({ count: 0, live: false, ownStar: false })
  const [tooltip, setTooltip] = useState<SkyTooltip | null>(null)
  const [showHint, setShowHint] = useState(() => storageGet('grid-visited') !== '1')
  // Two-way selection: HUD tabs and in-world clicks drive the same state.
  // `focus` marks an explicit pick — it flies the camera onto that item.
  const [selection, setSelection] = useState<GridSelection>({ project: 0, role: null, focus: null })

  const rootRef = useRef<HTMLDivElement>(null)
  const stationRef = useRef(0)
  const exitIntentRef = useRef<'constellation' | null>(null)
  // Set by the sky-station star drag so travel gestures pause while dragging.
  const dragActiveRef = useRef(false)

  const quality = useMemo(() => getGridQuality(), [])
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )

  useEffect(() => {
    let cancelled = false
    loadScene().then(
      () => { if (!cancelled) setChunkReady(true) },
      () => { if (!cancelled) setChunkFailed(true) },
    )
    return () => { cancelled = true }
  }, [])

  // Same takeover contract as the Sketchbook: main app inert, body scroll
  // locked. The site's custom cursor keeps running — it fits the Grid.
  useLayoutEffect(() => {
    const appRoot = document.getElementById('root')
    const previousOverflow = document.body.style.overflow
    document.documentElement.classList.add('grid-mode')
    appRoot?.setAttribute('inert', '')
    document.body.style.overflow = 'hidden'
    // Parks the main page's background canvas loop while the city renders.
    window.dispatchEvent(new CustomEvent('grid-mode', { detail: { open: true } }))
    return () => {
      document.documentElement.classList.remove('grid-mode')
      appRoot?.removeAttribute('inert')
      document.body.style.overflow = previousOverflow
      window.dispatchEvent(new CustomEvent('grid-mode', { detail: { open: false } }))
    }
  }, [])

  const onProgress = useCallback((progress: number) => {
    if (progress > 0.01) {
      setShowHint(current => {
        if (current) storageSet('grid-visited', '1')
        return false
      })
    }

    // Hysteresis: arrive inside ENTER, depart past EXIT — no flicker when a
    // visitor rests exactly on a boundary.
    const current = stationRef.current
    let next = current
    if (current >= 0 && Math.abs(progress - stationT(current)) > STATION_EXIT) next = -1
    if (next === -1 || current === -1) {
      for (let i = 0; i < STATION_COUNT; i++) {
        if (Math.abs(progress - stationT(i)) < STATION_ENTER) {
          next = i
          break
        }
      }
    }
    if (next !== current) {
      stationRef.current = next
      setStation(next)
      // Any station transition releases a fly-to focus — the rail owns the
      // camera again the moment the visitor travels (focus only makes sense
      // while dwelling at the station it was picked at).
      setSelection(c => (c.focus ? { ...c, focus: null } : c))
    }
  }, [])

  const { progressRef, navigate, setProgress } = useVirtualScroll(rootRef, {
    enabled: phase === 'active',
    reducedMotion,
    dragActiveRef,
    onProgress,
  })

  // Dev-only hook so headless verification can jump the rail deterministically.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const w = window as typeof window & { __grid?: unknown }
    w.__grid = { navigate, setProgress, progressRef }
    return () => { delete w.__grid }
  }, [navigate, setProgress, progressRef])

  const requestClose = useCallback(() => {
    setPhase(current => (current === 'exiting' ? current : 'exiting'))
  }, [])

  useDialogFocus(rootRef, requestClose, phase !== 'exiting')

  const finishExit = useCallback(() => {
    const intent = exitIntentRef.current
    onClose()
    if (intent === 'constellation') {
      window.requestAnimationFrame(() => {
        document.getElementById('constellation')?.scrollIntoView({ behavior: 'smooth' })
      })
    }
  }, [onClose])

  const onBootDone = useCallback(() => setPhase('active'), [])

  const onPlaceStar = useCallback(() => {
    exitIntentRef.current = 'constellation'
    requestClose()
  }, [requestClose])

  const onSky = useCallback((state: SkyState) => setSky(state), [])
  const onTooltip = useCallback((next: SkyTooltip | null) => setTooltip(next), [])
  const onSelectProject = useCallback(
    (index: number) => setSelection(current => ({ ...current, project: index, focus: 'project' })),
    [],
  )
  const onSelectRole = useCallback(
    (index: number | null) =>
      setSelection(current => ({ ...current, role: index, focus: index === null ? null : 'role' })),
    [],
  )
  const onClearFocus = useCallback(
    () => setSelection(current => (current.focus ? { ...current, focus: null } : current)),
    [],
  )

  // Keyboard travel. PgUp/PgDn/Home/End and the digit row jump the rail;
  // at Journey and Projects, ←/→ cycle roles/towers (with fly-to focus) so
  // every record is reachable without a pointer.
  useEffect(() => {
    if (phase !== 'active') return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const clamp = (i: number) => Math.min(STATION_COUNT - 1, Math.max(0, i))
      const near = Math.round(progressRef.current * (STATION_COUNT - 1))
      if (e.key === 'PageDown') {
        e.preventDefault()
        navigate(clamp(near + 1))
      } else if (e.key === 'PageUp') {
        e.preventDefault()
        navigate(clamp(near - 1))
      } else if (e.key === 'Home') {
        e.preventDefault()
        navigate(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        navigate(STATION_COUNT - 1)
      } else if (e.key >= '1' && e.key <= String(Math.min(9, STATION_COUNT))) {
        navigate(Number(e.key) - 1)
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const dir = e.key === 'ArrowRight' ? 1 : -1
        const at = stationRef.current
        if (at === 1) {
          e.preventDefault()
          const count = gridContent.experiences.length
          setSelection(current => {
            const from = current.role ?? (dir > 0 ? -1 : 0)
            const role = ((from + dir) % count + count) % count
            return { ...current, role, focus: 'role' }
          })
        } else if (at === 2) {
          e.preventDefault()
          const count = PROJECT_SITES.length
          setSelection(current => ({
            ...current,
            project: ((current.project + dir) % count + count) % count,
            focus: 'project',
          }))
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, navigate, progressRef])

  const onRootAnimationEnd = useCallback(
    (event: React.AnimationEvent<HTMLDivElement>) => {
      if (event.animationName === 'grid-power-off') finishExit()
    },
    [finishExit],
  )

  const content = (
    <div
      ref={rootRef}
      className={`grid-overlay ${phase === 'exiting' ? 'is-exiting' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="The Grid — interactive 3D portfolio"
      tabIndex={-1}
      onAnimationEnd={onRootAnimationEnd}
    >
      {chunkReady && (
        <>
          <div className="grid-overlay__scene" aria-hidden="true">
            <Suspense fallback={null}>
              <GridSceneLazy
                progressRef={progressRef}
                reducedMotion={reducedMotion}
                quality={quality}
                onSky={onSky}
                onTooltip={onTooltip}
                dragActiveRef={dragActiveRef}
                selection={selection}
                onSelectProject={onSelectProject}
                onSelectRole={onSelectRole}
                onClearFocus={onClearFocus}
              />
            </Suspense>
          </div>
          {phase !== 'boot' && (
            <GridHud
              station={station}
              sky={sky}
              showHint={showHint && !reducedMotion}
              selection={selection}
              onSelectProject={onSelectProject}
              onSelectRole={onSelectRole}
              onClearFocus={onClearFocus}
              onNavigate={navigate}
              onExit={requestClose}
              onPlaceStar={onPlaceStar}
            />
          )}
          {tooltip && (
            <div
              className="grid-tooltip"
              style={{ left: tooltip.x, top: tooltip.y, borderColor: tooltip.color }}
            >
              {tooltip.text}
            </div>
          )}
        </>
      )}

      {phase === 'boot' && (
        <GridBoot chunkReady={chunkReady} reducedMotion={reducedMotion} onDone={onBootDone} failed={chunkFailed} />
      )}
    </div>
  )

  return createPortal(content, document.body)
}
