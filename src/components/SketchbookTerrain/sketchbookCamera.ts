import * as THREE from "three"
import { getTerrainHeight } from "./noiseUtils"
import type { BrushMode } from "./useTerrainDeformation"

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export type SketchbookInteractionMode = 'explore' | 'sculpt'

export type TerrainHeightSampler = (x: number, z: number) => number
export type CameraOverride = {
  position: THREE.Vector3
  lookAt: THREE.Vector3
}

export type TerrainFeatureMetrics = {
  centerHeight: number
  nearAverage: number
  surroundingRelief: number
  prominence: number
  peakPenalty: number
  moderateHeightScore: number
  anchorHeight: number
}

export type ExploreState = {
  x: number
  z: number
  yaw: number
  pitch: number
  elevationOffset: number
  initialized: boolean
  perchIndex: number
}

export type ExplorePerch = {
  name: string
  label: string
  x: number
  z: number
}

export type ResolvedExplorePerch = ExplorePerch & {
  yaw: number
  pitch: number
  scenicScore: number
}

export const SURVEY_VIEWS = [
  { name: 'ridge table', pos: [0, 18, 36], look: [0, 3, -10] },
  { name: 'creek bend', pos: [24, 10, 22], look: [-10, 3, -12] },
  { name: 'overview', pos: [0, 30, 14], look: [0, 1, -10] },
  { name: 'tree line', pos: [-26, 12, 20], look: [14, 3, -14] },
] as const

export const EXPLORE_PERCHES: ExplorePerch[] = [
  { name: 'trailhead', label: 'fern trail', x: -24, z: 30 },
  { name: 'creek', label: 'water edge', x: 12, z: 18 },
  { name: 'ridge', label: 'stone rise', x: 26, z: -6 },
  { name: 'clearing', label: 'sun pocket', x: -10, z: -24 },
]

export const DEFAULT_VIEW_INDEX = SURVEY_VIEWS.findIndex(view => view.name === 'tree line')
export const DEFAULT_SURVEY_ZOOM = 0.6
export const TERRAIN_WORLD_SIZE = 124
export const TERRAIN_HALF_SIZE = TERRAIN_WORLD_SIZE * 0.5
export const EXPLORE_MARGIN = 7
export const EXPLORE_EYE_HEIGHT = 2.45
export const EXPLORE_STEP_HEIGHT = 2.2
export const EXPLORE_LOOK_SENSITIVITY = 0.0025
export const EXPLORE_ROTATE_SPEED = 2.2
export const EXPLORE_MOVE_SPEED = 12.4
export const EXPLORE_VERTICAL_SPEED = 8.9
export const EXPLORE_MIN_ELEVATION_OFFSET = -1.45
export const EXPLORE_MAX_ELEVATION_OFFSET = 24
export const EXPLORE_PERCH_DIRECTION_STEPS = 20
export const EXPLORE_PERCH_LOOK_DISTANCES = [28, 38, 50, 60] as const
export const SURVEY_LOOK_DISTANCE = 24
export const RECOMMENDED_CAPTURE_VIEW = {
  pos: [18, 15, 26],
  look: [-2, 4, -10],
} as const
export const RECOMMENDED_CAPTURE_MARGIN = 9
export const RECOMMENDED_CAPTURE_RADII = [26, 34, 44, 56] as const
export const RECOMMENDED_CAPTURE_ANGLE_STEPS = 16
export const RECOMMENDED_CAPTURE_GRID_STEP = 12
export const RECOMMENDED_CAPTURE_RELIEF_SAMPLE = 5

export const BRUSH_MODES: BrushMode[] = ['raise', 'lower', 'flatten', 'smooth', 'noise']
export const BRUSH_LABELS: Record<BrushMode, string> = {
  raise: 'raise',
  lower: 'dig',
  flatten: 'flatten',
  smooth: 'smooth',
  noise: 'roughen',
}

export const SURVEY_DRAG_YAW_SENSITIVITY = 0.0025
export const SURVEY_DRAG_PITCH_SENSITIVITY = 0.0025
export const SURVEY_ROTATE_SPEED = 2.05
export const clampSurveyPitch = (value: number) => clamp(value, -1.28, 1.05)

export const describeBrushStrength = (value: number) => {
  if (value < 0.18) return 'fine'
  if (value < 0.36) return 'light'
  if (value < 0.62) return 'bold'
  return 'heavy'
}

export const describeDecayAmount = (value: number) => {
  if (value < 0.16) return 'slow'
  if (value < 0.38) return 'gentle'
  if (value < 0.62) return 'steady'
  return 'quick'
}

export const createExploreState = (): ExploreState => ({
  x: RESOLVED_EXPLORE_PERCHES[DEFAULT_PERCH_INDEX].x,
  z: RESOLVED_EXPLORE_PERCHES[DEFAULT_PERCH_INDEX].z,
  yaw: RESOLVED_EXPLORE_PERCHES[DEFAULT_PERCH_INDEX].yaw,
  pitch: RESOLVED_EXPLORE_PERCHES[DEFAULT_PERCH_INDEX].pitch,
  elevationOffset: 0,
  initialized: false,
  perchIndex: DEFAULT_PERCH_INDEX,
})

export const clampTerrainBounds = (value: number, margin = RECOMMENDED_CAPTURE_MARGIN) => clamp(
  value,
  -TERRAIN_HALF_SIZE + margin,
  TERRAIN_HALF_SIZE - margin,
)

export const clampExplorePitch = (value: number) => clamp(value, -1.24, 0.7)

export const directionToYawPitch = (direction: THREE.Vector3) => ({
  yaw: Math.atan2(direction.x, -direction.z),
  pitch: Math.asin(clamp(direction.y, -1, 1)),
})

export const shortestAngleDistance = (a: number, b: number) => {
  const delta = Math.atan2(Math.sin(a - b), Math.cos(a - b))
  return Math.abs(delta)
}

export const collectSceneSubjects = (group: THREE.Group | null) => {
  if (!group) return []

  return group.children.map(child => {
    const position = new THREE.Vector3()
    child.getWorldPosition(position)
    return position
  })
}

export const estimateCameraFocusPoint = (camera: THREE.Camera, sampleTerrainHeight: TerrainHeightSampler) => {
  const forward = new THREE.Vector3()
  camera.getWorldDirection(forward)

  const bestPoint = new THREE.Vector3(0, sampleTerrainHeight(0, 0), 0)
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

export const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)

export const range = (values: number[]) => {
  if (values.length === 0) return 0
  let minValue = values[0]
  let maxValue = values[0]
  values.forEach(value => {
    minValue = Math.min(minValue, value)
    maxValue = Math.max(maxValue, value)
  })
  return maxValue - minValue
}

export const sampleRingHeights = (
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

export const sampleTerrainRelief = (x: number, z: number, sampleTerrainHeight: TerrainHeightSampler) => {
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

export const getTerrainFeatureMetrics = (x: number, z: number, sampleTerrainHeight: TerrainHeightSampler): TerrainFeatureMetrics => {
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

export const sampleTerrainGradientAngle = (x: number, z: number, sampleTerrainHeight: TerrainHeightSampler) => {
  const dx =
    sampleTerrainHeight(clampTerrainBounds(x + RECOMMENDED_CAPTURE_RELIEF_SAMPLE), z) -
    sampleTerrainHeight(clampTerrainBounds(x - RECOMMENDED_CAPTURE_RELIEF_SAMPLE), z)
  const dz =
    sampleTerrainHeight(x, clampTerrainBounds(z + RECOMMENDED_CAPTURE_RELIEF_SAMPLE)) -
    sampleTerrainHeight(x, clampTerrainBounds(z - RECOMMENDED_CAPTURE_RELIEF_SAMPLE))

  if (Math.abs(dx) + Math.abs(dz) < 0.001) return null
  return Math.atan2(dz, dx)
}

export const scoreSightlineClearance = (
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

export const resolveExplorePerch = (
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

export const RESOLVED_EXPLORE_PERCHES = EXPLORE_PERCHES.map(perch => resolveExplorePerch(perch, getTerrainHeight))

export const getDefaultPerchIndex = () => {
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

export const DEFAULT_PERCH_INDEX = getDefaultPerchIndex()

export const getRecommendedCaptureView = (
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

export const getTouchDistance = (touches: TouchList) => {
  if (touches.length < 2) return 0
  const [first, second] = [touches[0], touches[1]]
  return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY)
}
