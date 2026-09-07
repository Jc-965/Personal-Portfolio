import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import GridBoot from './GridBoot'
import GridHud from './GridHud'
import useDialogFocus from '../../hooks/useDialogFocus'
import { storageGet, storageSet } from '../../utils/safeStorage'
import { getGridQuality } from './gridPerformance'
import { preloadGridAssets } from './gridAssets'
import { useVirtualScroll } from './useVirtualScroll'
import {
  STATION_COUNT,
  stationT,
  STATION_ENTER,
  STATION_EXIT,
  LANDMARKS,
} from './gridConfig'
import type {
  GridSelection,
  GridSkyController,
  SkyState,
  SkyTooltip,
} from './city/interaction'
import '../../styles/grid.css'
import { GridSession } from './navigation/session'

// Shared promise: the boot bar tracks the same import React.lazy resolves,
// so "grid online" and the chunk actually being ready can never disagree.
let scenePromise: Promise<typeof import('./GridScene')> | null = null
const loadScene = () => (scenePromise ??= import('./GridScene'))
const GridSceneLazy = lazy(loadScene)

type Phase = 'boot' | 'active' | 'exiting'

export default function GridOverlay({ onClose }: { onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('boot')
  const [resourcesReady, setResourcesReady] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadProgress, setLoadProgress] = useState(0)
  const [station, setStation] = useState(0)
  const [sky, setSky] = useState<SkyState>({
    count: 0,
    live: false,
    ownStar: false,
    placing: false,
    color: '#00ffff',
    message: '',
    savingMessage: false,
    error: null,
  })
  const [tooltip, setTooltip] = useState<SkyTooltip | null>(null)
  const [showHint, setShowHint] = useState(() => storageGet('grid-visited') !== '1')
  // Two-way selection: HUD tabs and in-world clicks drive the same state.
  // `focus` marks an explicit pick — it flies the camera onto that item.
  const [selection, setSelection] = useState<GridSelection>({ project: 0, role: 0, focus: null })

  const rootRef = useRef<HTMLDivElement>(null)
  const stationRef = useRef(0)
  const exitIntentRef = useRef<'constellation' | null>(null)
  const skyControllerRef = useRef<GridSkyController | null>(null)
  // Set by the sky-station star drag so travel gestures pause while dragging.
  const dragActiveRef = useRef(false)

  const quality = useMemo(() => getGridQuality(), [])
  const reducedMotion = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const session = useMemo(() => new GridSession(reducedMotion), [reducedMotion])
  const navigationSnapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
  useEffect(() => {
    const landmark = LANDMARKS.find(item => item.id === navigationSnapshot.selected)
    if (landmark?.kind === 'platform' && landmark.index !== undefined) { const index = landmark.index; setSelection(current => ({ ...current, role: index, focus: null })) }
    if (landmark?.kind === 'interior' && landmark.index !== undefined) { const index = landmark.index; setSelection(current => ({ ...current, project: index, focus: null })) }
    if ((navigationSnapshot.dialog || navigationSnapshot.mode === 'photo') && document.pointerLockElement) document.exitPointerLock()
  }, [navigationSnapshot.dialog, navigationSnapshot.mode, navigationSnapshot.selected])

  useEffect(() => {
    let cancelled = false
    let sceneReady = false
    let assetProgress = 0
    const publishProgress = () => {
      if (!cancelled) setLoadProgress(assetProgress * 0.86 + (sceneReady ? 0.14 : 0))
    }
    const sceneLoad = loadScene().then(() => {
      sceneReady = true
      publishProgress()
    })
    const assetLoad = preloadGridAssets(progress => {
      assetProgress = progress
      publishProgress()
    })
    void Promise.all([sceneLoad, assetLoad]).then(
      () => {
        if (cancelled) return
        setLoadProgress(1)
        setResourcesReady(true)
      },
      () => {
        if (!cancelled) setLoadFailed(true)
      },
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
    w.__grid = { navigate: session.navigate, travel: session.travel, setProgress, progressRef, session }
    return () => { delete w.__grid }
  }, [session, setProgress, progressRef])

  useEffect(() => {
    if (phase !== 'active') return undefined
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('input,textarea,select,[contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (key === 'p') session.togglePhoto()
      if (key === 't') session.toggleTour()
      if (key === 'm') session.update({ dialog: 'map' })
      if (event.key === 'Enter' && session.getSnapshot().mode === 'photo') session.captureRequested = true
      if (['p', 't', 'm'].includes(key) && document.pointerLockElement) document.exitPointerLock()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, session])

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

  const onOpenConstellation = useCallback(() => {
    exitIntentRef.current = 'constellation'
    requestClose()
  }, [requestClose])

  const onPlaceStar = useCallback(() => {
    skyControllerRef.current?.requestPlacement()
  }, [])
  const onCancelStarPlacement = useCallback(() => {
    skyControllerRef.current?.cancelPlacement()
  }, [])
  const onSetStarColor = useCallback((color: string) => {
    skyControllerRef.current?.setColor(color)
  }, [])
  const onSaveStarMessage = useCallback((message: string) => (
    skyControllerRef.current?.saveMessage(message) ?? Promise.resolve(false)
  ), [])
  const onSkyController = useCallback((controller: GridSkyController | null) => {
    skyControllerRef.current = controller
  }, [])
  const onSky = useCallback((state: SkyState) => setSky(state), [])
  const onTooltip = useCallback((next: SkyTooltip | null) => setTooltip(next), [])
  const onSelectProject = useCallback(
    (index: number) => setSelection(current => ({ ...current, project: index, focus: 'project' })),
    [],
  )
  const onSelectRole = useCallback(
    (index: number | null, options?: { inspect?: boolean }) => {
      setSelection(current => {
        if (index === null) {
          return {
            ...current,
            role: null,
            focus: current.focus === 'role' ? null : current.focus,
          }
        }
        const inspect = options?.inspect ?? true
        const focus = inspect || current.focus === 'role' ? 'role' as const : null
        return { ...current, role: index, focus }
      })
    },
    [],
  )
  const onClearFocus = useCallback(
    () => setSelection(current => (current.focus ? { ...current, focus: null } : current)),
    [],
  )

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
      data-grid-phase={phase}
      data-grid-station={station}
      data-grid-sky-own={sky.ownStar}
      data-grid-sky-placing={sky.placing}
      role="dialog"
      aria-modal="true"
      aria-label="The Grid — interactive 3D portfolio"
      tabIndex={-1}
      onAnimationEnd={onRootAnimationEnd}
    >
      {resourcesReady && (
        <>
          <div className="grid-overlay__scene" aria-hidden="true">
            <Suspense fallback={null}>
              <GridSceneLazy
                session={session}
                progressRef={progressRef}
                reducedMotion={reducedMotion}
                quality={quality}
                onSky={onSky}
                onSkyController={onSkyController}
                onTooltip={onTooltip}
                dragActiveRef={dragActiveRef}
                selection={selection}
                onSelectProject={onSelectProject}
                onSelectRole={onSelectRole}
                onClearFocus={onClearFocus}
                onPlaceStar={onPlaceStar}
              />
            </Suspense>
          </div>
          {phase !== 'boot' && (
            <GridHud
              session={session}
              navigation={navigationSnapshot}
              reducedMotion={reducedMotion}
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
              onCancelStarPlacement={onCancelStarPlacement}
              onSetStarColor={onSetStarColor}
              onSaveStarMessage={onSaveStarMessage}
              onOpenConstellation={onOpenConstellation}
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
        <GridBoot
          ready={resourcesReady}
          progress={loadProgress}
          reducedMotion={reducedMotion}
          onDone={onBootDone}
          failed={loadFailed}
        />
      )}
    </div>
  )

  return createPortal(content, document.body)
}
