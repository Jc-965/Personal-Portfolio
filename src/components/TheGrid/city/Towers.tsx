import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from './rand'
import { isInCorridor } from './rail'
import { CITY_BOUNDS, STATIONS, STREET, WALL_EXCLUSIONS } from '../gridConfig'
import { SCENE_BG } from './sceneColor'

/**
 * The procedural city: one InstancedMesh of unit boxes, windows and glow
 * painted per-fragment. The first row is CONTIGUOUS street walls — mid-rise
 * blocks shoulder to shoulder along both sidewalks, so the avenue reads as a
 * canyon (the reference night-street framing), with taller rows and a
 * megatower ring layered behind, all dissolving into fog.
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

    // Per-building albedo drift: concrete blocks lean warm or cool, so the
    // street wall isn't one material repeated forty times.
    float tintKey = fract(vSeed * 0.271);
    base = mix(base, vec3(0.03, 0.027, 0.024), tintKey * 0.55);
    color = base;

    if (abs(vNormal.y) > 0.5) {
      // Roofs and setback undersides: lifted slightly above pure black with
      // an accent rim, so tiers read as architecture instead of floating slabs.
      float rim = smoothstep(0.42, 0.5, max(abs(vLocal.x), abs(vLocal.z)));
      color = base * 2.4 + vAccent * (rim * 0.4 + 0.07);
    } else {
      float u = (abs(vNormal.x) > 0.5 ? vLocal.z : vLocal.x) + 0.5;
      float v = vLocal.y + 0.5;
      float cols = max(3.0, floor((abs(vNormal.x) > 0.5 ? vDims.z : vDims.x) * 1.25));
      float rows = max(4.0, floor(vDims.y * 1.05));
      vec2 cell = vec2(floor(u * cols), floor(v * rows));
      vec2 inCell = fract(vec2(u * cols, v * rows));
      // One-pixel window edges via screen-space derivatives: crisp up close,
      // calm (not shimmering) in the distance. Clamped away from zero so the
      // smoothstep edges can never collapse into NaN territory.
      vec2 aa = max(fwidth(vec2(u * cols, v * rows)) * 0.75, vec2(1e-4));

      // Three facade languages, chosen per building, so the skyline doesn't
      // wear one speckle texture at every scale.
      float pattern = fract(vSeed * 0.617);
      float glow = 0.0;
      // Cool accent glass by default; a fraction of tenants burn warm
      // interior light — the mixed color temperature of a real night city.
      vec3 winColor = vAccent;
      float alum = max(vAccent.r, max(vAccent.g, vAccent.b));
      if (pattern < 0.55) {
        // Punched windows.
        float lit = step(0.74, hash(cell));
        float blinkKey = hash(cell + 31.0);
        float blink = blinkKey > 0.93
          ? 0.5 + 0.5 * sin(uTime * (0.6 + blinkKey) + blinkKey * 40.0)
          : 1.0;
        float window =
            (smoothstep(0.24 - aa.x, 0.24 + aa.x, inCell.x) - smoothstep(0.76 - aa.x, 0.76 + aa.x, inCell.x))
          * (smoothstep(0.3 - aa.y, 0.3 + aa.y, inCell.y) - smoothstep(0.7 - aa.y, 0.7 + aa.y, inCell.y));
        // Interior light falls from the ceiling: windows glow brighter at
        // their top edge — the cheap cue that there's a ROOM behind the glass.
        float inset = 0.65 + 0.7 * clamp((inCell.y - 0.3) / 0.4, 0.0, 1.0);
        glow = lit * window * blink * inset * (0.4 + 0.4 * hash(cell + 7.0));
        float warm = step(0.68, hash(cell + 53.0));
        winColor = mix(vAccent, vec3(1.0, 0.72, 0.42) * alum, warm * 0.85);
      } else if (pattern < 0.8) {
        // Vertical light strips (curtain mullions).
        float stripOn = step(0.72, hash(vec2(cell.x, 3.0)));
        float strip = smoothstep(0.4 - aa.x, 0.4 + aa.x, inCell.x)
                    - smoothstep(0.6 - aa.x, 0.6 + aa.x, inCell.x);
        glow = stripOn * strip * 0.5 * (0.7 + 0.3 * sin(uTime * 0.3 + cell.x));
      } else {
        // Horizontal illuminated floor bands.
        float bandOn = step(0.7, hash(vec2(cell.y, 9.0)));
        float band = smoothstep(0.2 - aa.y, 0.2 + aa.y, inCell.y)
                   - smoothstep(0.5 - aa.y, 0.5 + aa.y, inCell.y);
        glow = bandOn * band * 0.4;
      }
      // Distant windows soften instead of shimmering at subpixel size.
      glow *= clamp(1.5 - vViewDist / 90.0, 0.3, 1.0);
      color += winColor * glow;

      // Street-level storefronts: a broken band of bright shopfront light in
      // the first metres, so blocks read inhabited between the neon signs.
      float metres = v * vDims.y;
      float shopBand = (1.0 - smoothstep(2.2, 2.9, metres)) * smoothstep(0.35, 0.8, metres);
      vec2 shopCell = vec2(floor(u * cols * 0.5), 51.0);
      float shopSeg = step(0.35, hash(shopCell));
      vec3 shopColor = mix(winColor, vec3(1.0, 0.5, 0.75), step(0.75, hash(shopCell + 36.0)));
      // Gated by accent luminance so silhouette pieces (roof plant) stay dark.
      float shopGate = smoothstep(0.08, 0.22, alum);
      color += shopColor * shopBand * shopSeg * shopGate * 0.55 * clamp(1.3 - vViewDist / 80.0, 0.0, 1.0);

      // Neon edge glow along vertical corners — measured along the face's
      // tangent axis only (the normal axis is constant 0.5 across the face
      // and would wash the whole wall in accent).
      // Floor slabs: a thin dark shadow line at every storey boundary reads
      // as real construction instead of a glowing texture.
      float slabDist = min(inCell.y, 1.0 - inCell.y);
      float slab = 1.0 - 0.4 * (1.0 - smoothstep(0.015, 0.07, slabDist));
      color *= slab;

      float tangent = abs(vNormal.x) > 0.5 ? abs(vLocal.z) : abs(vLocal.x);
      float edge = smoothstep(0.44, 0.5, tangent);
      color += vAccent * edge * 0.12;

      // Ground-floor haze: streets bleed light up the first meters.
      color += vAccent * 0.08 * (1.0 - smoothstep(0.0, 0.35, v));
    }

    // Distance fade replaces scene fog (the star dome must stay un-fogged);
    // the near dissolve keeps grazing walls from smearing across the lens.
    float fade = smoothstep(70.0, 210.0, vViewDist);
    color = mix(color, uBg, fade);
    color = mix(uBg, color, smoothstep(2.5, 12.0, vViewDist));
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
    // `y0` lifts a box off the ground (roof plant, skybridges); `dark` mutes
    // its glow to silhouette level.
    const placements: Array<{ x: number; z: number; w: number; h: number; d: number; y0?: number; dim?: boolean; dark?: boolean }> = []
    const beaconSpots: Array<{ x: number; y: number; z: number }> = []

    // Overlap test against the block's full z-extent — a block whose CENTER
    // clears an exclusion can still poke its shoulder into the sightline.
    const excluded = (side: number, zMin: number, zMax: number) =>
      WALL_EXCLUSIONS.some(rect => rect.side === side && zMax > rect.zMin && zMin < rect.zMax)

    const addRoofPlant = (x: number, z: number, w: number, h: number) => {
      if (rng() > 0.5) return
      const gw = 0.9 + rng() * 1.1
      placements.push({
        x: x + (rng() - 0.5) * w * 0.5,
        z: z + (rng() - 0.5) * 2.5,
        w: gw,
        h: 0.9 + rng() * 1.2,
        d: gw,
        y0: h,
        dark: true,
      })
    }

    // Row 1 — the street walls. Contiguous mid-rise blocks shoulder to
    // shoulder along both sidewalks (an occasional alley slot), fronts
    // jittered a lane's width so the canyon face isn't a flat plane.
    for (const side of [1, -1]) {
      let z = STREET.zStart + 4
      while (z > STREET.zEnd) {
        const depth = 9 + rng() * 7
        const zc = z - depth / 2
        z -= depth + (rng() < 0.12 ? 2.5 + rng() * 2.5 : 0.2)
        if (excluded(side, zc - depth / 2, zc + depth / 2)) continue
        const width = 7 + rng() * 8
        const front = STREET.wallX + rng() * 1.6
        const xc = side * (front + width / 2)
        const h = 10 + Math.pow(rng(), 1.7) * 24
        placements.push({ x: xc, z: zc, w: width, h, d: depth })
        if (h <= 20) addRoofPlant(xc, zc, width, h)
        else if (rng() > 0.55) beaconSpots.push({ x: xc, y: h + 0.4, z: zc })
      }
    }

    // Row 2 — taller blocks looming behind the street walls.
    for (const side of [1, -1]) {
      for (let z = STREET.zStart; z > STREET.zEnd - 10; z -= 13) {
        if (rng() > density + 0.18) continue
        const xc = side * (30 + rng() * 16)
        const zc = z + (rng() - 0.5) * 6
        const w = 8 + rng() * 8
        const h = 16 + Math.pow(rng(), 1.4) * 28
        placements.push({ x: xc, z: zc, w, h, d: 8 + rng() * 8 })
        if (h > 30 && rng() > 0.45) {
          const tierW = w * (0.5 + rng() * 0.2)
          const tierH = 3 + rng() * 6
          placements.push({ x: xc, z: zc, w: tierW, h: h + tierH, d: tierW, dim: true })
          if (rng() > 0.4) {
            const mastH = 2.5 + rng() * 5
            placements.push({ x: xc, z: zc, w: 0.22, h: h + tierH + mastH, d: 0.22, dim: true })
            beaconSpots.push({ x: xc, y: h + tierH + mastH + 0.3, z: zc })
          }
        }
      }
    }

    // Row 3 — loose scatter filling the districts beyond, corridor-guarded.
    for (let x = CITY_BOUNDS.minX; x <= CITY_BOUNDS.maxX; x += 11) {
      for (let z = CITY_BOUNDS.minZ; z <= CITY_BOUNDS.maxZ; z += 11) {
        if (Math.abs(x) < 46) continue
        const jx = x + (rng() - 0.5) * 6
        const jz = z + (rng() - 0.5) * 6
        if (rng() > density) continue
        const w = 4 + rng() * 4
        if (isInCorridor(jx, jz, w * 0.75)) continue
        const h = 6 + Math.pow(rng(), 1.5) * 30
        placements.push({ x: jx, z: jz, w, h, d: 4 + rng() * 4 })
        if (h > 28 && rng() > 0.55) beaconSpots.push({ x: jx, y: h + 0.4, z: jz })
      }
    }

    // Megatower ring: the deepest silhouette layer, half-swallowed by fog.
    for (let i = 0; i < 14; i++) {
      const side = i % 2 === 0 ? 1 : -1
      const mx = side * (66 + rng() * 24)
      const mz = 50 - rng() * 280
      const mw = 8 + rng() * 7
      const mh = 46 + rng() * 34
      placements.push({ x: mx, z: mz, w: mw, h: mh, d: 8 + rng() * 7 })
      if (rng() > 0.35) beaconSpots.push({ x: mx, y: mh + 0.5, z: mz })
    }

    // High skywalks crossing the canyon — well above the marquees and far
    // above the street-level camera (rail y ≤ 5 until the final climb).
    const bridges = [
      { x: 0, z: -58, w: 27, d: 2.0, h: 1.7, y0: 17 },
      { x: 0, z: -108, w: 27, d: 1.8, h: 1.6, y0: 19 },
      { x: 0, z: -136, w: 27, d: 1.8, h: 1.6, y0: 22 },
      { x: 0, z: -168, w: 27, d: 1.6, h: 1.5, y0: 16 },
      { x: -28, z: -64, w: 18, d: 1.7, h: 1.6, y0: 19 },
      { x: 30, z: -96, w: 14, d: 1.5, h: 1.4, y0: 22 },
    ]
    for (const b of bridges) placements.push(b)

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
        uBg: { value: SCENE_BG },
      },
    })

    const mesh = new THREE.InstancedMesh(geometry, material, count)
    const matrix = new THREE.Matrix4()
    placements.forEach((p, i) => {
      matrix.makeScale(p.w, p.h, p.d)
      matrix.setPosition(p.x, (p.y0 ?? 0) + p.h / 2, p.z)
      mesh.setMatrixAt(i, matrix)
      const accent = districtAccent(p.z, rng)
      // Tiers and masts glow dimmer than their parent body; roof plant is
      // near-black silhouette.
      if (p.dim) accent.multiplyScalar(0.55)
      if (p.dark) accent.multiplyScalar(0.18)
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
          float disc = 1.0 - smoothstep(0.1, 0.5, d);
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
