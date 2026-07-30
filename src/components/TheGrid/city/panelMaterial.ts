import * as THREE from 'three'
import { mulberry32 } from './rand'

/**
 * PBR facades for signature structures: MeshStandardMaterial with a
 * canvas-baked emissive window map. The body is dark wet metal/glass that
 * picks up the scene's PMREM environment (real reflections of the city);
 * the windows glow in the structure's accent through the emissive channel.
 */

function bakeWindowMap(
  dims: [number, number, number],
  seed: number,
  windowDensity: number,
): THREE.CanvasTexture {
  const rng = mulberry32(Math.floor(seed * 97) + 11)
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const cols = Math.max(3, Math.floor(Math.max(dims[0], dims[2]) * 1.1))
    const rows = Math.max(4, Math.floor(dims[1] * 0.9))
    const cw = canvas.width / cols
    const rh = canvas.height / rows
    const litChance = windowDensity * 0.3
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (rng() > litChance) continue
        const brightness = 0.45 + rng() * 0.55
        const value = Math.floor(brightness * 255)
        ctx.fillStyle = `rgb(${value}, ${value}, ${value})`
        ctx.fillRect(
          c * cw + cw * 0.24,
          r * rh + rh * 0.3,
          cw * 0.52,
          rh * 0.4,
        )
      }
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  return texture
}

export function makePanelMaterial(
  accent: string,
  dims: [number, number, number],
  seed = 1,
  windowDensity = 0.8,
) {
  const emissiveMap = bakeWindowMap(dims, seed, windowDensity)
  const material = new THREE.MeshStandardMaterial({
    color: '#27313f',
    metalness: 0.62,
    roughness: 0.3,
    emissive: new THREE.Color(accent),
    emissiveIntensity: 1.15,
    emissiveMap,
    envMapIntensity: 1.6,
  })
  material.userData.ownedTextures = [emissiveMap]
  return material
}

/** Dark PBR body for unlit structural pieces — reflective wet metal. */
export function makeDarkPbrMaterial(accent: string) {
  return new THREE.MeshStandardMaterial({
    color: '#1f2937',
    metalness: 0.58,
    roughness: 0.4,
    emissive: new THREE.Color(accent),
    emissiveIntensity: 0.04,
    envMapIntensity: 1.45,
  })
}
