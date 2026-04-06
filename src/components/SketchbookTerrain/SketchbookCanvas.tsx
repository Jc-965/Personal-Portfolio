/* eslint-disable react/no-unknown-property */
import { forwardRef, useRef, useEffect, useState, useCallback, useImperativeHandle, type CSSProperties } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Terrain from './Terrain'
import TerrainPopulation from './TerrainPopulation'
import SketchAtmosphere from './SketchAtmosphere'
import SketchPostProcessing from './SketchPostProcessing'
import { getTerrainHeight } from './noiseUtils'
import useIsPhone from '../../hooks/useIsPhone'
import useTouchDevice from '../../hooks/useTouchDevice'
import { useGyroscope } from '../../context/GyroscopeContext'
import { useTerrainDeformation, type BrushMode, DEFAULT_DECAY_AMOUNT } from './useTerrainDeformation'

function CursorEnforcer({ cursor }: { cursor: string }) {
  const { gl } = useThree()

  useFrame(() => {
    const canvas = gl.domElement
    if (canvas.style.cursor !== cursor) {
      canvas.style.setProperty('cursor', cursor, 'important')
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
          const mesh = obj as THREE.Mesh
          mesh.geometry?.dispose()
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const material of materials) {
            if (!material) continue
            for (const value of Object.values(material as unknown as Record<string, unknown>)) {
              if (value instanceof THREE.Texture) value.dispose()
            }
            ;(material as THREE.Material).dispose()
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

export type SketchbookInteractionMode = 'explore' | 'sculpt'

type TerrainHeightSampler = (x: number, z: number) => number
type CameraOverride = {
  position: THREE.Vector3
  lookAt: THREE.Vector3
}

type TerrainFeatureMetrics = {
  centerHeight: number
  nearAverage: number
  surroundingRelief: number
  prominence: number
  peakPenalty: number
  moderateHeightScore: number
  anchorHeight: number
}

type ExploreState = {
  x: number
  z: number
  yaw: number
  pitch: number
  elevationOffset: number
  initialized: boolean
  perchIndex: number
}

type ExplorePerch = {
  name: string
  label: string
  x: number
  z: number
}

type ResolvedExplorePerch = ExplorePerch & {
  yaw: number
  pitch: number
  scenicScore: number
}

const SURVEY_VIEWS = [
  { name: 'ridge table', pos: [0, 18, 36], look: [0, 3, -10] },
  { name: 'creek bend', pos: [24, 10, 22], look: [-10, 3, -12] },
  { name: 'overview', pos: [0, 30, 14], look: [0, 1, -10] },
  { name: 'tree line', pos: [-26, 12, 20], look: [14, 3, -14] },
] as const

const EXPLORE_PERCHES: ExplorePerch[] = [
  { name: 'trailhead', label: 'fern trail', x: -24, z: 30 },
  { name: 'creek', label: 'water edge', x: 12, z: 18 },
  { name: 'ridge', label: 'stone rise', x: 26, z: -6 },
  { name: 'clearing', label: 'sun pocket', x: -10, z: -24 },
]

const DEFAULT_VIEW_INDEX = SURVEY_VIEWS.findIndex(view => view.name === 'tree line')
const DEFAULT_SURVEY_ZOOM = 0.6
const TERRAIN_WORLD_SIZE = 124
const TERRAIN_HALF_SIZE = TERRAIN_WORLD_SIZE * 0.5
const EXPLORE_MARGIN = 7
const EXPLORE_EYE_HEIGHT = 2.45
const EXPLORE_STEP_HEIGHT = 2.2
const EXPLORE_LOOK_SENSITIVITY = 0.0025
const EXPLORE_ROTATE_SPEED = 2.2
const EXPLORE_MOVE_SPEED = 12.4
const EXPLORE_VERTICAL_SPEED = 8.9
const EXPLORE_MIN_ELEVATION_OFFSET = -1.45
const EXPLORE_MAX_ELEVATION_OFFSET = 24
const EXPLORE_PERCH_DIRECTION_STEPS = 20
const EXPLORE_PERCH_LOOK_DISTANCES = [28, 38, 50, 60] as const
const SURVEY_LOOK_DISTANCE = 24
const RECOMMENDED_CAPTURE_VIEW = {
  pos: [18, 15, 26],
  look: [-2, 4, -10],
} as const
const RECOMMENDED_CAPTURE_MARGIN = 9
const RECOMMENDED_CAPTURE_RADII = [26, 34, 44, 56] as const
const RECOMMENDED_CAPTURE_ANGLE_STEPS = 16
const RECOMMENDED_CAPTURE_GRID_STEP = 12
const RECOMMENDED_CAPTURE_RELIEF_SAMPLE = 5

const BRUSH_MODES: BrushMode[] = ['raise', 'lower', 'flatten', 'smooth', 'noise']
const BRUSH_LABELS: Record<BrushMode, string> = {
  raise: 'raise',
  lower: 'dig',
  flatten: 'flatten',
  smooth: 'smooth',
  noise: 'roughen',
}

const SURVEY_DRAG_YAW_SENSITIVITY = 0.0025
const SURVEY_DRAG_PITCH_SENSITIVITY = 0.0025
const SURVEY_ROTATE_SPEED = 2.05
const clampSurveyPitch = (value: number) => clamp(value, -1.28, 1.05)

const describeBrushStrength = (value: number) => {
  if (value < 0.18) return 'fine'
  if (value < 0.36) return 'light'
  if (value < 0.62) return 'bold'
  return 'heavy'
}

const describeDecayAmount = (value: number) => {
  if (value < 0.16) return 'slow'
  if (value < 0.38) return 'gentle'
  if (value < 0.62) return 'steady'
  return 'quick'
}

const createExploreState = (): ExploreState => ({
  x: RESOLVED_EXPLORE_PERCHES[DEFAULT_PERCH_INDEX].x,
  z: RESOLVED_EXPLORE_PERCHES[DEFAULT_PERCH_INDEX].z,
  yaw: RESOLVED_EXPLORE_PERCHES[DEFAULT_PERCH_INDEX].yaw,
  pitch: RESOLVED_EXPLORE_PERCHES[DEFAULT_PERCH_INDEX].pitch,
  elevationOffset: 0,
  initialized: false,
  perchIndex: DEFAULT_PERCH_INDEX,
})

const clampTerrainBounds = (value: number, margin = RECOMMENDED_CAPTURE_MARGIN) => clamp(
  value,
  -TERRAIN_HALF_SIZE + margin,
  TERRAIN_HALF_SIZE - margin,
)

const clampExplorePitch = (value: number) => clamp(value, -1.24, 0.7)

const directionToYawPitch = (direction: THREE.Vector3) => ({
  yaw: Math.atan2(direction.x, -direction.z),
  pitch: Math.asin(clamp(direction.y, -1, 1)),
})

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

const resolveExplorePerch = (
  perch: ExplorePerch,
  sampleTerrainHeight: TerrainHeightSampler,
): ResolvedExplorePerch => {
  const perchGround = sampleTerrainHeight(perch.x, perch.z)
  const eye = new THREE.Vector3(perch.x, perchGround + EXPLORE_EYE_HEIGHT, perch.z)
  const fallbackYaw = Math.atan2(-perch.x, perch.z)
  let bestYaw = fallbackYaw
  let bestPitch = 0.04
  let bestScore = Number.NEGATIVE_INFINITY

  for (let step = 0; step < EXPLORE_PERCH_DIRECTION_STEPS; step += 1) {
    const yaw = (step / EXPLORE_PERCH_DIRECTION_STEPS) * Math.PI * 2

    for (const distance of EXPLORE_PERCH_LOOK_DISTANCES) {
      const focusX = clampTerrainBounds(perch.x + Math.sin(yaw) * distance, EXPLORE_MARGIN)
      const focusZ = clampTerrainBounds(perch.z - Math.cos(yaw) * distance, EXPLORE_MARGIN)
      const metrics = getTerrainFeatureMetrics(focusX, focusZ, sampleTerrainHeight)
      const lookAt = new THREE.Vector3(
        focusX,
        metrics.anchorHeight + clamp(2.2 + metrics.surroundingRelief * 0.16, 2.1, 5.4),
        focusZ,
      )
      const pitch = Math.atan2(lookAt.y - eye.y, Math.max(distance, 1))
      const sightlineScore = scoreSightlineClearance(eye, lookAt, sampleTerrainHeight)
      const pitchScore = clamp(1 - Math.abs(pitch - 0.02) / 0.24, 0, 1)
      const distanceScore = clamp((distance - 24) / 28, 0, 1)
      const reliefScore = clamp(metrics.surroundingRelief / 8.5, 0, 1)
      const edgeScore = clamp((TERRAIN_HALF_SIZE - Math.max(Math.abs(focusX), Math.abs(focusZ)) - 6) / 18, 0, 1)
      const centerBias = 1 - Math.min(Math.hypot(focusX, focusZ) / 60, 1)
      const nearX = THREE.MathUtils.lerp(perch.x, focusX, 0.24)
      const nearZ = THREE.MathUtils.lerp(perch.z, focusZ, 0.24)
      const midX = THREE.MathUtils.lerp(perch.x, focusX, 0.54)
      const midZ = THREE.MathUtils.lerp(perch.z, focusZ, 0.54)
      const risePenalty = clamp((sampleTerrainHeight(nearX, nearZ) - perchGround - 0.7) / 3.4, 0, 1)
      const midReliefScore = clamp(sampleTerrainRelief(midX, midZ, sampleTerrainHeight) / 7.2, 0, 1)
      const peakPenalty = clamp(Math.max(metrics.prominence, 0) / 12, 0, 1)
      const score =
        sightlineScore * 3.5 +
        pitchScore * 1.5 +
        distanceScore * 1.2 +
        reliefScore * 1.15 +
        midReliefScore * 0.9 +
        edgeScore * 0.8 +
        centerBias * 0.45 +
        metrics.moderateHeightScore * 0.5 -
        risePenalty * 2.7 -
        peakPenalty * 0.75

      if (score > bestScore) {
        bestScore = score
        bestYaw = yaw
        bestPitch = clamp(pitch, -0.04, 0.18)
      }
    }
  }

  return {
    ...perch,
    yaw: bestYaw,
    pitch: bestPitch,
    scenicScore: bestScore,
  }
}

const RESOLVED_EXPLORE_PERCHES = EXPLORE_PERCHES.map(perch => resolveExplorePerch(perch, getTerrainHeight))

const getDefaultPerchIndex = () => {
  let bestIndex = 0
  let bestScore = Number.NEGATIVE_INFINITY

  RESOLVED_EXPLORE_PERCHES.forEach((perch, index) => {
    if (perch.scenicScore > bestScore) {
      bestIndex = index
      bestScore = perch.scenicScore
    }
  })

  return bestIndex
}

const DEFAULT_PERCH_INDEX = getDefaultPerchIndex()

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
  surveyOrbitRef: React.MutableRefObject<{ yaw: number; pitch: number }>
  cameraOverrideRef: React.MutableRefObject<CameraOverride | null>
  exploreStateRef: React.MutableRefObject<ExploreState>
  sampleTerrainHeight: TerrainHeightSampler
  interactionMode: SketchbookInteractionMode
  isMobile: boolean
  viewIndex: number
  zoom: number
  perchIndex: number
}

function CameraController({
  mouseRef,
  gyroRef,
  keysRef,
  surveyOrbitRef,
  cameraOverrideRef,
  exploreStateRef,
  sampleTerrainHeight,
  interactionMode,
  isMobile,
  viewIndex,
  zoom,
  perchIndex,
}: CameraControllerProps) {
  const { camera } = useThree()
  const target = useRef(new THREE.Vector3())
  const current = useRef(new THREE.Vector3(...SURVEY_VIEWS[0].pos))
  const lookTarget = useRef(new THREE.Vector3())
  const currentLook = useRef(new THREE.Vector3(...SURVEY_VIEWS[0].look))
  const surveyOffset = useRef(new THREE.Vector3(0, 0, 0))
  const surveyBasePosition = useRef(new THREE.Vector3())
  const surveyRawLook = useRef(new THREE.Vector3())
  const surveyBaseDirection = useRef(new THREE.Vector3())
  const surveyLookDirection = useRef(new THREE.Vector3())
  const lastModeRef = useRef<SketchbookInteractionMode>(interactionMode)
  const forward = useRef(new THREE.Vector3())
  const right = useRef(new THREE.Vector3())
  const up = useRef(new THREE.Vector3(0, 1, 0))
  const move = useRef(new THREE.Vector3())

  useFrame(({ clock }, delta) => {
    const override = cameraOverrideRef.current
    if (override) {
      camera.position.copy(override.position)
      camera.lookAt(override.lookAt)
      return
    }

    const modeChanged = lastModeRef.current !== interactionMode
    lastModeRef.current = interactionMode
    const keys = keysRef.current

    if (interactionMode === 'explore') {
      const state = exploreStateRef.current
      const perch = RESOLVED_EXPLORE_PERCHES[perchIndex % RESOLVED_EXPLORE_PERCHES.length]

      if (!state.initialized || state.perchIndex !== perchIndex) {
        state.x = perch.x
        state.z = perch.z
        state.yaw = perch.yaw
        state.pitch = perch.pitch
        state.elevationOffset = 0
        state.initialized = true
        state.perchIndex = perchIndex
      }

      if (keys.has('q') || keys.has('arrowleft')) state.yaw += EXPLORE_ROTATE_SPEED * delta
      if (keys.has('e') || keys.has('arrowright')) state.yaw -= EXPLORE_ROTATE_SPEED * delta
      if (keys.has('r')) {
        state.elevationOffset = clamp(
          state.elevationOffset + EXPLORE_VERTICAL_SPEED * delta,
          EXPLORE_MIN_ELEVATION_OFFSET,
          EXPLORE_MAX_ELEVATION_OFFSET,
        )
      }
      if (keys.has('c')) {
        state.elevationOffset = clamp(
          state.elevationOffset - EXPLORE_VERTICAL_SPEED * delta,
          EXPLORE_MIN_ELEVATION_OFFSET,
          EXPLORE_MAX_ELEVATION_OFFSET,
        )
      }

      let moveForward = 0
      let moveStrafe = 0

      if (keys.has('w') || keys.has('arrowup')) moveForward += 1
      if (keys.has('s') || keys.has('arrowdown')) moveForward -= 1
      if (keys.has('a')) moveStrafe -= 1
      if (keys.has('d')) moveStrafe += 1

      const movementMagnitude = Math.hypot(moveForward, moveStrafe)
      const speed = (keys.has('shift') ? EXPLORE_MOVE_SPEED * 1.45 : EXPLORE_MOVE_SPEED) * delta
      const facingYaw = state.yaw
      const forwardX = Math.sin(facingYaw)
      const forwardZ = -Math.cos(facingYaw)
      const rightX = Math.cos(facingYaw)
      const rightZ = Math.sin(facingYaw)

      if (movementMagnitude > 0.001) {
        const normalizedForward = moveForward / movementMagnitude
        const normalizedStrafe = moveStrafe / movementMagnitude
        const candidateX = state.x + (forwardX * normalizedForward + rightX * normalizedStrafe) * speed
        const candidateZ = state.z + (forwardZ * normalizedForward + rightZ * normalizedStrafe) * speed
        const currentGround = sampleTerrainHeight(state.x, state.z)

        const tryMove = (nextX: number, nextZ: number) => {
          const clampedX = clampTerrainBounds(nextX, EXPLORE_MARGIN)
          const clampedZ = clampTerrainBounds(nextZ, EXPLORE_MARGIN)
          const nextGround = sampleTerrainHeight(clampedX, clampedZ)
          return Math.abs(nextGround - currentGround) <= EXPLORE_STEP_HEIGHT
            ? { x: clampedX, z: clampedZ }
            : null
        }

        const fullMove = tryMove(candidateX, candidateZ)
        if (fullMove) {
          state.x = fullMove.x
          state.z = fullMove.z
        } else {
          const xOnly = tryMove(candidateX, state.z)
          const zOnly = tryMove(state.x, candidateZ)
          if (xOnly) state.x = xOnly.x
          if (zOnly) state.z = zOnly.z
        }
      }

      const groundY = sampleTerrainHeight(state.x, state.z)
      const headBob = movementMagnitude > 0.001 ? Math.sin(clock.getElapsedTime() * 7.5) * 0.055 : 0
      target.current.set(state.x, groundY + EXPLORE_EYE_HEIGHT + state.elevationOffset + headBob, state.z)

      const gyroYawBias = isMobile ? gyroRef.current.x * 0.14 : 0
      const gyroPitchBias = isMobile ? -gyroRef.current.y * 0.08 : 0
      const lookYaw = state.yaw + gyroYawBias
      const lookPitch = clampExplorePitch(state.pitch + gyroPitchBias)
      const lookDistance = 18
      lookTarget.current.set(
        target.current.x + Math.sin(lookYaw) * Math.cos(lookPitch) * lookDistance,
        target.current.y + Math.sin(lookPitch) * lookDistance,
        target.current.z - Math.cos(lookYaw) * Math.cos(lookPitch) * lookDistance,
      )

      if (modeChanged) {
        current.current.copy(target.current)
        currentLook.current.copy(lookTarget.current)
      } else {
        current.current.lerp(target.current, 0.18)
        currentLook.current.lerp(lookTarget.current, 0.26)
      }

      camera.position.copy(current.current)
      camera.lookAt(currentLook.current)
      return
    }

    const surveyView = SURVEY_VIEWS[viewIndex % SURVEY_VIEWS.length]
    const moveSpeed = 35 * delta
    const rotateSpeed = SURVEY_ROTATE_SPEED * delta

    if (keys.size > 0) {
      camera.getWorldDirection(forward.current)
      forward.current.y = 0
      forward.current.normalize()
      right.current.crossVectors(forward.current, up.current).normalize()

      if (keys.has('w') || keys.has('arrowup')) {
        move.current.copy(forward.current).multiplyScalar(moveSpeed)
        surveyOffset.current.add(move.current)
      }
      if (keys.has('s') || keys.has('arrowdown')) {
        move.current.copy(forward.current).multiplyScalar(-moveSpeed)
        surveyOffset.current.add(move.current)
      }
      if (keys.has('a') || keys.has('arrowleft')) {
        move.current.copy(right.current).multiplyScalar(-moveSpeed)
        surveyOffset.current.add(move.current)
      }
      if (keys.has('d') || keys.has('arrowright')) {
        move.current.copy(right.current).multiplyScalar(moveSpeed)
        surveyOffset.current.add(move.current)
      }
      if (keys.has('q')) surveyOrbitRef.current.yaw -= rotateSpeed
      if (keys.has('e')) surveyOrbitRef.current.yaw += rotateSpeed
      if (keys.has('r')) {
        surveyOffset.current.y += moveSpeed * 0.6
      }
      if (keys.has('c')) {
        surveyOffset.current.y -= moveSpeed * 0.6
      }
    }

    surveyRawLook.current.set(
      surveyView.look[0],
      surveyView.look[1],
      surveyView.look[2],
    )
    const zoomFactor = 1 / zoom
    surveyBasePosition.current.set(
      surveyRawLook.current.x + (surveyView.pos[0] - surveyRawLook.current.x) * zoomFactor,
      surveyRawLook.current.y + (surveyView.pos[1] - surveyRawLook.current.y) * zoomFactor,
      surveyRawLook.current.z + (surveyView.pos[2] - surveyRawLook.current.z) * zoomFactor,
    )
    surveyBaseDirection.current.copy(surveyRawLook.current).sub(surveyBasePosition.current).normalize()

    const baseLook = directionToYawPitch(surveyBaseDirection.current)
    const lookYaw = baseLook.yaw + surveyOrbitRef.current.yaw + (isMobile ? gyroRef.current.x * 0.18 : 0)
    const lookPitch = clampSurveyPitch(
      baseLook.pitch + surveyOrbitRef.current.pitch + (isMobile ? -gyroRef.current.y * 0.08 : 0),
    )

    surveyLookDirection.current.set(
      Math.sin(lookYaw) * Math.cos(lookPitch),
      Math.sin(lookPitch),
      -Math.cos(lookYaw) * Math.cos(lookPitch),
    )

    target.current.copy(surveyBasePosition.current).add(surveyOffset.current)
    lookTarget.current.copy(target.current).addScaledVector(surveyLookDirection.current, SURVEY_LOOK_DISTANCE)

    if (modeChanged) {
      current.current.copy(target.current)
      currentLook.current.copy(lookTarget.current)
    } else {
      current.current.lerp(target.current, 0.08)
      currentLook.current.lerp(lookTarget.current, 0.08)
    }

    camera.position.copy(current.current)
    camera.lookAt(currentLook.current)
  })

  return null
}

interface AnimalInteractionProps {
  animalsRef: React.MutableRefObject<THREE.Group | null>
  terrainRef: React.MutableRefObject<THREE.Mesh | null>
  eventTargetRef: React.MutableRefObject<HTMLDivElement | null>
  mouseRef: React.MutableRefObject<{ x: number; y: number; active: boolean }>
  carriedRef: React.MutableRefObject<THREE.Mesh | null>
  enabled: boolean
  onCursorChange: (state: 'default' | 'grab' | 'grabbing') => void
  onInteraction?: (kind: 'pick' | 'drop', x: number, y: number) => void
}

function AnimalInteraction({
  animalsRef,
  terrainRef,
  eventTargetRef,
  mouseRef,
  carriedRef,
  enabled,
  onCursorChange,
  onInteraction,
}: AnimalInteractionProps) {
  const { camera, raycaster } = useThree()
  const hoveredRef = useRef<THREE.Mesh | null>(null)
  const lastCheck = useRef(0)
  const mouseNDC = useRef(new THREE.Vector2())
  const terrainHitRef = useRef<THREE.Vector3 | null>(null)
  const lerpTarget = useRef(new THREE.Vector3())
  const carryPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const planeHit = useRef(new THREE.Vector3())
  const carryHeight = useRef(0)
  const liftOffset = 3

  const setRayFromClient = useCallback((clientX: number, clientY: number) => {
    const target = eventTargetRef.current
    if (!target) return false

    const rect = target.getBoundingClientRect()
    mouseNDC.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
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

  useEffect(() => {
    if (enabled) return
    const carried = carriedRef.current
    const restingPosition = carried?.userData.basePosition as THREE.Vector3 | undefined
    if (carried && restingPosition) {
      carried.position.copy(restingPosition)
    }
    carriedRef.current = null
    hoveredRef.current = null
    onCursorChange('default')
  }, [carriedRef, enabled, onCursorChange])

  useFrame(({ clock }) => {
    if (!enabled) return

    const now = clock.getElapsedTime()
    if (now - lastCheck.current < 0.016) return
    lastCheck.current = now

    if (!mouseRef.current.active || !animalsRef.current) return

    mouseNDC.current.set(
      mouseRef.current.x * 2 - 1,
      -(mouseRef.current.y * 2 - 1),
    )
    raycaster.setFromCamera(mouseNDC.current, camera)

    if (carriedRef.current && terrainRef.current) {
      carryPlane.current.set(carryPlane.current.normal, -carryHeight.current)
      const hit = raycaster.ray.intersectPlane(carryPlane.current, planeHit.current)
      if (hit) {
        lerpTarget.current.set(hit.x, carryHeight.current, hit.z)
        carriedRef.current.position.lerp(lerpTarget.current, 0.6)

        const terrainHits = raycaster.intersectObject(terrainRef.current)
        if (terrainHits.length > 0) {
          if (!terrainHitRef.current) terrainHitRef.current = new THREE.Vector3()
          terrainHitRef.current.copy(terrainHits[0].point)
        }
      }
      return
    }

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
    if (!enabled) return undefined

    const target = eventTargetRef.current
    if (!target) return undefined

    const onPointerDown = (event: PointerEvent) => {
      const element = event.target as HTMLElement
      if (element.closest('.sketch-ui-surface') || element.closest('.sketch-back-btn')) return

      event.preventDefault()
      if (carriedRef.current) {
        const hit = getTerrainPointAtPoint(event.clientX, event.clientY) ?? terrainHitRef.current
        if (hit) {
          const dropped = new THREE.Vector3(hit.x, hit.y + 0.35, hit.z)
          carriedRef.current.position.copy(dropped)
          carriedRef.current.userData.basePosition = dropped.clone()
        }
        carriedRef.current = null
        hoveredRef.current = null
        onCursorChange('default')
        onInteraction?.('drop', event.clientX, event.clientY)
      } else {
        const directHit = getAnimalAtPoint(event.clientX, event.clientY) ?? hoveredRef.current
        if (!directHit) return
        hoveredRef.current = directHit
        carriedRef.current = directHit
        carryHeight.current = directHit.position.y + liftOffset
        onCursorChange('grabbing')
        onInteraction?.('pick', event.clientX, event.clientY)
      }
    }

    target.addEventListener('pointerdown', onPointerDown)
    return () => target.removeEventListener('pointerdown', onPointerDown)
  }, [carriedRef, enabled, eventTargetRef, getAnimalAtPoint, getTerrainPointAtPoint, onCursorChange, onInteraction])

  return null
}

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

interface SketchbookCanvasProps {
  onCursorChange?: (state: 'default' | 'grab' | 'grabbing') => void
  onInteraction?: (kind: 'pick' | 'drop', x: number, y: number) => void
  onInteractionModeChange?: (mode: SketchbookInteractionMode) => void
  onSculptEnabledChange?: (enabled: boolean) => void
  onExplorePointerLockChange?: (locked: boolean) => void
  scrollProgressRef?: React.MutableRefObject<number>
  isVisible?: boolean
  uiHidden?: boolean
  interactionBlocked?: boolean
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
  onInteractionModeChange,
  onSculptEnabledChange,
  onExplorePointerLockChange,
  uiHidden = false,
  interactionBlocked = false,
}: SketchbookCanvasProps, ref) {
  const emitCursorChange = onCursorChange ?? (() => {})
  const mouseRef = useRef({ x: 0.5, y: 0.5, active: false })
  const gyroRef = useRef({ x: 0, y: 0 })
  const keysRef = useRef(new Set<string>())
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const cameraRef = useRef<THREE.Camera | null>(null)
  const cameraOverrideRef = useRef<CameraOverride | null>(null)
  const surveyOrbitRef = useRef({ yaw: 0, pitch: 0 })
  const brushActiveRef = useRef(false)
  const cameraDragRef = useRef({ active: false, pointerId: -1, lastX: 0, lastY: 0 })
  const touchStateRef = useRef({
    mode: 'idle' as 'idle' | 'look' | 'brush' | 'pinch',
    startX: 0,
    startY: 0,
    startLookX: 0,
    startLookY: 0,
    startZoom: 0,
    startDistance: 0,
  })
  const exploreStateRef = useRef<ExploreState>(createExploreState())
  const pointerLookRef = useRef({ x: 0, y: 0, hasLast: false })
  const containerRef = useRef<HTMLDivElement>(null)
  const animalsRef = useRef<THREE.Group | null>(null)
  const terrainRef = useRef<THREE.Mesh | null>(null)
  const carriedRef = useRef<THREE.Mesh | null>(null)
  const uiInteracting = useRef(false)
  const isPhone = useIsPhone()
  const isTouchDevice = useTouchDevice()
  const isMobile = isPhone || isTouchDevice
  const gyro = useGyroscope()
  const [interactionMode, setInteractionMode] = useState<SketchbookInteractionMode>('sculpt')
  const [viewIndex, setViewIndex] = useState(DEFAULT_VIEW_INDEX)
  const [perchIndex, setPerchIndex] = useState(DEFAULT_PERCH_INDEX)
  const [zoom, setZoom] = useState(DEFAULT_SURVEY_ZOOM)
  const [sculptEnabled, setSculptEnabled] = useState(false)
  const [explorePointerLocked, setExplorePointerLocked] = useState(false)
  const [brushMode, setBrushMode] = useState<BrushMode>('raise')
  const [brushStrength, setBrushStrength] = useState(0.2)
  const [decayEnabled, setDecayEnabled] = useState(true)
  const [decayAmount, setDecayAmount] = useState(DEFAULT_DECAY_AMOUNT * 0.7)
  const deformation = useTerrainDeformation({ decayEnabled, decayAmount })
  const progressRef = useRef(1)
  const zoomRef = useRef(zoom)

  const sampleTerrainHeight = useCallback((x: number, z: number) => {
    const sampleX = clampTerrainBounds(x, EXPLORE_MARGIN)
    const sampleZ = clampTerrainBounds(z, EXPLORE_MARGIN)
    return getTerrainHeight(sampleX, sampleZ) + deformation.getDeformOffset(sampleX, sampleZ)
  }, [deformation])

  const cycleView = useCallback(() => {
    surveyOrbitRef.current.yaw = 0
    surveyOrbitRef.current.pitch = 0
    setViewIndex(index => (index + 1) % SURVEY_VIEWS.length)
  }, [])
  const cyclePerch = useCallback(() => {
    setPerchIndex(index => (index + 1) % RESOLVED_EXPLORE_PERCHES.length)
    setInteractionMode('explore')
  }, [])
  const cycleBrush = useCallback(() => {
    setBrushMode(mode => {
      const index = BRUSH_MODES.indexOf(mode)
      return BRUSH_MODES[(index + 1) % BRUSH_MODES.length]
    })
  }, [])
  const activateExploreMode = useCallback(() => {
    if (!isMobile) {
      containerRef.current?.requestPointerLock?.()
    }
    setInteractionMode('explore')
  }, [isMobile])

  const activateSculptMode = useCallback(() => {
    brushActiveRef.current = false
    cameraDragRef.current.active = false
    mouseRef.current.active = false
    setInteractionMode('sculpt')
    if (document.pointerLockElement === containerRef.current) {
      document.exitPointerLock()
    }
  }, [])

  const toggleMode = useCallback(() => {
    setInteractionMode(mode => (mode === 'explore' ? 'sculpt' : 'explore'))
  }, [])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    onInteractionModeChange?.(interactionMode)
  }, [interactionMode, onInteractionModeChange])

  useEffect(() => {
    onSculptEnabledChange?.(sculptEnabled)
  }, [onSculptEnabledChange, sculptEnabled])

  useEffect(() => {
    onExplorePointerLockChange?.(explorePointerLocked)
  }, [explorePointerLocked, onExplorePointerLockChange])

  useEffect(() => {
    if (interactionMode === 'explore' || document.pointerLockElement !== containerRef.current) return
    document.exitPointerLock()
  }, [interactionMode])

  useEffect(() => {
    if (!interactionBlocked) return
    brushActiveRef.current = false
    cameraDragRef.current.active = false
    mouseRef.current.active = false
    keysRef.current.clear()
    if (document.pointerLockElement === containerRef.current) {
      document.exitPointerLock()
    }
  }, [interactionBlocked])

  useEffect(() => {
    if (interactionMode === 'explore') {
      brushActiveRef.current = false
      cameraDragRef.current.active = false
      mouseRef.current.active = false
      emitCursorChange('default')
      return
    }

    setExplorePointerLocked(false)
    if (!sculptEnabled) {
      brushActiveRef.current = false
      mouseRef.current.active = false
      emitCursorChange('default')
    }
  }, [emitCursorChange, interactionMode, sculptEnabled])

  useEffect(() => {
    if (!gyro.permitted) return

    return gyro.subscribe((x, y) => {
      gyroRef.current.x = x
      gyroRef.current.y = y
    })
  }, [gyro, gyro.permitted])

  useEffect(() => {
    if (interactionBlocked) return undefined

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (key === 'tab') {
        event.preventDefault()
        toggleMode()
        return
      }

      if (['w', 'a', 's', 'd', 'q', 'e', 'c', 'r', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault()
        keysRef.current.add(key)
      }
    }

    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key.toLowerCase())
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      keysRef.current.clear()
    }
  }, [interactionBlocked, toggleMode])

  const isSketchUiTarget = useCallback((target: EventTarget | null) => {
    const element = target instanceof Element ? target : null
    return Boolean(element?.closest('.sketch-ui-surface') || element?.closest('.sketch-back-btn'))
  }, [])

  const updatePointerFromClient = useCallback((clientX: number, clientY: number, active = true) => {
    const element = containerRef.current
    if (!element) return

    const rect = element.getBoundingClientRect()
    mouseRef.current.x = clamp((clientX - rect.left) / rect.width, 0, 1)
    mouseRef.current.y = clamp((clientY - rect.top) / rect.height, 0, 1)
    mouseRef.current.active = active
  }, [])

  const onSliderPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    uiInteracting.current = true
    mouseRef.current.active = false
  }, [])

  const onSliderPointerEnd = useCallback(() => {
    uiInteracting.current = false
  }, [])

  useEffect(() => {
    const element = containerRef.current
    if (!element || interactionBlocked) return undefined

    const onPointerMove = (event: PointerEvent) => {
      if (isMobile && event.pointerType !== 'mouse') return
      if (uiInteracting.current) return
      if (isSketchUiTarget(event.target)) return

      if (interactionMode === 'explore') {
        if (event.pointerType === 'mouse') {
          const locked = document.pointerLockElement === element
          if (!locked) {
            pointerLookRef.current.hasLast = false
            mouseRef.current.active = false
            return
          }

          const dx = event.movementX
          const dy = event.movementY
          if (dx !== 0 || dy !== 0) {
            exploreStateRef.current.yaw -= dx * EXPLORE_LOOK_SENSITIVITY
            exploreStateRef.current.pitch = clampExplorePitch(
              exploreStateRef.current.pitch - dy * EXPLORE_LOOK_SENSITIVITY * 0.92,
            )
          }
        }
        mouseRef.current.active = false
        return
      }

      if (!sculptEnabled) {
        if (cameraDragRef.current.active && event.pointerType === 'mouse') {
          const dx = event.clientX - cameraDragRef.current.lastX
          const dy = event.clientY - cameraDragRef.current.lastY
          cameraDragRef.current.lastX = event.clientX
          cameraDragRef.current.lastY = event.clientY

          if (dx !== 0 || dy !== 0) {
            surveyOrbitRef.current.yaw -= dx * SURVEY_DRAG_YAW_SENSITIVITY
            surveyOrbitRef.current.pitch = clampSurveyPitch(
              surveyOrbitRef.current.pitch - dy * SURVEY_DRAG_PITCH_SENSITIVITY,
            )
          }
        }
        mouseRef.current.active = false
        return
      }

      updatePointerFromClient(event.clientX, event.clientY, true)
    }

    const onPointerLeave = () => {
      brushActiveRef.current = false
      if (!cameraDragRef.current.active || !element.hasPointerCapture(cameraDragRef.current.pointerId)) {
        cameraDragRef.current.active = false
      }
      mouseRef.current.active = false
      pointerLookRef.current.hasLast = false
      if (!carriedRef.current) emitCursorChange('default')
    }

    element.addEventListener('pointermove', onPointerMove)
    element.addEventListener('pointerleave', onPointerLeave)
    return () => {
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerleave', onPointerLeave)
    }
  }, [emitCursorChange, interactionBlocked, interactionMode, isMobile, isSketchUiTarget, sculptEnabled, updatePointerFromClient])

  useEffect(() => {
    const element = containerRef.current
    if (!element || isMobile || interactionBlocked) return undefined

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || isSketchUiTarget(event.target)) return

      if (interactionMode === 'explore') {
        if (document.pointerLockElement !== element) {
          element.requestPointerLock()
        }
        return
      }

      if (interactionMode !== 'sculpt') return

      if (!sculptEnabled) {
        cameraDragRef.current.active = true
        cameraDragRef.current.pointerId = event.pointerId
        cameraDragRef.current.lastX = event.clientX
        cameraDragRef.current.lastY = event.clientY
        element.setPointerCapture(event.pointerId)
        mouseRef.current.active = false
        return
      }

      brushActiveRef.current = true
      updatePointerFromClient(event.clientX, event.clientY, true)
    }

    const finishPointerGesture = (event: PointerEvent) => {
      if (cameraDragRef.current.active && cameraDragRef.current.pointerId === event.pointerId) {
        cameraDragRef.current.active = false
        if (element.hasPointerCapture(event.pointerId)) {
          element.releasePointerCapture(event.pointerId)
        }
      }
      brushActiveRef.current = false
    }

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === element
      setExplorePointerLocked(locked)
      if (!locked) {
        pointerLookRef.current.hasLast = false
      }
    }

    element.addEventListener('pointerdown', onPointerDown)
    element.addEventListener('pointerup', finishPointerGesture)
    element.addEventListener('pointercancel', finishPointerGesture)
    document.addEventListener('pointerlockchange', onPointerLockChange)

    return () => {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointerup', finishPointerGesture)
      element.removeEventListener('pointercancel', finishPointerGesture)
      document.removeEventListener('pointerlockchange', onPointerLockChange)
    }
  }, [interactionBlocked, interactionMode, isMobile, isSketchUiTarget, sculptEnabled, updatePointerFromClient])

  useEffect(() => {
    const element = containerRef.current
    if (!element || interactionBlocked) return undefined

    const onWheel = (event: WheelEvent) => {
      if (interactionMode !== 'sculpt') return
      event.preventDefault()
      setZoom(value => clamp(value + (event.deltaY < 0 ? 0.045 : -0.045), 0.2, 2.5))
    }

    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [interactionBlocked, interactionMode])

  useEffect(() => {
    if (!isMobile || interactionBlocked) return undefined

    const element = containerRef.current
    if (!element) return undefined

    const beginSingleTouch = (touch: Touch) => {
      touchStateRef.current.startX = touch.clientX
      touchStateRef.current.startY = touch.clientY
      touchStateRef.current.startLookX = interactionMode === 'explore'
        ? exploreStateRef.current.yaw
        : surveyOrbitRef.current.yaw
      touchStateRef.current.startLookY = interactionMode === 'explore'
        ? exploreStateRef.current.pitch
        : surveyOrbitRef.current.pitch
      touchStateRef.current.mode = (interactionMode === 'sculpt' && sculptEnabled) || Boolean(carriedRef.current) ? 'brush' : 'look'

      if (touchStateRef.current.mode === 'brush') {
        brushActiveRef.current = true
        updatePointerFromClient(touch.clientX, touch.clientY, true)
      } else {
        brushActiveRef.current = false
        mouseRef.current.active = false
      }
    }

    const onTouchStart = (event: TouchEvent) => {
      if (isSketchUiTarget(event.target)) return
      event.preventDefault()

      if (event.touches.length >= 2) {
        touchStateRef.current.mode = 'pinch'
        touchStateRef.current.startDistance = getTouchDistance(event.touches)
        touchStateRef.current.startZoom = zoomRef.current
        brushActiveRef.current = false
        mouseRef.current.active = false
        return
      }

      const touch = event.touches[0]
      if (!touch) return
      beginSingleTouch(touch)
    }

    const onTouchMove = (event: TouchEvent) => {
      if (isSketchUiTarget(event.target)) return

      if (event.touches.length >= 2) {
        if (interactionMode !== 'sculpt') return

        event.preventDefault()
        brushActiveRef.current = false
        const distance = getTouchDistance(event.touches)
        if (!touchStateRef.current.startDistance) {
          touchStateRef.current.startDistance = distance
          touchStateRef.current.startZoom = zoomRef.current
        }

        const nextZoom = clamp(
          touchStateRef.current.startZoom + (distance - touchStateRef.current.startDistance) * 0.0035,
          0.2,
          2.5,
        )
        setZoom(nextZoom)
        mouseRef.current.active = false
        return
      }

      const touch = event.touches[0]
      if (!touch) return

      event.preventDefault()
      if ((interactionMode === 'sculpt' && sculptEnabled) || carriedRef.current) {
        touchStateRef.current.mode = 'brush'
        brushActiveRef.current = true
        updatePointerFromClient(touch.clientX, touch.clientY, true)
        return
      }

      touchStateRef.current.mode = 'look'
      brushActiveRef.current = false
      const dx = (touch.clientX - touchStateRef.current.startX) / element.clientWidth
      const dy = (touch.clientY - touchStateRef.current.startY) / element.clientHeight
      if (interactionMode === 'explore') {
        exploreStateRef.current.yaw = touchStateRef.current.startLookX - dx * 4.1
        exploreStateRef.current.pitch = clampExplorePitch(touchStateRef.current.startLookY - dy * 2.9)
      } else {
        surveyOrbitRef.current.yaw = touchStateRef.current.startLookX - dx * 4.4
        surveyOrbitRef.current.pitch = clampSurveyPitch(touchStateRef.current.startLookY - dy * 2.8)
      }
      mouseRef.current.active = false
    }

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) {
        touchStateRef.current.mode = 'pinch'
        touchStateRef.current.startDistance = getTouchDistance(event.touches)
        touchStateRef.current.startZoom = zoomRef.current
        brushActiveRef.current = false
        mouseRef.current.active = false
        return
      }

      if (event.touches.length === 1) {
        beginSingleTouch(event.touches[0])
        return
      }

      touchStateRef.current.mode = 'idle'
      touchStateRef.current.startDistance = 0
      brushActiveRef.current = false
      mouseRef.current.active = false
      if (!carriedRef.current) emitCursorChange('default')
    }

    element.addEventListener('touchstart', onTouchStart, { passive: false })
    element.addEventListener('touchmove', onTouchMove, { passive: false })
    element.addEventListener('touchend', onTouchEnd)
    element.addEventListener('touchcancel', onTouchEnd)

    return () => {
      element.removeEventListener('touchstart', onTouchStart)
      element.removeEventListener('touchmove', onTouchMove)
      element.removeEventListener('touchend', onTouchEnd)
      element.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [emitCursorChange, interactionBlocked, interactionMode, isMobile, isSketchUiTarget, sculptEnabled, updatePointerFromClient])

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
  }), [sampleTerrainHeight])

  const viewName = SURVEY_VIEWS[viewIndex % SURVEY_VIEWS.length].name
  const perch = RESOLVED_EXPLORE_PERCHES[perchIndex % RESOLVED_EXPLORE_PERCHES.length]
  const brushDescriptor = describeBrushStrength(brushStrength)
  const decayDescriptor = decayEnabled ? describeDecayAmount(decayAmount) : 'paused'
  const brushSliderStyle = { '--sketch-slider-fill': `${brushStrength * 100}%` } as CSSProperties
  const decaySliderStyle = { '--sketch-slider-fill': `${decayAmount * 100}%` } as CSSProperties
  const canvasCursor = interactionMode === 'explore' && !explorePointerLocked ? 'default' : 'none'

  return (
    <div ref={containerRef} className={`sketchbook-canvas-wrapper sketchbook-canvas-wrapper--${interactionMode}`}>
      <Canvas
        dpr={[1, Math.min(window.devicePixelRatio, 1.1)]}
        gl={{ antialias: false, powerPreference: 'high-performance', alpha: false, preserveDrawingBuffer: true }}
        camera={{ position: [0, 10, 30], fov: 62, near: 0.1, far: 320 }}
        frameloop="always"
        onCreated={({ gl, camera }) => {
          rendererRef.current = gl
          cameraRef.current = camera
        }}
      >
        <SceneCleanup />
        <CursorEnforcer cursor={canvasCursor} />
        <color attach="background" args={['#bcc8cc']} />
        <ambientLight intensity={0.36} />
        <directionalLight position={[36, 34, 16]} intensity={1.04} color="#ecd9ba" />
        <directionalLight position={[-20, 18, -14]} intensity={0.34} color="#cfdae0" />
        <hemisphereLight args={['#cedadd', '#8a775a', 0.78]} />

        <SketchAtmosphere isMobile={isMobile} />

        <CameraController
          mouseRef={mouseRef}
          gyroRef={gyroRef}
          keysRef={keysRef}
          surveyOrbitRef={surveyOrbitRef}
          cameraOverrideRef={cameraOverrideRef}
          exploreStateRef={exploreStateRef}
          sampleTerrainHeight={sampleTerrainHeight}
          interactionMode={interactionMode}
          isMobile={isMobile}
          viewIndex={viewIndex}
          zoom={zoom}
          perchIndex={perchIndex}
        />
        <Terrain
          mouseRef={mouseRef}
          scrollProgress={progressRef}
          meshRef={terrainRef}
          brushEnabled={interactionMode === 'sculpt' && sculptEnabled}
          brushActiveRef={brushActiveRef}
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
          enabled={interactionMode === 'sculpt' && sculptEnabled}
          animalsRef={animalsRef}
          terrainRef={terrainRef}
          eventTargetRef={containerRef}
          mouseRef={mouseRef}
          carriedRef={carriedRef}
          onCursorChange={emitCursorChange}
          onInteraction={onInteraction}
        />

        <fogExp2 attach="fog" args={['#c6d1d2', 0.0079]} />
        <SketchPostProcessing />
      </Canvas>

      {!uiHidden && (
        <div className="sketch-mode-switch sketch-mode-switch--floating sketch-ui-surface">
          <button
            className={`sketch-btn sketch-mode-switch__btn ${interactionMode === 'explore' ? 'sketch-btn--active' : ''}`}
            onClick={activateExploreMode}
          >
            explore
          </button>
          <button
            className={`sketch-btn sketch-mode-switch__btn ${interactionMode === 'sculpt' ? 'sketch-btn--active' : ''}`}
            onClick={activateSculptMode}
          >
            sculpt
          </button>
        </div>
      )}

      <div
        className={`sketch-side-panel sketch-side-panel--${interactionMode} sketch-ui-surface ${uiHidden ? 'sketch-side-panel--hidden' : ''}`}
      >
        {interactionMode === 'explore' ? (
          <div className="sketch-side-panel__section sketch-side-panel__section--explore">
            <button
              className="sketch-btn sketch-side-panel__wide-btn sketch-side-panel__wide-btn--explore"
              onClick={cyclePerch}
            >
              perch: {perch.label}
            </button>
          </div>
        ) : (
          <>
            <div className="sketch-side-panel__section sketch-side-panel__section--survey">
              <button
                className="sketch-btn sketch-side-panel__wide-btn sketch-side-panel__wide-btn--survey"
                onClick={cycleView}
              >
                survey: {viewName}
              </button>
            </div>

            <div className="sketch-side-panel__section">
              <button
                className={`sketch-btn sketch-side-panel__wide-btn ${sculptEnabled ? 'sketch-btn--active' : ''}`}
                onClick={() => setSculptEnabled(enabled => !enabled)}
              >
                {sculptEnabled ? 'sculpt on' : 'sculpt off'}
              </button>
            </div>

            {sculptEnabled && (
              <>
                <div className="sketch-side-panel__section sketch-side-panel__section--pair">
                  <button
                    className={`sketch-btn sketch-btn--brush-toggle ${decayEnabled ? 'sketch-btn--active' : ''}`}
                    onClick={() => setDecayEnabled(enabled => !enabled)}
                  >
                    {decayEnabled ? 'decay on' : 'decay hold'}
                  </button>

                  <button className="sketch-btn sketch-btn--brush-mode" onClick={cycleBrush}>
                    {BRUSH_LABELS[brushMode]}
                  </button>
                </div>

                <div className="sketch-side-panel__section sketch-side-panel__section--sliders">
                  <div
                    className="sketch-slider-control"
                    style={brushSliderStyle}
                    onPointerDown={onSliderPointerDown}
                    onPointerUp={onSliderPointerEnd}
                    onPointerCancel={onSliderPointerEnd}
                    onLostPointerCapture={onSliderPointerEnd}
                  >
                    <div className="sketch-slider-control__meta">
                      <span className="sketch-slider-control__name">brush</span>
                      <span className="sketch-slider-control__value">{brushDescriptor}</span>
                    </div>
                    <input
                      type="range"
                      className="sketch-brush-slider sketch-slider-control__input"
                      min={0.05}
                      max={1}
                      step={0.01}
                      value={brushStrength}
                      onChange={event => setBrushStrength(parseFloat(event.target.value))}
                    />
                  </div>

                  <div
                    className="sketch-slider-control"
                    style={decaySliderStyle}
                    onPointerDown={onSliderPointerDown}
                    onPointerUp={onSliderPointerEnd}
                    onPointerCancel={onSliderPointerEnd}
                    onLostPointerCapture={onSliderPointerEnd}
                  >
                    <div className="sketch-slider-control__meta">
                      <span className="sketch-slider-control__name">decay</span>
                      <span className="sketch-slider-control__value">{decayDescriptor}</span>
                    </div>
                    <input
                      type="range"
                      className="sketch-brush-slider sketch-slider-control__input"
                      min={0}
                      max={1}
                      step={0.01}
                      value={decayAmount}
                      onChange={event => setDecayAmount(parseFloat(event.target.value))}
                    />
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
})

export default SketchbookCanvas
