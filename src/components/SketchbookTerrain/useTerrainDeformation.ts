import { useRef, useCallback, useEffect } from 'react'
import * as THREE from 'three'
import { cnoise, getTerrainHeight } from './noiseUtils'

const DEFORM_SIZE = 128
export const DEFAULT_DECAY_AMOUNT = 0.5
const MAX_DECAY_STEP = 0.01
const ENCODE_SCALE = 12.8
const TERRAIN_WORLD_SIZE = 124
const TERRAIN_HALF_SIZE = TERRAIN_WORLD_SIZE * 0.5
const DEFORM_WORLD_STRENGTH = 5.0

export type BrushMode = 'raise' | 'lower' | 'flatten' | 'smooth' | 'noise'

const BRUSH_CONFIGS: Record<BrushMode, { radius: number; strength: number }> = {
  raise: { radius: 12, strength: 0.06 },
  lower: { radius: 12, strength: -0.06 },
  flatten: { radius: 16, strength: 0.42 },
  smooth: { radius: 18, strength: 0.16 },
  noise: { radius: 16, strength: 0.18 },
}

interface TerrainDeformationOptions {
  decayEnabled?: boolean
  decayAmount?: number
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

export function useTerrainDeformation({
  decayEnabled = true,
  decayAmount = DEFAULT_DECAY_AMOUNT,
}: TerrainDeformationOptions = {}) {
  const dataRef = useRef(new Float32Array(DEFORM_SIZE * DEFORM_SIZE))
  const scratchRef = useRef(new Float32Array(DEFORM_SIZE * DEFORM_SIZE))
  const baseHeightsRef = useRef<Float32Array | null>(null)
  const textureRef = useRef<THREE.DataTexture | null>(null)
  const needsUploadRef = useRef(false)
  const lastDeformTime = useRef(0)
  const hasActiveData = useRef(false)
  const decayEnabledRef = useRef(decayEnabled)
  const decayAmountRef = useRef(decayAmount)

  useEffect(() => {
    decayEnabledRef.current = decayEnabled
    decayAmountRef.current = clamp(decayAmount, 0, 1)
  }, [decayAmount, decayEnabled])

  const getBaseHeights = useCallback(() => {
    if (!baseHeightsRef.current) {
      const next = new Float32Array(DEFORM_SIZE * DEFORM_SIZE)
      for (let py = 0; py < DEFORM_SIZE; py++) {
        for (let px = 0; px < DEFORM_SIZE; px++) {
          const worldX = ((px + 0.5) / DEFORM_SIZE) * TERRAIN_WORLD_SIZE - TERRAIN_HALF_SIZE
          const worldZ = TERRAIN_HALF_SIZE - ((py + 0.5) / DEFORM_SIZE) * TERRAIN_WORLD_SIZE
          next[py * DEFORM_SIZE + px] = getTerrainHeight(worldX, worldZ)
        }
      }
      baseHeightsRef.current = next
    }
    return baseHeightsRef.current
  }, [])

  const getTexture = useCallback(() => {
    if (!textureRef.current) {
      const data = new Uint8Array(DEFORM_SIZE * DEFORM_SIZE)
      data.fill(128)
      textureRef.current = new THREE.DataTexture(
        data,
        DEFORM_SIZE,
        DEFORM_SIZE,
        THREE.RedFormat,
        THREE.UnsignedByteType
      )
      textureRef.current.needsUpdate = true
    }
    return textureRef.current
  }, [])

  const applyBrush = useCallback((u: number, v: number, mode: BrushMode = 'raise', strengthMul = 1.0) => {
    const cfg = BRUSH_CONFIGS[mode]
    const effectiveStrength = cfg.strength * strengthMul
    const data = dataRef.current
    const source = scratchRef.current
    const baseHeights = getBaseHeights()
    source.set(data)

    const cx = clamp(Math.floor(u * (DEFORM_SIZE - 1)), 0, DEFORM_SIZE - 1)
    const cy = clamp(Math.floor(v * (DEFORM_SIZE - 1)), 0, DEFORM_SIZE - 1)
    const centerIdx = cy * DEFORM_SIZE + cx
    const centerWorldHeight = baseHeights[centerIdx] + source[centerIdx] * DEFORM_WORLD_STRENGTH

    const sampleAverageDeform = (px: number, py: number, kernel: number) => {
      let sum = 0
      let count = 0
      for (let sy = -kernel; sy <= kernel; sy++) {
        for (let sx = -kernel; sx <= kernel; sx++) {
          const nx = px + sx
          const ny = py + sy
          if (nx < 0 || nx >= DEFORM_SIZE || ny < 0 || ny >= DEFORM_SIZE) continue
          sum += source[ny * DEFORM_SIZE + nx]
          count++
        }
      }
      return count > 0 ? sum / count : source[centerIdx]
    }

    const getWorldPosition = (px: number, py: number) => {
      const worldX = ((px + 0.5) / DEFORM_SIZE) * TERRAIN_WORLD_SIZE - TERRAIN_HALF_SIZE
      const worldZ = TERRAIN_HALF_SIZE - ((py + 0.5) / DEFORM_SIZE) * TERRAIN_WORLD_SIZE
      return { worldX, worldZ }
    }

    const sampleUnnaturalPattern = (px: number, py: number, radiusNorm: number) => {
      const localX = (px - cx) / cfg.radius
      const localY = (py - cy) / cfg.radius
      const angle = Math.atan2(localY, localX)
      const { worldX, worldZ } = getWorldPosition(px, py)

      const warpBase = cnoise(worldX * 0.1 + 13.7, worldZ * 0.1 - 8.2)
      const warpedNoise = cnoise(
        worldX * 0.34 + warpBase * 3.1 + localY * 1.8,
        worldZ * 0.34 - warpBase * 3.1 - localX * 1.8,
      )
      const warpedNoise01 = warpedNoise * 0.5 + 0.5
      const ridges = 1 - Math.abs(Math.sin(localX * 5.4 - localY * 3.8 + warpBase * 4.2))
      const swirlBands = 1 - Math.abs(Math.sin(angle * 3.0 + radiusNorm * 10.5 + warpBase * 4.8))
      const terraces = Math.round((warpedNoise01 + swirlBands * 0.45) * 4.2) / 4.2
      const crown = Math.pow(1 - radiusNorm, 0.72)
      const uplift = (
        ridges * 0.34 +
        warpedNoise01 * 0.2 +
        swirlBands * 0.22 +
        terraces * 0.24
      ) * (0.58 + crown * 0.42)

      return clamp(uplift, 0, 1.6)
    }

    for (let dy = -cfg.radius; dy <= cfg.radius; dy++) {
      for (let dx = -cfg.radius; dx <= cfg.radius; dx++) {
        const px = cx + dx
        const py = cy + dy
        if (px < 0 || px >= DEFORM_SIZE || py < 0 || py >= DEFORM_SIZE) continue

        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > cfg.radius) continue

        const radiusNorm = dist / cfg.radius
        const falloff = 1.0 - dist / cfg.radius
        const gaussian = falloff * falloff * (3.0 - 2.0 * falloff)
        const idx = py * DEFORM_SIZE + px
        const baseHeight = baseHeights[idx]

        switch (mode) {
          case 'raise':
          case 'lower':
            data[idx] = source[idx] + effectiveStrength * gaussian
            break
          case 'flatten': {
            const targetDeform = (centerWorldHeight - baseHeight) / DEFORM_WORLD_STRENGTH
            const blend = clamp(gaussian * Math.abs(effectiveStrength) * 5.4, 0, 1)
            data[idx] = THREE.MathUtils.lerp(source[idx], targetDeform, blend)
            break
          }
          case 'smooth': {
            const nearbyAverageDeform = sampleAverageDeform(px, py, 3)
            const widerAverageDeform = sampleAverageDeform(px, py, 6)
            const targetDeform = THREE.MathUtils.lerp(nearbyAverageDeform, widerAverageDeform, 0.22)
            const blend = clamp(gaussian * (0.08 + Math.abs(effectiveStrength) * 2.15), 0, 1)
            data[idx] = THREE.MathUtils.lerp(source[idx], targetDeform, blend)
            break
          }
          case 'noise': {
            const localAverageDeform = sampleAverageDeform(px, py, 3)
            const unnaturalPattern = sampleUnnaturalPattern(px, py, radiusNorm)
            const upliftBase = Math.max(source[idx], localAverageDeform)
            const amplitude = (0.18 + Math.abs(effectiveStrength) * 6.4) * THREE.MathUtils.lerp(0.4, 1, gaussian)
            const targetDeform = clamp(
              upliftBase + unnaturalPattern * amplitude,
              -8,
              8,
            )
            const blend = clamp(gaussian * (0.08 + Math.abs(effectiveStrength) * 2.8), 0, 1)
            data[idx] = THREE.MathUtils.lerp(source[idx], targetDeform, blend)
            break
          }
        }
      }
    }

    needsUploadRef.current = true
    hasActiveData.current = true
    lastDeformTime.current = performance.now()
  }, [])

  const update = useCallback(() => {
    if (!hasActiveData.current) return

    const now = performance.now()
    const shouldDecay = decayEnabledRef.current && decayAmountRef.current > 0
    if (shouldDecay && now - lastDeformTime.current > 100) {
      const decayRate = 1 - decayAmountRef.current * MAX_DECAY_STEP
      const data = dataRef.current
      let hasValues = false
      for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > 0.001) {
          data[i] *= decayRate
          hasValues = true
        } else {
          data[i] = 0
        }
      }
      if (hasValues) {
        needsUploadRef.current = true
      } else {
        hasActiveData.current = false
      }
    }

    if (needsUploadRef.current && textureRef.current) {
      const data = dataRef.current
      const pixels = textureRef.current.image.data as Uint8Array
      for (let i = 0; i < data.length; i++) {
        pixels[i] = Math.max(0, Math.min(255, Math.floor(data[i] * ENCODE_SCALE + 128)))
      }
      textureRef.current.needsUpdate = true
      needsUploadRef.current = false
    }
  }, [])

  const getDeformOffset = useCallback((worldX: number, worldZ: number): number => {
    const u = (worldX + TERRAIN_HALF_SIZE) / TERRAIN_WORLD_SIZE
    const v = (-worldZ + TERRAIN_HALF_SIZE) / TERRAIN_WORLD_SIZE
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0
    const px = Math.floor(u * (DEFORM_SIZE - 1))
    const py = Math.floor(v * (DEFORM_SIZE - 1))
    const val = dataRef.current[py * DEFORM_SIZE + px]
    return val * DEFORM_WORLD_STRENGTH
  }, [])

  useEffect(() => {
    return () => {
      textureRef.current?.dispose()
    }
  }, [])

  return { getTexture, applyBrush, update, getDeformOffset }
}
