import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import CityWorld from './city/CityWorld'
import GridEffects from './GridEffects'
import { sampleRail, nearestStation, validateRail } from './city/rail'
import { stationT, BG_COLOR } from './gridConfig'
import type { GridQuality } from './gridPerformance'
import type { SkyState, SkyTooltip, GridSelection } from './city/interaction'

export interface GridSceneProps {
  /** Target rail progress 0..1, written by the overlay's virtual scroll. */
  progressRef: MutableRefObject<number>
  reducedMotion: boolean
  quality: GridQuality
  onSky?: (state: SkyState) => void
  onTooltip?: (tooltip: SkyTooltip | null) => void
  /** Set true by the sky-station star drag so travel gestures pause. */
  dragActiveRef?: MutableRefObject<boolean>
  selection: GridSelection
  onSelectProject: (index: number) => void
  onSelectRole: (index: number | null) => void
}

/**
 * Camera rig: chases the scroll target with exponential damping so wheel
 * steps melt into one continuous dolly. The camera moves ONLY under user
 * scroll — never autonomously — and never rolls; at rest the only motion is
 * a ±1.5° pointer parallax. Reduced-motion visitors get station cuts instead
 * of travel: progress snaps to the nearest station, no sustained dolly.
 */
function CameraRig({ progressRef, reducedMotion }: { progressRef: MutableRefObject<number>; reducedMotion: boolean }) {
  const { camera, scene } = useThree()
  const current = useRef(0)
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
      const w = window as typeof window & { __gridCamera?: unknown; __gridScene?: unknown }
      w.__gridCamera = camera
      w.__gridScene = scene
      // Guard the whole class of "camera flies through a building" bugs.
      const problems = validateRail()
      if (problems.length > 0) console.warn('[grid] rail collisions:\n' + problems.join('\n'))
    }
  }, [camera, scene])

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

    sampleRail(current.current, sample)
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
  onTooltip,
  dragActiveRef,
  selection,
  onSelectProject,
  onSelectRole,
}: GridSceneProps) {
  const interaction = useMemo(
    () => ({ progressRef, dragActiveRef, onSky, onTooltip, selection, onSelectProject, onSelectRole }),
    [progressRef, dragActiveRef, onSky, onTooltip, selection, onSelectProject, onSelectRole],
  )
  return (
    <Canvas
      dpr={[1, quality.maxDpr]}
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
      }}
    >
      <CameraRig progressRef={progressRef} reducedMotion={reducedMotion} />
      <CityWorld towerDensity={quality.towerDensity} tier={quality.tier} interaction={interaction} />
      <GridEffects enabled={quality.postEnabled} />
    </Canvas>
  )
}
