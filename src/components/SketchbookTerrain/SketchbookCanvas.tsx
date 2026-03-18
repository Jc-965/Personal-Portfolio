/* eslint-disable react/no-unknown-property */
import { forwardRef, useRef, useEffect, useState, useCallback, useImperativeHandle } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Terrain from './Terrain'
import TerrainPopulation from './TerrainPopulation'
import SketchPostProcessing from './SketchPostProcessing'
import { getTerrainHeight } from './noiseUtils'
import useIsPhone from '../../hooks/useIsPhone'
import useTouchDevice from '../../hooks/useTouchDevice'
import { useGyroscope } from '../../context/GyroscopeContext'
import { useTerrainDeformation, type BrushMode, DEFAULT_DECAY_AMOUNT } from './useTerrainDeformation'

function CursorEnforcer() {
  const { gl } = useThree()
  useFrame(() => {
    const canvas = gl.domElement
    if (canvas.style.cursor !== 'none') {
      canvas.style.setProperty('cursor', 'none', 'important')
    }
  })
  return null
}

function SceneCleanup() {
  const { gl, scene } = useThree()

  useEffect(() => {
    return () => {
      scene.traverse((obj: THREE.Object3D) => {
        if ((obj as THREE.Mesh).isMesh || (obj as THREE.InstancedMesh).isInstancedMesh) {
          const m = obj as THREE.Mesh
          m.geometry?.dispose()
          const mats = Array.isArray(m.material) ? m.material : [m.material]
          for (const mat of mats) {
            if (!mat) continue
            for (const val of Object.values(mat as unknown as Record<string, unknown>)) {
              if (val instanceof THREE.Texture) val.dispose()
            }
            ;(mat as THREE.Material).dispose()
          }
        }
      })
      gl.renderLists.dispose()
      gl.dispose()
    }
  }, [gl, scene])

  return null
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const VIEWS = [
  { name: 'landscape', pos: [0, 10, 30], look: [0, 3, -14] },
  { name: 'forest', pos: [22, 7, 20], look: [-8, 3, -10] },
  { name: 'aerial', pos: [0, 32, 10], look: [0, 1, -8] },
  { name: 'wander', pos: [-24, 8, 22], look: [12, 3, -12] },
] as const

const DEFAULT_VIEW_INDEX = 0
const DEFAULT_SPAWN_ZOOM = 0.48
const TERRAIN_WORLD_SIZE = 140
const TERRAIN_HALF_SIZE = TERRAIN_WORLD_SIZE * 0.5
const RECOMMENDED_CAPTURE_VIEW = {
  pos: [18, 15, 26],
  look: [-2, 4, -10],
} as const
const RECOMMENDED_CAPTURE_MARGIN = 10
const RECOMMENDED_CAPTURE_RADII = [26, 34, 44, 56] as const
const RECOMMENDED_CAPTURE_ANGLE_STEPS = 16
const RECOMMENDED_CAPTURE_GRID_STEP = 12
const RECOMMENDED_CAPTURE_RELIEF_SAMPLE = 5

export interface SketchbookCanvasCaptureSet {
  current: string
  recommended: string
}

interface SketchbookCanvasCaptureOptions {
  onCurrentCaptured?: (current: string) => void
}

export interface SketchbookCanvasHandle {
  capturePhotos: (options?: SketchbookCanvasCaptureOptions) => Promise<SketchbookCanvasCaptureSet>
}

type CameraOverride = {
  position: THREE.Vector3
  lookAt: THREE.Vector3
}

type TerrainHeightSampler = (x: number, z: number) => number
type TerrainFeatureMetrics = {
  centerHeight: number
  nearAverage: number
  surroundingRelief: number
  prominence: number
  peakPenalty: number
  moderateHeightScore: number
  anchorHeight: number
}

const clampTerrainBounds = (value: number) => clamp(
  value,
  -TERRAIN_HALF_SIZE + RECOMMENDED_CAPTURE_MARGIN,
  TERRAIN_HALF_SIZE - RECOMMENDED_CAPTURE_MARGIN,
)

const shortestAngleDistance = (a: number, b: number) => {
  const delta = Math.atan2(Math.sin(a - b), Math.cos(a - b))
  return Math.abs(delta)
}

const collectSceneSubjects = (group: THREE.Group | null) => {
  if (!group) return []

  return group.children.map(child => {
    const position = new THREE.Vector3()
    child.getWorldPosition(position)
    return position
  })
}

const estimateCameraFocusPoint = (camera: THREE.Camera, sampleTerrainHeight: TerrainHeightSampler) => {
  const forward = new THREE.Vector3()
  camera.getWorldDirection(forward)

  let bestPoint = new THREE.Vector3(0, sampleTerrainHeight(0, 0), 0)
  let bestScore = Number.POSITIVE_INFINITY

  for (let distance = 10; distance <= 92; distance += 2) {
    const sampleX = clampTerrainBounds(camera.position.x + forward.x * distance)
    const sampleZ = clampTerrainBounds(camera.position.z + forward.z * distance)
    const groundY = sampleTerrainHeight(sampleX, sampleZ)
    const rayY = camera.position.y + forward.y * distance
    const score = Math.abs(rayY - (groundY + 3.2))
    if (score < bestScore) {
      bestScore = score
      bestPoint.set(sampleX, groundY, sampleZ)
    }
  }

  return bestPoint
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)

const range = (values: number[]) => {
  if (values.length === 0) return 0
  let minValue = values[0]
  let maxValue = values[0]
  values.forEach(value => {
    minValue = Math.min(minValue, value)
    maxValue = Math.max(maxValue, value)
  })
  return maxValue - minValue
}

const sampleRingHeights = (
  x: number,
  z: number,
  radius: number,
  steps: number,
  sampleTerrainHeight: TerrainHeightSampler,
) => {
  const heights: number[] = []

  for (let step = 0; step < steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2
    heights.push(sampleTerrainHeight(
      clampTerrainBounds(x + Math.cos(angle) * radius),
      clampTerrainBounds(z + Math.sin(angle) * radius),
    ))
  }

  return heights
}

const sampleTerrainRelief = (x: number, z: number, sampleTerrainHeight: TerrainHeightSampler) => {
  const center = sampleTerrainHeight(x, z)
  let maxHeight = center
  let minHeight = center
  let edgeChange = 0
  let samples = 0

  const offsets: [number, number][] = [
    [RECOMMENDED_CAPTURE_RELIEF_SAMPLE, 0],
    [-RECOMMENDED_CAPTURE_RELIEF_SAMPLE, 0],
    [0, RECOMMENDED_CAPTURE_RELIEF_SAMPLE],
    [0, -RECOMMENDED_CAPTURE_RELIEF_SAMPLE],
    [RECOMMENDED_CAPTURE_RELIEF_SAMPLE * 0.75, RECOMMENDED_CAPTURE_RELIEF_SAMPLE * 0.75],
    [-RECOMMENDED_CAPTURE_RELIEF_SAMPLE * 0.75, RECOMMENDED_CAPTURE_RELIEF_SAMPLE * 0.75],
    [RECOMMENDED_CAPTURE_RELIEF_SAMPLE * 0.75, -RECOMMENDED_CAPTURE_RELIEF_SAMPLE * 0.75],
    [-RECOMMENDED_CAPTURE_RELIEF_SAMPLE * 0.75, -RECOMMENDED_CAPTURE_RELIEF_SAMPLE * 0.75],
  ]

  offsets.forEach(([dx, dz]) => {
    const height = sampleTerrainHeight(
      clampTerrainBounds(x + dx),
      clampTerrainBounds(z + dz),
    )
    maxHeight = Math.max(maxHeight, height)
    minHeight = Math.min(minHeight, height)
    edgeChange += Math.abs(height - center)
    samples += 1
  })

  return (maxHeight - minHeight) + edgeChange / Math.max(samples, 1)
}

const getTerrainFeatureMetrics = (x: number, z: number, sampleTerrainHeight: TerrainHeightSampler): TerrainFeatureMetrics => {
  const centerHeight = sampleTerrainHeight(x, z)
  const nearRing = sampleRingHeights(x, z, 8, 12, sampleTerrainHeight)
  const midRing = sampleRingHeights(x, z, 16, 16, sampleTerrainHeight)
  const farRing = sampleRingHeights(x, z, 28, 20, sampleTerrainHeight)

  const nearAverage = average(nearRing)
  const midAverage = average(midRing)
  const farAverage = average(farRing)
  const nearRelief = range(nearRing)
  const midRelief = range(midRing)
  const farRelief = range(farRing)
  const prominence = centerHeight - nearAverage
  const plateauFraction = nearRing.filter(height => Math.abs(height - centerHeight) < 2).length / Math.max(nearRing.length, 1)
  const broadRelief = nearRelief * 0.4 + midRelief * 0.9 + farRelief * 0.55
  const peakIsolation = clamp((prominence - (nearRelief * 0.2 + 1.6)) / 7.5, 0, 1)
  const peakPenalty = peakIsolation * (1 - plateauFraction * 0.7)
  const moderateHeightScore = clamp(1 - Math.abs(centerHeight - ((midAverage + farAverage) * 0.5)) / 9, 0, 1)
  const anchorHeight = THREE.MathUtils.lerp(
    centerHeight,
    nearAverage,
    clamp(0.2 + peakPenalty * 0.58, 0.2, 0.76),
  )

  return {
    centerHeight,
    nearAverage,
    surroundingRelief: broadRelief,
    prominence,
    peakPenalty,
    moderateHeightScore,
    anchorHeight,
  }
}

const sampleTerrainGradientAngle = (x: number, z: number, sampleTerrainHeight: TerrainHeightSampler) => {
  const dx =
    sampleTerrainHeight(clampTerrainBounds(x + RECOMMENDED_CAPTURE_RELIEF_SAMPLE), z) -
    sampleTerrainHeight(clampTerrainBounds(x - RECOMMENDED_CAPTURE_RELIEF_SAMPLE), z)
  const dz =
    sampleTerrainHeight(x, clampTerrainBounds(z + RECOMMENDED_CAPTURE_RELIEF_SAMPLE)) -
    sampleTerrainHeight(x, clampTerrainBounds(z - RECOMMENDED_CAPTURE_RELIEF_SAMPLE))

  if (Math.abs(dx) + Math.abs(dz) < 0.001) return null
  return Math.atan2(dz, dx)
}

const scoreSightlineClearance = (
  position: THREE.Vector3,
  lookAt: THREE.Vector3,
  sampleTerrainHeight: TerrainHeightSampler,
) => {
  let minClearance = Number.POSITIVE_INFINITY

  for (let step = 1; step <= 10; step += 1) {
    const t = step / 11
    const sampleX = THREE.MathUtils.lerp(position.x, lookAt.x, t)
    const sampleZ = THREE.MathUtils.lerp(position.z, lookAt.z, t)
    const rayY = THREE.MathUtils.lerp(position.y, lookAt.y, t)
    const terrainY = sampleTerrainHeight(sampleX, sampleZ)
    minClearance = Math.min(minClearance, rayY - terrainY)
  }

  return clamp((minClearance - 1.2) / 4.8, 0, 1)
}

const getRecommendedCaptureView = (
  camera: THREE.Camera,
  subjectPoints: THREE.Vector3[],
  sampleTerrainHeight: TerrainHeightSampler,
) => {
  const currentFocus = estimateCameraFocusPoint(camera, sampleTerrainHeight)
  const subjectCenter = subjectPoints.length > 0
    ? subjectPoints.reduce((sum, point) => sum.add(point), new THREE.Vector3()).multiplyScalar(1 / subjectPoints.length)
    : null

  const focus = currentFocus.clone()
  let bestFocusScore = Number.NEGATIVE_INFINITY
  let bestFocusMetrics = getTerrainFeatureMetrics(focus.x, focus.z, sampleTerrainHeight)

  for (let x = -48; x <= 48; x += RECOMMENDED_CAPTURE_GRID_STEP) {
    for (let z = -48; z <= 48; z += RECOMMENDED_CAPTURE_GRID_STEP) {
      const feature = getTerrainFeatureMetrics(x, z, sampleTerrainHeight)
      const currentBias = Math.exp(-(
        (x - currentFocus.x) * (x - currentFocus.x) +
        (z - currentFocus.z) * (z - currentFocus.z)
      ) / (30 * 30))
      const centerBias = 1 - Math.min(Math.hypot(x, z) / 58, 1)
      const edgeBias = clamp((TERRAIN_HALF_SIZE - Math.max(Math.abs(x), Math.abs(z)) - 8) / 18, 0, 1)

      let subjectBias = 0
      subjectPoints.forEach(point => {
        const dx = point.x - x
        const dz = point.z - z
        subjectBias += Math.exp(-(dx * dx + dz * dz) / (24 * 24))
      })

      const subjectCenterBias = subjectCenter
        ? Math.exp(-(
          (subjectCenter.x - x) * (subjectCenter.x - x) +
          (subjectCenter.z - z) * (subjectCenter.z - z)
        ) / (30 * 30))
        : 0

      const score =
        feature.surroundingRelief * 0.98 +
        subjectBias * 1.75 +
        currentBias * 1.15 +
        subjectCenterBias * 0.85 +
        centerBias * 0.4 +
        feature.moderateHeightScore * 0.82 +
        edgeBias * 0.45 -
        feature.peakPenalty * 2.45 -
        clamp(Math.max(feature.prominence, 0) / 12, 0, 1) * 0.72

      if (score > bestFocusScore) {
        bestFocusScore = score
        focus.set(x, feature.centerHeight, z)
        bestFocusMetrics = feature
      }
    }
  }

  focus.y = bestFocusMetrics.centerHeight
  const currentAngle = Math.atan2(camera.position.z - focus.z, camera.position.x - focus.x)
  const slopeAngle = sampleTerrainGradientAngle(focus.x, focus.z, sampleTerrainHeight)
  const subjectFrameBias = subjectPoints.length > 0
    ? clamp(subjectPoints.reduce((sum, point) => {
      const dx = point.x - focus.x
      const dz = point.z - focus.z
      return sum + Math.exp(-(dx * dx + dz * dz) / (26 * 26))
    }, 0) / Math.max(subjectPoints.length, 1), 0, 1)
    : 0

  let bestCandidate: CameraOverride | null = null
  let bestCandidateScore = Number.NEGATIVE_INFINITY

  for (let index = 0; index < RECOMMENDED_CAPTURE_ANGLE_STEPS; index += 1) {
    const angle = (index / RECOMMENDED_CAPTURE_ANGLE_STEPS) * Math.PI * 2

    for (const radius of RECOMMENDED_CAPTURE_RADII) {
      const boostedRadius = radius + Math.max(bestFocusMetrics.prominence, 0) * 1.45 + bestFocusMetrics.peakPenalty * 18
      const sampleX = clampTerrainBounds(focus.x + Math.cos(angle) * boostedRadius)
      const sampleZ = clampTerrainBounds(focus.z + Math.sin(angle) * boostedRadius)
      const distance = Math.hypot(sampleX - focus.x, sampleZ - focus.z)
      if (distance < 18) continue

      const localGround = sampleTerrainHeight(sampleX, sampleZ)
      const lookAt = new THREE.Vector3(
        focus.x,
        bestFocusMetrics.anchorHeight + clamp(2.3 + bestFocusMetrics.surroundingRelief * 0.16, 2.2, 5.2),
        focus.z,
      )
      const position = new THREE.Vector3(
        sampleX,
        localGround + clamp(8.8 + bestFocusMetrics.surroundingRelief * 0.5 + distance * 0.06, 10.2, 18.5),
        sampleZ,
      )

      const sightlineScore = scoreSightlineClearance(position, lookAt, sampleTerrainHeight)
      const angleDelta = shortestAngleDistance(angle, currentAngle)
      const noveltyScore = clamp(1 - Math.abs(angleDelta - 1.02) / 1.1, 0, 1)
      const pitch = Math.atan2(position.y - lookAt.y, distance)
      const pitchScore = clamp(1 - Math.abs(pitch - 0.34) / 0.24, 0, 1)
      const standoffScore = clamp(
        (distance - (24 + Math.max(bestFocusMetrics.prominence, 0) * 1.4)) / 24 + 0.5,
        0,
        1,
      )
      const slopeScore = slopeAngle == null
        ? 0.65
        : clamp(1 - shortestAngleDistance(angle, slopeAngle + Math.PI) / Math.PI, 0, 1)
      const edgeScore = clamp((TERRAIN_HALF_SIZE - Math.max(Math.abs(sampleX), Math.abs(sampleZ)) - 6) / 18, 0, 1)
      const reliefScore = clamp(bestFocusMetrics.surroundingRelief / 8, 0, 1)
      const foregroundReliefScore = clamp(
        sampleTerrainRelief(
          THREE.MathUtils.lerp(sampleX, focus.x, 0.34),
          THREE.MathUtils.lerp(sampleZ, focus.z, 0.34),
          sampleTerrainHeight,
        ) / 7,
        0,
        1,
      )
      const midgroundReliefScore = clamp(
        sampleTerrainRelief(
          THREE.MathUtils.lerp(sampleX, focus.x, 0.62),
          THREE.MathUtils.lerp(sampleZ, focus.z, 0.62),
          sampleTerrainHeight,
        ) / 7,
        0,
        1,
      )
      const dominancePenalty = clamp(
        (
          (Math.max(bestFocusMetrics.prominence, 0) + bestFocusMetrics.surroundingRelief * 0.26) /
          Math.max(distance, 1) -
          0.26
        ) / 0.16,
        0,
        1,
      ) * (0.45 + bestFocusMetrics.peakPenalty)

      const score =
        sightlineScore * 3.4 +
        noveltyScore * 1.8 +
        slopeScore * 1.4 +
        pitchScore * 1.05 +
        standoffScore * 1.15 +
        edgeScore * 0.9 +
        reliefScore * 0.85 +
        foregroundReliefScore * 0.62 +
        midgroundReliefScore * 0.5 +
        subjectFrameBias * 0.75 -
        dominancePenalty * 3.25 -
        bestFocusMetrics.peakPenalty * 0.75

      if (score > bestCandidateScore) {
        bestCandidateScore = score
        bestCandidate = { position, lookAt }
      }
    }
  }

  return bestCandidate ?? {
    position: new THREE.Vector3(...RECOMMENDED_CAPTURE_VIEW.pos),
    lookAt: new THREE.Vector3(...RECOMMENDED_CAPTURE_VIEW.look),
  }
}

const getTouchDistance = (touches: TouchList) => {
  if (touches.length < 2) return 0
  const [first, second] = [touches[0], touches[1]]
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
}

interface CameraControllerProps {
  mouseRef: React.MutableRefObject<{ x: number; y: number; active: boolean }>
  gyroRef: React.MutableRefObject<{ x: number; y: number }>
  keysRef: React.MutableRefObject<Set<string>>
  touchLookRef: React.MutableRefObject<{ x: number; y: number }>
  cameraOverrideRef: React.MutableRefObject<CameraOverride | null>
  isMobile: boolean
  viewIndex: number
  zoom: number
}

function CameraController({ mouseRef, gyroRef, keysRef, touchLookRef, cameraOverrideRef, isMobile, viewIndex, zoom }: CameraControllerProps) {
  const { camera } = useThree()
  const target = useRef(new THREE.Vector3())
  const current = useRef(new THREE.Vector3(...VIEWS[0].pos))
  const lookTarget = useRef(new THREE.Vector3())
  const currentLook = useRef(new THREE.Vector3(...VIEWS[0].look))
  const wasdOffset = useRef(new THREE.Vector3(0, 0, 0))
  const wasdLookOffset = useRef(new THREE.Vector3(0, 0, 0))
  const yawAngle = useRef(0)
  const _forward = useRef(new THREE.Vector3())
  const _right = useRef(new THREE.Vector3())
  const _up = useRef(new THREE.Vector3(0, 1, 0))
  const _move = useRef(new THREE.Vector3())

  useFrame(() => {
    const override = cameraOverrideRef.current
    if (override) {
      camera.position.copy(override.position)
      camera.lookAt(override.lookAt)
      return
    }

    const v = VIEWS[viewIndex % VIEWS.length]
    const keys = keysRef.current
    const moveSpeed = 0.4
    const rotSpeed = 0.02

    if (keys.size > 0) {
      const forward = _forward.current
      camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()
      _right.current.crossVectors(forward, _up.current).normalize()
      const right = _right.current
      const move = _move.current

      if (keys.has('w') || keys.has('arrowup')) {
        move.copy(forward).multiplyScalar(moveSpeed)
        wasdOffset.current.add(move)
        wasdLookOffset.current.add(move)
      }
      if (keys.has('s') || keys.has('arrowdown')) {
        move.copy(forward).multiplyScalar(-moveSpeed)
        wasdOffset.current.add(move)
        wasdLookOffset.current.add(move)
      }
      if (keys.has('a') || keys.has('arrowleft')) {
        move.copy(right).multiplyScalar(-moveSpeed)
        wasdOffset.current.add(move)
        wasdLookOffset.current.add(move)
      }
      if (keys.has('d') || keys.has('arrowright')) {
        move.copy(right).multiplyScalar(moveSpeed)
        wasdOffset.current.add(move)
        wasdLookOffset.current.add(move)
      }
      if (keys.has('q')) yawAngle.current -= rotSpeed
      if (keys.has('e')) yawAngle.current += rotSpeed
      if (keys.has('r')) {
        wasdOffset.current.y += moveSpeed * 0.5
        wasdLookOffset.current.y += moveSpeed * 0.5
      }
      if (keys.has('f')) {
        wasdOffset.current.y -= moveSpeed * 0.5
        wasdLookOffset.current.y -= moveSpeed * 0.5
      }
    }

    let offsetX = 0
    let offsetZ = 0
    if (isMobile) {
      offsetX = touchLookRef.current.x + gyroRef.current.x * 4
      offsetZ = touchLookRef.current.y - gyroRef.current.y * 3
    } else if (mouseRef.current) {
      offsetX = (mouseRef.current.x - 0.5) * 10
      offsetZ = (mouseRef.current.y - 0.5) * -6
    }

    const zf = 1 / zoom
    const cosY = Math.cos(yawAngle.current)
    const sinY = Math.sin(yawAngle.current)
    const baseX = v.pos[0] * zf + offsetX
    const baseZ = v.pos[2] * zf + offsetZ

    target.current.set(
      baseX * cosY - baseZ * sinY + wasdOffset.current.x,
      v.pos[1] * zf + wasdOffset.current.y,
      baseX * sinY + baseZ * cosY + wasdOffset.current.z
    )

    const lx = v.look[0], lz = v.look[2]
    lookTarget.current.set(
      lx * cosY - lz * sinY + wasdLookOffset.current.x,
      v.look[1],
      lx * sinY + lz * cosY + wasdLookOffset.current.z
    )

    current.current.lerp(target.current, 0.06)
    currentLook.current.lerp(lookTarget.current, 0.06)
    camera.position.copy(current.current)
    camera.lookAt(currentLook.current)
  })

  return null
}

// Animal interaction — raycasting for pick up / drop
interface AnimalInteractionProps {
  animalsRef: React.MutableRefObject<THREE.Group | null>
  terrainRef: React.MutableRefObject<THREE.Mesh | null>
  eventTargetRef: React.MutableRefObject<HTMLDivElement | null>
  mouseRef: React.MutableRefObject<{ x: number; y: number; active: boolean }>
  carriedRef: React.MutableRefObject<THREE.Mesh | null>
  onCursorChange: (state: 'default' | 'grab' | 'grabbing') => void
  onInteraction?: (kind: 'pick' | 'drop', x: number, y: number) => void
}

function AnimalInteraction({
  animalsRef,
  terrainRef,
  eventTargetRef,
  mouseRef,
  carriedRef,
  onCursorChange,
  onInteraction,
}: AnimalInteractionProps) {
  const { camera, raycaster } = useThree()
  const hoveredRef = useRef<THREE.Mesh | null>(null)
  const lastCheck = useRef(0)
  const mouseNDC = useRef(new THREE.Vector2())
  const terrainHitRef = useRef<THREE.Vector3 | null>(null)
  const _lerpTarget = useRef(new THREE.Vector3())
  const _carryPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const _planeHit = useRef(new THREE.Vector3())
  const carryHeight = useRef(0)
  const liftOffset = 3

  const setRayFromClient = useCallback((clientX: number, clientY: number) => {
    const target = eventTargetRef.current
    if (!target) return false

    const rect = target.getBoundingClientRect()
    mouseNDC.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1)
    )
    raycaster.setFromCamera(mouseNDC.current, camera)
    return true
  }, [camera, eventTargetRef, raycaster])

  const getAnimalAtPoint = useCallback((clientX: number, clientY: number) => {
    if (!animalsRef.current || !setRayFromClient(clientX, clientY)) return null
    const intersects = raycaster.intersectObjects(animalsRef.current.children, false)
    return intersects.length > 0 ? intersects[0].object as THREE.Mesh : null
  }, [animalsRef, raycaster, setRayFromClient])

  const getTerrainPointAtPoint = useCallback((clientX: number, clientY: number) => {
    if (!terrainRef.current || !setRayFromClient(clientX, clientY)) return null
    const terrainHits = raycaster.intersectObject(terrainRef.current)
    return terrainHits.length > 0 ? terrainHits[0].point.clone() : null
  }, [raycaster, setRayFromClient, terrainRef])

  useFrame(({ clock }) => {
    const now = clock.getElapsedTime()
    if (now - lastCheck.current < 0.016) return
    lastCheck.current = now

    if (!mouseRef.current?.active || !animalsRef.current) return

    mouseNDC.current.set(
      mouseRef.current.x * 2 - 1,
      -(mouseRef.current.y * 2 - 1)
    )
    raycaster.setFromCamera(mouseNDC.current, camera)

    if (carriedRef.current && terrainRef.current) {
      _carryPlane.current.set(_carryPlane.current.normal, -carryHeight.current)
      const hit = raycaster.ray.intersectPlane(_carryPlane.current, _planeHit.current)
      if (hit) {
        _lerpTarget.current.set(hit.x, carryHeight.current, hit.z)
        carriedRef.current.position.lerp(_lerpTarget.current, 0.6)

        const terrainHits = raycaster.intersectObject(terrainRef.current)
        if (terrainHits.length > 0) {
          if (!terrainHitRef.current) terrainHitRef.current = new THREE.Vector3()
          terrainHitRef.current.copy(terrainHits[0].point)
        }
      }
      return
    }

    // Otherwise, check for animal hover
    const intersects = raycaster.intersectObjects(animalsRef.current.children, false)
    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh
      if (hoveredRef.current !== mesh) {
        hoveredRef.current = mesh
        onCursorChange('grab')
      }
    } else if (hoveredRef.current) {
      hoveredRef.current = null
      onCursorChange('default')
    }
  })

  useEffect(() => {
    const target = eventTargetRef.current
    if (!target) return

    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('.sketch-brush-slider-wrap') || el.closest('.sketch-btn') || el.closest('.sketch-back-btn')) return
      e.preventDefault()
      if (carriedRef.current) {
        const hit = getTerrainPointAtPoint(e.clientX, e.clientY) ?? terrainHitRef.current
        if (hit) {
          const dropped = new THREE.Vector3(hit.x, hit.y + 0.35, hit.z)
          carriedRef.current.position.copy(dropped)
          carriedRef.current.userData.basePosition = dropped.clone()
        }
        carriedRef.current = null
        hoveredRef.current = null
        onCursorChange('default')
        onInteraction?.('drop', e.clientX, e.clientY)
      } else {
        const directHit = getAnimalAtPoint(e.clientX, e.clientY) ?? hoveredRef.current
        if (!directHit) return
        hoveredRef.current = directHit
        carriedRef.current = directHit
        carryHeight.current = directHit.position.y + liftOffset
        onCursorChange('grabbing')
        onInteraction?.('pick', e.clientX, e.clientY)
      }
    }

    target.addEventListener('pointerdown', onPointerDown)
    return () => target.removeEventListener('pointerdown', onPointerDown)
  }, [carriedRef, eventTargetRef, getAnimalAtPoint, getTerrainPointAtPoint, onCursorChange, onInteraction])

  return null
}

const BRUSH_MODES: BrushMode[] = ['raise', 'lower', 'flatten', 'smooth', 'noise']
const BRUSH_LABELS: Record<BrushMode, string> = {
  raise: 'raise',
  lower: 'dig',
  flatten: 'flatten',
  smooth: 'smooth',
  noise: 'roughen',
}

interface SketchbookCanvasProps {
  onCursorChange?: (state: 'default' | 'grab' | 'grabbing') => void
  onInteraction?: (kind: 'pick' | 'drop', x: number, y: number) => void
  scrollProgressRef?: React.MutableRefObject<number>
  isVisible?: boolean
  uiHidden?: boolean
  onToggleUI?: () => void
  onCaptureRequest?: () => void
  captureBusy?: boolean
}

const waitForAnimationFrames = async (count: number) => {
  for (let i = 0; i < count; i += 1) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  }
}

const captureCanvasDataUrl = (renderer: THREE.WebGLRenderer) => renderer.domElement.toDataURL('image/png')

const SketchbookCanvas = forwardRef<SketchbookCanvasHandle, SketchbookCanvasProps>(function SketchbookCanvas({
  onCursorChange,
  onInteraction,
  uiHidden,
  onToggleUI,
  onCaptureRequest,
  captureBusy = false,
}: SketchbookCanvasProps, ref) {
  const emitCursorChange = onCursorChange ?? (() => {})
  const mouseRef = useRef({ x: 0.5, y: 0.5, active: false })
  const gyroRef = useRef({ x: 0, y: 0 })
  const keysRef = useRef(new Set<string>())
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.Camera | null>(null)
  const cameraOverrideRef = useRef<CameraOverride | null>(null)
  const touchLookRef = useRef({ x: 0, y: 0 })
  const touchStateRef = useRef({
    mode: 'idle' as 'idle' | 'look' | 'brush' | 'pinch',
    startX: 0,
    startY: 0,
    startLookX: 0,
    startLookY: 0,
    startZoom: 0,
    startDistance: 0,
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const animalsRef = useRef<THREE.Group | null>(null)
  const terrainRef = useRef<THREE.Mesh | null>(null)
  const carriedRef = useRef<THREE.Mesh | null>(null)
  const isPhone = useIsPhone()
  const isTouchDevice = useTouchDevice()
  const isMobile = isPhone || isTouchDevice
  const gyro = useGyroscope()
  const [viewIndex, setViewIndex] = useState(DEFAULT_VIEW_INDEX)
  const [zoom, setZoom] = useState(DEFAULT_SPAWN_ZOOM)
  const [brushEnabled, setBrushEnabled] = useState(() => {
    if (typeof window === 'undefined') return true
    return !(window.matchMedia('(hover: none), (pointer: coarse)').matches || navigator.maxTouchPoints > 0)
  })
  const [brushMode, setBrushMode] = useState<BrushMode>('raise')
  const [brushStrength, setBrushStrength] = useState(0.15)
  const [decayEnabled, setDecayEnabled] = useState(true)
  const [decayAmount, setDecayAmount] = useState(DEFAULT_DECAY_AMOUNT)
  const deformation = useTerrainDeformation({ decayEnabled, decayAmount })
  const progressRef = useRef(1)
  const zoomRef = useRef(zoom)

  const cycleView = useCallback(() => setViewIndex(i => (i + 1) % VIEWS.length), [])
  const zoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, 2.5)), [])
  const zoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.15)), [])
  const cycleBrush = useCallback(() => {
    setBrushMode(m => {
      const idx = BRUSH_MODES.indexOf(m)
      return BRUSH_MODES[(idx + 1) % BRUSH_MODES.length]
    })
  }, [])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  // WASD key tracking
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault()
        keysRef.current.add(key)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase())
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      keysRef.current.clear()
    }
  }, [])

  // Scroll wheel zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom(z => {
        const delta = e.deltaY < 0 ? 0.03 : -0.03
        return Math.max(0.15, Math.min(2.5, z + delta))
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (!gyro.permitted) return
    return gyro.subscribe((x, y) => {
      gyroRef.current.x = x
      gyroRef.current.y = y
    })
  }, [gyro, gyro.permitted])

  const uiInteracting = useRef(false)

  const isSketchUiTarget = useCallback((target: EventTarget | null) => {
    const element = target instanceof Element ? target : null
    return Boolean(
      element?.closest('.sketch-ui-layer') ||
      element?.closest('.sketch-brush-slider-wrap') ||
      element?.closest('.sketch-btn') ||
      element?.closest('.sketch-back-btn')
    )
  }, [])

  const updatePointerFromClient = useCallback((clientX: number, clientY: number, active = true) => {
    const el = containerRef.current
    if (!el) return

    const rect = el.getBoundingClientRect()
    mouseRef.current.x = clamp((clientX - rect.left) / rect.width, 0, 1)
    mouseRef.current.y = clamp((clientY - rect.top) / rect.height, 0, 1)
    mouseRef.current.active = active
  }, [])

  const onSliderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    uiInteracting.current = true
    mouseRef.current.active = false
  }, [])

  const onSliderPointerEnd = useCallback(() => {
    uiInteracting.current = false
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onMove = (e: PointerEvent) => {
      if (isMobile && e.pointerType !== 'mouse') return
      if (uiInteracting.current) return
      if (isSketchUiTarget(e.target)) return
      updatePointerFromClient(e.clientX, e.clientY, true)
    }
    const onLeave = () => {
      mouseRef.current.active = false
      if (!carriedRef.current) emitCursorChange('default')
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [emitCursorChange, isMobile, isSketchUiTarget, updatePointerFromClient])

  useEffect(() => {
    if (!isMobile) return undefined

    const el = containerRef.current
    if (!el) return undefined

    const beginSingleTouch = (touch: Touch) => {
      touchStateRef.current.startX = touch.clientX
      touchStateRef.current.startY = touch.clientY
      touchStateRef.current.startLookX = touchLookRef.current.x
      touchStateRef.current.startLookY = touchLookRef.current.y
      touchStateRef.current.mode = brushEnabled || Boolean(carriedRef.current) ? 'brush' : 'look'

      if (touchStateRef.current.mode === 'brush') {
        updatePointerFromClient(touch.clientX, touch.clientY, true)
      } else {
        mouseRef.current.active = false
      }
    }

    const onTouchStart = (e: TouchEvent) => {
      if (isSketchUiTarget(e.target)) return

      if (e.touches.length >= 2) {
        touchStateRef.current.mode = 'pinch'
        touchStateRef.current.startDistance = getTouchDistance(e.touches)
        touchStateRef.current.startZoom = zoomRef.current
        mouseRef.current.active = false
        return
      }

      const touch = e.touches[0]
      if (!touch) return
      beginSingleTouch(touch)
    }

    const onTouchMove = (e: TouchEvent) => {
      if (isSketchUiTarget(e.target)) return

      if (e.touches.length >= 2) {
        e.preventDefault()
        const distance = getTouchDistance(e.touches)
        if (!touchStateRef.current.startDistance) {
          touchStateRef.current.startDistance = distance
          touchStateRef.current.startZoom = zoomRef.current
        }
        const nextZoom = clamp(
          touchStateRef.current.startZoom + (distance - touchStateRef.current.startDistance) * 0.0035,
          0.15,
          2.5,
        )
        setZoom(nextZoom)
        mouseRef.current.active = false
        return
      }

      const touch = e.touches[0]
      if (!touch) return

      e.preventDefault()
      if (brushEnabled || carriedRef.current) {
        touchStateRef.current.mode = 'brush'
        updatePointerFromClient(touch.clientX, touch.clientY, true)
        return
      }

      touchStateRef.current.mode = 'look'
      const dx = (touch.clientX - touchStateRef.current.startX) / el.clientWidth
      const dy = (touch.clientY - touchStateRef.current.startY) / el.clientHeight
      touchLookRef.current.x = clamp(touchStateRef.current.startLookX - dx * 18, -14, 14)
      touchLookRef.current.y = clamp(touchStateRef.current.startLookY + dy * 12, -10, 10)
      mouseRef.current.active = false
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length >= 2) {
        touchStateRef.current.mode = 'pinch'
        touchStateRef.current.startDistance = getTouchDistance(e.touches)
        touchStateRef.current.startZoom = zoomRef.current
        mouseRef.current.active = false
        return
      }

      if (e.touches.length === 1) {
        beginSingleTouch(e.touches[0])
        return
      }

      touchStateRef.current.mode = 'idle'
      touchStateRef.current.startDistance = 0
      mouseRef.current.active = false
      if (!carriedRef.current) emitCursorChange('default')
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [brushEnabled, emitCursorChange, isMobile, isSketchUiTarget, updatePointerFromClient])

  useImperativeHandle(ref, () => ({
    capturePhotos: async (options) => {
      const renderer = rendererRef.current
      const camera = cameraRef.current
      if (!renderer) throw new Error('Sketch renderer is not ready')

      await waitForAnimationFrames(2)
      const current = captureCanvasDataUrl(renderer)
      options?.onCurrentCaptured?.(current)
      await waitForAnimationFrames(2)

      let recommended = current
      try {
        const sampleTerrainHeight: TerrainHeightSampler = (x, z) => {
          const sampleX = clampTerrainBounds(x)
          const sampleZ = clampTerrainBounds(z)
          return getTerrainHeight(sampleX, sampleZ) + deformation.getDeformOffset(sampleX, sampleZ)
        }
        const recommendedView = camera
          ? getRecommendedCaptureView(camera, collectSceneSubjects(animalsRef.current), sampleTerrainHeight)
          : {
            position: new THREE.Vector3(...RECOMMENDED_CAPTURE_VIEW.pos),
            lookAt: new THREE.Vector3(...RECOMMENDED_CAPTURE_VIEW.look),
          }

        cameraOverrideRef.current = recommendedView
        await waitForAnimationFrames(3)
        recommended = captureCanvasDataUrl(renderer)
      } finally {
        cameraOverrideRef.current = null
        await waitForAnimationFrames(2)
      }

      return { current, recommended }
    },
  }), [deformation])

  const viewName = VIEWS[viewIndex % VIEWS.length].name

  return (
    <div ref={containerRef} className="sketchbook-canvas-wrapper">
      <Canvas
        dpr={[1, Math.min(window.devicePixelRatio, 1.5)]}
        gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: true }}
        camera={{ position: [0, 14, 40], fov: 50, near: 0.1, far: 300 }}
        frameloop="always"
        onCreated={({ gl, camera }) => {
          rendererRef.current = gl
          cameraRef.current = camera
          gl.domElement.style.setProperty('cursor', 'none', 'important')
        }}
      >
        <SceneCleanup />
        <CursorEnforcer />
        <color attach="background" args={['#f4efe5']} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[15, 30, 10]} intensity={1.1} />
        <directionalLight position={[-10, 20, -8]} intensity={0.35} />
        <hemisphereLight args={['#c8dae8', '#8a7d6a', 0.4]} />

        <CameraController
          mouseRef={mouseRef} gyroRef={gyroRef} keysRef={keysRef} touchLookRef={touchLookRef} cameraOverrideRef={cameraOverrideRef}
          isMobile={isMobile} viewIndex={viewIndex} zoom={zoom}
        />
        <Terrain
          mouseRef={mouseRef}
          scrollProgress={progressRef}
          meshRef={terrainRef}
          brushEnabled={brushEnabled}
          brushMode={brushMode}
          brushStrength={brushStrength}
          deformation={deformation}
        />
        <TerrainPopulation
          isMobile={isMobile}
          animalsRef={animalsRef}
          carriedRef={carriedRef}
          getDeformOffset={deformation.getDeformOffset}
        />
        <AnimalInteraction
          animalsRef={animalsRef}
          terrainRef={terrainRef}
          eventTargetRef={containerRef}
          mouseRef={mouseRef}
          carriedRef={carriedRef}
          onCursorChange={emitCursorChange}
          onInteraction={onInteraction}
        />

        <fog attach="fog" args={['#f0ebe2', 80, 220]} />
        <SketchPostProcessing />
      </Canvas>

      <div className={`sketch-ui-layer ${uiHidden ? 'sketch-ui-layer--hidden' : ''}`}>
        <div className="sketch-controls">
          <button className="sketch-btn" onClick={cycleView}>{viewName}</button>
          <button
            className="sketch-btn sketch-btn--photo"
            onClick={onCaptureRequest}
            disabled={captureBusy}
            title="Capture the current view and a recommended angle"
          >
            {captureBusy ? 'developing' : 'photo'}
          </button>
          <button className="sketch-btn sketch-btn--icon" onClick={zoomIn}>+</button>
          <button className="sketch-btn sketch-btn--icon" onClick={zoomOut}>&minus;</button>
        </div>

        <div className={`sketch-wasd-hint ${isMobile ? 'sketch-wasd-hint--mobile' : ''}`}>
          {isMobile ? (
            <>
              <span>drag</span> {brushEnabled ? 'sculpt' : 'look'} · <span>pinch</span> zoom · <span>tap</span> animals
            </>
          ) : (
            <>
              <span>wasd</span> move · <span>qe</span> rotate · <span>rf</span> up/down · <span>esc</span> exit
            </>
          )}
        </div>
      </div>

      {/* Always-visible bottom bar */}
      <div className="sketch-brush-controls">
        <div className={`sketch-brush-controls__hideable ${uiHidden ? 'sketch-brush-controls__hideable--hidden' : ''}`}>
          <button
            className={`sketch-btn sketch-btn--brush-toggle ${brushEnabled ? 'sketch-btn--active' : ''}`}
            onClick={() => setBrushEnabled(e => !e)}
            title={brushEnabled ? 'Disable terrain sculpting' : 'Enable terrain sculpting'}
          >
            {brushEnabled ? 'sculpt: on' : 'sculpt: off'}
          </button>
          <button
            className={`sketch-btn sketch-btn--brush-toggle ${decayEnabled ? 'sketch-btn--active' : ''}`}
            onClick={() => setDecayEnabled(enabled => !enabled)}
            title={decayEnabled ? 'Pause terrain decay and preserve changes' : 'Resume terrain decay toward the default landscape'}
          >
            {decayEnabled ? 'decay: on' : 'decay: off'}
          </button>
          {brushEnabled && (
            <button className="sketch-btn sketch-btn--brush-mode" onClick={cycleBrush}>
              {BRUSH_LABELS[brushMode]}
            </button>
          )}
        </div>

        <button
          className="sketch-btn sketch-btn--hide-ui"
          onClick={onToggleUI}
          title={uiHidden ? 'Show UI' : 'Hide UI'}
        >
          {uiHidden ? '[ ]' : 'x'}
        </button>

        <div className={`sketch-brush-controls__hideable ${uiHidden ? 'sketch-brush-controls__hideable--hidden' : ''}`}>
          {brushEnabled && (
            <div
              className="sketch-brush-slider-wrap"
              onPointerDown={onSliderPointerDown}
              onPointerUp={onSliderPointerEnd}
              onPointerCancel={onSliderPointerEnd}
              onLostPointerCapture={onSliderPointerEnd}
            >
              <span className="sketch-brush-slider-name">brush</span>
              <input
                type="range"
                className="sketch-brush-slider"
                min={0.02}
                max={1}
                step={0.02}
                value={brushStrength}
                onChange={e => setBrushStrength(parseFloat(e.target.value))}
              />
              <span className="sketch-brush-slider-label">{Math.round(brushStrength * 100)}%</span>
            </div>
          )}
          {decayEnabled && (
            <div
              className="sketch-brush-slider-wrap"
              onPointerDown={onSliderPointerDown}
              onPointerUp={onSliderPointerEnd}
              onPointerCancel={onSliderPointerEnd}
              onLostPointerCapture={onSliderPointerEnd}
            >
              <span className="sketch-brush-slider-name">decay</span>
              <input
                type="range"
                className="sketch-brush-slider"
                min={0}
                max={1}
                step={0.01}
                value={decayAmount}
                onChange={e => setDecayAmount(parseFloat(e.target.value))}
              />
              <span className="sketch-brush-slider-label">{Math.round(decayAmount * 100)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
})

export default SketchbookCanvas
