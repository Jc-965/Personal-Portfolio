import { lazy, Suspense, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import CityWorld from './city/CityWorld'
import { sampleRail, nearestStation, validateRail } from './city/rail'
import { gradeSceneBg } from './city/sceneColor'
import { focusPose } from './city/focus'
import { stationT, BG_COLOR } from './gridConfig'
import type { GridQuality } from './gridPerformance'
import type { GridSelection, GridSkyController, SkyState, SkyTooltip } from './city/interaction'

const GridEffects = lazy(() => import('./GridEffects'))

export interface GridSceneProps {
  /** Target rail progress 0..1, written by the overlay's virtual scroll. */
  progressRef: MutableRefObject<number>
  reducedMotion: boolean
  quality: GridQuality
  onSky?: (state: SkyState) => void
  onSkyController?: (controller: GridSkyController | null) => void
  onTooltip?: (tooltip: SkyTooltip | null) => void
  /** Set true by the sky-station star drag so travel gestures pause. */
  dragActiveRef?: MutableRefObject<boolean>
  selection: GridSelection
  onSelectProject: (index: number) => void
  onSelectRole: (index: number | null, options?: { inspect?: boolean }) => void
  /** Clicking empty street releases a fly-to focus back to the rail view. */
  onClearFocus?: () => void
  /** In-world sky-deck CTA: begin placing a star directly in the 3D sky. */
  onPlaceStar?: () => void
}

/**
 * Camera rig: chases the scroll target with exponential damping so wheel
 * steps melt into one continuous dolly. The camera moves ONLY under user
 * scroll — never autonomously — and never rolls; at rest the only motion is
 * a ±1.5° pointer parallax. Reduced-motion visitors get station cuts instead
 * of travel: progress snaps to the nearest station, no sustained dolly.
 *
 * One authored exception: an explicit project/role selection blends the rig
 * off the rail into that item's hero pose (see city/focus.ts). The blend
 * weight is tied to station proximity, so any scroll immediately starts
 * handing control back to the rail.
 */
function CameraRig({
  progressRef,
  reducedMotion,
  selection,
}: {
  progressRef: MutableRefObject<number>
  reducedMotion: boolean
  selection: GridSelection
}) {
  const { camera, scene, gl } = useThree()
  const current = useRef(0)
  const focusWeight = useRef(0)
  const pointer = useRef({ x: 0, y: 0 })
  const sample = useMemo(
    () => ({ position: new THREE.Vector3(), lookAt: new THREE.Vector3() }),
    [],
  )
  const smoothedPointer = useRef({ x: 0, y: 0 })
  const scratch = useMemo(
    () => ({
      forward: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      look: new THREE.Vector3(),
    }),
    [],
  )

  useEffect(() => {
    if (import.meta.env.DEV) {
      const w = window as typeof window & {
        __gridRenderer?: THREE.WebGLRenderer
        __gridCamera?: unknown
        __gridScene?: unknown
        __gridRail?: string[]
      }
      w.__gridRenderer = gl
      w.__gridCamera = camera
      w.__gridScene = scene
      // Guard the whole class of "camera flies through a building" bugs.
      const problems = validateRail()
      w.__gridRail = problems
      if (problems.length > 0) console.warn('[grid] rail collisions:\n' + problems.join('\n'))
    }
  }, [camera, scene, gl])

  useEffect(() => {
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)')
    if (!finePointer.matches) return undefined
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useFrame((_, delta) => {
    const target = reducedMotion
      ? stationT(nearestStation(progressRef.current))
      : progressRef.current

    if (reducedMotion) {
      current.current = target
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.1) * 4.2)
      current.current += (target - current.current) * k
    }

    // District color script: one shared Color grades every material + clear.
    gl.setClearColor(gradeSceneBg(current.current))

    sampleRail(current.current, sample)

    // Fly-to focus: blend toward the selected item's hero pose. Weight is
    // gated by proximity to the pose's station so scrolling away releases
    // the camera even before the overlay clears the selection.
    const pose = focusPose(selection)
    let weightTarget = 0
    if (pose) {
      weightTarget = Math.max(
        0,
        1 - Math.min(1, Math.abs(current.current - stationT(pose.station)) / 0.06),
      )
    }
    if (reducedMotion) {
      focusWeight.current = weightTarget
    } else {
      const fk = 1 - Math.exp(-Math.min(delta, 0.1) * 3)
      focusWeight.current += (weightTarget - focusWeight.current) * fk
    }
    if (pose && focusWeight.current > 0.001) {
      const w = focusWeight.current * focusWeight.current * (3 - 2 * focusWeight.current)
      sample.position.lerp(pose.position, w)
      sample.lookAt.lerp(pose.lookAt, w)
    }

    camera.position.copy(sample.position)

    // Pointer parallax around the authored gaze, eased so it never jitters.
    const pk = 1 - Math.exp(-Math.min(delta, 0.1) * 6)
    smoothedPointer.current.x += (pointer.current.x - smoothedPointer.current.x) * pk
    smoothedPointer.current.y += (pointer.current.y - smoothedPointer.current.y) * pk

    scratch.forward.copy(sample.lookAt).sub(sample.position).normalize()
    scratch.right.crossVectors(scratch.forward, scratch.up).normalize()
    scratch.look
      .copy(sample.lookAt)
      .addScaledVector(scratch.right, smoothedPointer.current.x * 1.6)
      .addScaledVector(scratch.up, -smoothedPointer.current.y * 1.1)
    camera.up.set(0, 1, 0)
    camera.lookAt(scratch.look)
  })

  return null
}

export default function GridScene({
  progressRef,
  reducedMotion,
  quality,
  onSky,
  onSkyController,
  onTooltip,
  dragActiveRef,
  selection,
  onSelectProject,
  onSelectRole,
  onClearFocus,
  onPlaceStar,
}: GridSceneProps) {
  const interaction = useMemo(
    () => ({
      progressRef,
      dragActiveRef,
      onSky,
      onSkyController,
      onTooltip,
      selection,
      onSelectProject,
      onSelectRole,
      onPlaceStar,
    }),
    [
      progressRef,
      dragActiveRef,
      onSky,
      onSkyController,
      onTooltip,
      selection,
      onSelectProject,
      onSelectRole,
      onPlaceStar,
    ],
  )
  return (
    <Canvas
      dpr={[1, quality.maxDpr]}
      shadows={quality.shadows ?? quality.tier !== 'low'}
      gl={{
        antialias: quality.antialias,
        powerPreference: 'high-performance',
        alpha: false,
      }}
      camera={{ fov: 55, near: 0.1, far: 800, position: [0, 7, 46] }}
      // Constellation stars are far-away points; without a generous threshold
      // the raycaster would need pixel-perfect hits for hover/drag.
      raycaster={{ params: { Mesh: {}, LOD: {}, Sprite: {}, Points: { threshold: 5 }, Line: { threshold: 1 } } }}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color(BG_COLOR))
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 0.92
      }}
      // A click that hits no interactive mesh hands the camera back to the
      // rail — the "step back from the exhibit" gesture.
      onPointerMissed={event => {
        if (event.type === 'click') onClearFocus?.()
      }}
    >
      <Suspense fallback={null}>
        <CameraRig progressRef={progressRef} reducedMotion={reducedMotion} selection={selection} />
        <CityWorld quality={quality} interaction={interaction} />
      </Suspense>
      {quality.postEnabled && <Suspense fallback={null}><GridEffects enabled msaa={quality.msaa} /></Suspense>}
    </Canvas>
  )
}
