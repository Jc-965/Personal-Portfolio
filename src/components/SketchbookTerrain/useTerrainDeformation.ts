import { useRef, useCallback, useEffect } from 'react'
import * as THREE from 'three'

const DEFORM_SIZE = 128
const DECAY_RATE = 0.997
const ENCODE_SCALE = 12.8

export type BrushMode = 'raise' | 'lower' | 'flatten' | 'smooth' | 'noise'

const BRUSH_CONFIGS: Record<BrushMode, { radius: number; strength: number }> = {
  raise: { radius: 12, strength: 0.06 },
  lower: { radius: 12, strength: -0.06 },
  flatten: { radius: 14, strength: 0.10 },
  smooth: { radius: 20, strength: 0.15 },
  noise: { radius: 14, strength: 0.25 },
}

export function useTerrainDeformation() {
  const dataRef = useRef(new Float32Array(DEFORM_SIZE * DEFORM_SIZE))
  const textureRef = useRef<THREE.DataTexture | null>(null)
  const needsUploadRef = useRef(false)
  const lastDeformTime = useRef(0)
  const noiseOffset = useRef(0)
  const hasActiveData = useRef(false)

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
    const cx = Math.floor(u * DEFORM_SIZE)
    const cy = Math.floor(v * DEFORM_SIZE)

    for (let dy = -cfg.radius; dy <= cfg.radius; dy++) {
      for (let dx = -cfg.radius; dx <= cfg.radius; dx++) {
        const px = cx + dx
        const py = cy + dy
        if (px < 0 || px >= DEFORM_SIZE || py < 0 || py >= DEFORM_SIZE) continue

        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > cfg.radius) continue

        const falloff = 1.0 - dist / cfg.radius
        const gaussian = falloff * falloff * (3.0 - 2.0 * falloff)
        const idx = py * DEFORM_SIZE + px

        switch (mode) {
          case 'raise':
          case 'lower':
            data[idx] += effectiveStrength * gaussian
            break
          case 'flatten':
            data[idx] *= (1.0 - gaussian * Math.abs(effectiveStrength) * 3)
            break
          case 'smooth': {
            let sum = 0
            let count = 0
            const kernel = 4
            for (let sy = -kernel; sy <= kernel; sy++) {
              for (let sx = -kernel; sx <= kernel; sx++) {
                const nx = px + sx
                const ny = py + sy
                if (nx >= 0 && nx < DEFORM_SIZE && ny >= 0 && ny < DEFORM_SIZE) {
                  sum += data[ny * DEFORM_SIZE + nx]
                  count++
                }
              }
            }
            const avg = sum / count
            data[idx] += (avg - data[idx]) * gaussian * Math.abs(effectiveStrength) * 10
            break
          }
          case 'noise': {
            noiseOffset.current += 0.01
            const n1 = Math.sin(px * 0.5 + noiseOffset.current) * Math.cos(py * 0.5 + noiseOffset.current * 0.7)
            const n2 = Math.sin(px * 1.2 + noiseOffset.current * 1.3) * Math.cos(py * 0.8 - noiseOffset.current * 0.5) * 0.5
            data[idx] += (n1 + n2) * effectiveStrength * gaussian
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
    if (now - lastDeformTime.current > 100) {
      const data = dataRef.current
      let hasValues = false
      for (let i = 0; i < data.length; i++) {
        if (Math.abs(data[i]) > 0.001) {
          data[i] *= DECAY_RATE
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
    const u = (worldX + 70) / 140
    const v = (-worldZ + 70) / 140
    if (u < 0 || u > 1 || v < 0 || v > 1) return 0
    const px = Math.floor(u * (DEFORM_SIZE - 1))
    const py = Math.floor(v * (DEFORM_SIZE - 1))
    const val = dataRef.current[py * DEFORM_SIZE + px]
    return val * 5.0
  }, [])

  useEffect(() => {
    return () => {
      textureRef.current?.dispose()
    }
  }, [])

  return { getTexture, applyBrush, update, getDeformOffset }
}
