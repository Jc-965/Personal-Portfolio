import { useRef, useCallback, useEffect } from 'react'
import * as THREE from 'three'

const DEFORM_SIZE = 128
const BRUSH_RADIUS = 8
const BRUSH_STRENGTH = 0.15
const DECAY_RATE = 0.997

export function useTerrainDeformation() {
  const dataRef = useRef(new Float32Array(DEFORM_SIZE * DEFORM_SIZE))
  const textureRef = useRef<THREE.DataTexture | null>(null)
  const needsUploadRef = useRef(false)
  const lastDeformTime = useRef(0)

  const getTexture = useCallback(() => {
    if (!textureRef.current) {
      const data = new Uint8Array(DEFORM_SIZE * DEFORM_SIZE * 4)
      textureRef.current = new THREE.DataTexture(
        data,
        DEFORM_SIZE,
        DEFORM_SIZE,
        THREE.RGBAFormat,
        THREE.UnsignedByteType
      )
      textureRef.current.needsUpdate = true
    }
    return textureRef.current
  }, [])

  const applyBrush = useCallback((u: number, v: number, strength = BRUSH_STRENGTH) => {
    const data = dataRef.current
    const cx = Math.floor(u * DEFORM_SIZE)
    const cy = Math.floor(v * DEFORM_SIZE)

    for (let dy = -BRUSH_RADIUS; dy <= BRUSH_RADIUS; dy++) {
      for (let dx = -BRUSH_RADIUS; dx <= BRUSH_RADIUS; dx++) {
        const px = cx + dx
        const py = cy + dy
        if (px < 0 || px >= DEFORM_SIZE || py < 0 || py >= DEFORM_SIZE) continue

        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > BRUSH_RADIUS) continue

        const falloff = 1.0 - dist / BRUSH_RADIUS
        const gaussian = falloff * falloff * (3.0 - 2.0 * falloff) // smoothstep
        data[py * DEFORM_SIZE + px] += strength * gaussian
      }
    }

    needsUploadRef.current = true
    lastDeformTime.current = performance.now()
  }, [])

  const update = useCallback(() => {
    // Decay old deformations
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
      if (hasValues) needsUploadRef.current = true
    }

    // Upload to texture
    if (needsUploadRef.current && textureRef.current) {
      const data = dataRef.current
      const pixels = textureRef.current.image.data as Uint8Array
      for (let i = 0; i < data.length; i++) {
        // Encode float [-1,1] range into [0,255] with 128 as zero
        const val = Math.max(0, Math.min(1, data[i] * 0.5 + 0.5))
        const byte = Math.floor(val * 255)
        pixels[i * 4] = byte
        pixels[i * 4 + 1] = byte
        pixels[i * 4 + 2] = byte
        pixels[i * 4 + 3] = 255
      }
      textureRef.current.needsUpdate = true
      needsUploadRef.current = false
    }
  }, [])

  useEffect(() => {
    return () => {
      textureRef.current?.dispose()
    }
  }, [])

  return { getTexture, applyBrush, update }
}
