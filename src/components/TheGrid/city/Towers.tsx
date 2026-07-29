import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from './rand'
import { isInCorridor } from './rail'
import { CITY_BOUNDS, BG_COLOR, STATIONS } from '../gridConfig'

/**
 * The procedural skyline: one InstancedMesh of unit boxes, windows and neon
 * edge glow painted per-fragment. No lights — the city is entirely emissive,
 * which is both the aesthetic and the perf budget (a single draw call for
 * every generic tower).
 */

// District hue centers along the avenue; towers blend toward the accent of
// whichever stations they sit near, so scrolling reads as a palette journey.
const DISTRICTS = STATIONS.map(s => ({ z: s.cam[2], color: new THREE.Color(s.accent) }))

const vertexShader = /* glsl */ `
  attribute vec3 aAccent;
  attribute float aSeed;
  attribute vec3 aDims;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vAccent;
  varying float vSeed;
  varying vec3 vDims;
  varying float vViewDist;

  void main() {
    vLocal = position;
    vNormal = normal;
    vAccent = aAccent;
    vSeed = aSeed;
    vDims = aDims;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vViewDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uBg;
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vAccent;
  varying float vSeed;
  varying vec3 vDims;
  varying float vViewDist;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7)) + vSeed * 17.0) * 43758.5453);
  }

  void main() {
    vec3 base = vec3(0.012, 0.02, 0.045);
    vec3 color = base;

    if (abs(vNormal.y) > 0.5) {
      // Roofs and setback undersides: lifted slightly above pure black with
      // an accent rim, so tiers read as architecture instead of floating slabs.
      float rim = smoothstep(0.42, 0.5, max(abs(vLocal.x), abs(vLocal.z)));
      color = base * 1.8 + vAccent * (rim * 0.35 + 0.04);
    } else {
      float u = (abs(vNormal.x) > 0.5 ? vLocal.z : vLocal.x) + 0.5;
      float v = vLocal.y + 0.5;
      float cols = max(2.0, floor((abs(vNormal.x) > 0.5 ? vDims.z : vDims.x) * 0.9));
      float rows = max(3.0, floor(vDims.y * 0.85));
      vec2 cell = vec2(floor(u * cols), floor(v * rows));
      vec2 inCell = fract(vec2(u * cols, v * rows));

      float lit = step(0.74, hash(cell));
      // A sparse handful of windows blink slowly — life, not strobe.
      float blinkKey = hash(cell + 31.0);
      float blink = blinkKey > 0.93
        ? 0.5 + 0.5 * sin(uTime * (0.6 + blinkKey) + blinkKey * 40.0)
        : 1.0;
      float window = step(0.24, inCell.x) * step(inCell.x, 0.76)
                   * step(0.3, inCell.y) * step(inCell.y, 0.7);
      float brightness = 0.4 + 0.4 * hash(cell + 7.0);
      color += vAccent * lit * window * blink * brightness;

      // Neon edge glow along vertical corners — measured along the face's
      // tangent axis only (the normal axis is constant 0.5 across the face
      // and would wash the whole wall in accent).
      float tangent = abs(vNormal.x) > 0.5 ? abs(vLocal.z) : abs(vLocal.x);
      float edge = smoothstep(0.44, 0.5, tangent);
      color += vAccent * edge * 0.35;

      // Ground-floor haze: streets bleed light up the first meters.
      color += vAccent * 0.08 * (1.0 - smoothstep(0.0, 0.35, v));
    }

    // Distance fade replaces scene fog (the star dome must stay un-fogged).
    float fade = smoothstep(70.0, 210.0, vViewDist);
    color = mix(color, uBg, fade);
    gl_FragColor = vec4(color, 1.0);
  }
`

function districtAccent(z: number, rng: () => number): THREE.Color {
  const color = new THREE.Color(0, 0, 0)
  let total = 0
  for (const d of DISTRICTS) {
    const dz = (z - d.z) / 30
    const w = Math.exp(-dz * dz)
    color.r += d.color.r * w
    color.g += d.color.g * w
    color.b += d.color.b * w
    total += w
  }
  if (total > 0) color.multiplyScalar(1 / total)
  // Desaturate a touch so signature structures out-glow the skyline.
  color.lerp(new THREE.Color('#3fd9e8'), 0.25 + rng() * 0.15)
  return color
}

export default function Towers({ density }: { density: number }) {
  const { mesh, material, beacons, beaconMaterial } = useMemo(() => {
    const rng = mulberry32(96543)
    const placements: Array<{ x: number; z: number; w: number; h: number; d: number; dim?: boolean }> = []
    const beaconSpots: Array<{ x: number; y: number; z: number }> = []
    const cell = 9

    for (let x = CITY_BOUNDS.minX; x <= CITY_BOUNDS.maxX; x += cell) {
      for (let z = CITY_BOUNDS.minZ; z <= CITY_BOUNDS.maxZ; z += cell) {
        const jx = x + (rng() - 0.5) * 5
        const jz = z + (rng() - 0.5) * 5
        if (rng() > density) continue
        const w = 3 + rng() * 3.5
        if (isInCorridor(jx, jz, w * 0.75)) continue
        const awayBoost = Math.min(Math.abs(jx) / 90, 1) * 10
        const h = 4 + Math.pow(rng(), 1.6) * 28 + awayBoost
        placements.push({ x: jx, z: jz, w, h, d: 3 + rng() * 3.5 })

        // Tall towers get setback tiers, antenna masts, and aviation beacons —
        // silhouette variety that sells the skyline as architecture.
        if (h > 20 && rng() > 0.45) {
          const tierW = w * (0.5 + rng() * 0.2)
          const tierH = 3 + rng() * 6
          placements.push({ x: jx, z: jz, w: tierW, h: h + tierH, d: tierW, dim: true })
          if (rng() > 0.4) {
            const mastH = 2.5 + rng() * 5
            placements.push({ x: jx, z: jz, w: 0.22, h: h + tierH + mastH, d: 0.22, dim: true })
            beaconSpots.push({ x: jx, y: h + tierH + mastH + 0.3, z: jz })
          }
        } else if (h > 26 && rng() > 0.5) {
          beaconSpots.push({ x: jx, y: h + 0.4, z: jz })
        }
      }
    }

    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const count = placements.length
    const accents = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    const dims = new Float32Array(count * 3)

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uBg: { value: new THREE.Color(BG_COLOR) },
      },
    })

    const mesh = new THREE.InstancedMesh(geometry, material, count)
    const matrix = new THREE.Matrix4()
    placements.forEach((p, i) => {
      matrix.makeScale(p.w, p.h, p.d)
      matrix.setPosition(p.x, p.h / 2, p.z)
      mesh.setMatrixAt(i, matrix)
      const accent = districtAccent(p.z, rng)
      // Tiers and masts glow dimmer than their parent body.
      if (p.dim) accent.multiplyScalar(0.55)
      accents.set([accent.r, accent.g, accent.b], i * 3)
      seeds[i] = rng() * 100
      dims.set([p.w, p.h, p.d], i * 3)
    })
    geometry.setAttribute('aAccent', new THREE.InstancedBufferAttribute(accents, 3))
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
    geometry.setAttribute('aDims', new THREE.InstancedBufferAttribute(dims, 3))
    mesh.instanceMatrix.needsUpdate = true
    mesh.frustumCulled = false

    // Aviation beacons: slow red blink on the tallest masts.
    const beaconGeometry = new THREE.BufferGeometry()
    const beaconPositions = new Float32Array(beaconSpots.length * 3)
    const beaconSeeds = new Float32Array(beaconSpots.length)
    beaconSpots.forEach((b, i) => {
      beaconPositions.set([b.x, b.y, b.z], i * 3)
      beaconSeeds[i] = rng() * 100
    })
    beaconGeometry.setAttribute('position', new THREE.BufferAttribute(beaconPositions, 3))
    beaconGeometry.setAttribute('aSeed', new THREE.BufferAttribute(beaconSeeds, 1))
    const beaconMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        varying float vBlink;
        void main() {
          vBlink = 0.15 + 0.85 * smoothstep(0.45, 0.55, fract(uTime * 0.4 + aSeed));
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = 3.2 * (420.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vBlink;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float disc = smoothstep(0.5, 0.1, d);
          gl_FragColor = vec4(vec3(1.0, 0.18, 0.14), disc * vBlink);
        }
      `,
      uniforms: { uTime: { value: 0 } },
    })
    const beacons = new THREE.Points(beaconGeometry, beaconMaterial)
    beacons.frustumCulled = false

    return { mesh, material, geometry, beacons, beaconMaterial }
  }, [density])

  useEffect(() => () => {
    mesh.geometry.dispose()
    material.dispose()
    beacons.geometry.dispose()
    beaconMaterial.dispose()
  }, [mesh, material, beacons, beaconMaterial])

  useFrame(state => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    beaconMaterial.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <group>
      <primitive object={mesh} />
      <primitive object={beacons} />
    </group>
  )
}
