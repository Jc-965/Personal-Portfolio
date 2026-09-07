import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from './rand'
import { isInCorridor } from './rail'
import { CITY_BOUNDS, STATIONS, STREET, WALL_EXCLUSIONS } from '../gridConfig'
import { SCENE_BG } from './sceneColor'
import { useSurfaceMaps } from './surfaceTextures'
import { wetLayerGLSL } from './wetLayer'

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
  varying vec3 vWorld;
  varying float vViewDist;

  void main() {
    vLocal = position;
    vNormal = normal;
    vAccent = aAccent;
    vSeed = aSeed;
    vDims = aDims;
    vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mv = viewMatrix * world;
    vViewDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uAlbedo;
  uniform sampler2D uDetailNormal;
  uniform sampler2D uRoughness;
  uniform float uHasMaps;
  uniform vec3 uBg;
  ${wetLayerGLSL}
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying vec3 vAccent;
  varying float vSeed;
  varying vec3 vDims;
  varying vec3 vWorld;
  varying float vViewDist;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7)) + vSeed * 17.0) * 43758.5453);
  }

  float hash2(vec2 p) {
    return fract(sin(dot(p, vec2(269.5, 183.3))) * 43758.5453);
  }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x),
      mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    vec3 n = vNormal;
    float alum = max(vAccent.r, max(vAccent.g, vAccent.b));
    // Silhouette gate: near-black pieces (roof plant) never light rooms.
    float litGate = smoothstep(0.05, 0.2, alum);

    // Per-building concrete albedo: blocks lean warm or cool so the street
    // wall isn't one material repeated forty times.
    float tintKey = fract(vSeed * 0.271);
    vec3 base = mix(vec3(0.016, 0.022, 0.038), vec3(0.034, 0.03, 0.026), tintKey * 0.8);

    vec3 color;
    if (abs(n.y) > 0.5) {
      // Roof: gravel-and-membrane mottle, parapet catching a sliver of sky.
      float g = vnoise(vWorld.xz * 1.4 + vSeed);
      color = base * (0.9 + 0.6 * g);
      float rim = smoothstep(0.42, 0.5, max(abs(vLocal.x), abs(vLocal.z)));
      color += vec3(0.02, 0.026, 0.04) * rim + vAccent * rim * 0.05;
    } else {
      bool xFace = abs(n.x) > 0.5;
      float u = (xFace ? vLocal.z : vLocal.x) + 0.5;
      float v = vLocal.y + 0.5;
      float faceW = xFace ? vDims.z : vDims.x;
      float faceH = vDims.y;
      // REAL architectural scale: ~3.1 m storeys, ~2.5 m window bays. This is
      // the single thing that separates "building" from "LED panel" — a 30 m
      // tower gets 9 floors, not 30.
      float cols = max(1.0, floor(faceW / 2.5));
      float rows = max(1.0, floor(faceH / 3.1));
      vec2 cellUv = vec2(u * cols, v * rows);
      vec2 cell = floor(cellUv);
      vec2 inCell = fract(cellUv);
      // One-pixel edges via derivatives, clamped away from zero (NaN guard).
      vec2 aa = max(fwidth(cellUv) * 0.75, vec2(1e-4));

      // ---------------- concrete wall ----------------
      // Orientation shading (one implied moon direction), cool sky ambient
      // strengthening upward, warm sodium streetlight bounce on the first
      // floors, two scales of mottle, sill grime, storey slab shadows, and
      // ambient occlusion tucked into the corners.
      float faceLight = xFace ? (n.x > 0.0 ? 0.9 : 1.0) : (n.z > 0.0 ? 1.14 : 0.78);
      vec3 wall = base * faceLight * (0.72 + 0.55 * v);
      wall *= 0.76 + 0.34 * vnoise(vec2(u * faceW, v * faceH) * 0.85 + vSeed);
      wall *= 0.82 + 0.18 * vnoise(vec2(u * faceW * 2.3 + vSeed, v * faceH * 0.13));
      // Metre-scaled scans, decorrelated per building and macro-modulated.
      vec2 detailUv = vec2(u * faceW, v * faceH) * 0.38
        + vec2(fract(vSeed * 0.73), fract(vSeed * 0.39)) * 13.0;
      float macro = wetNoise(vWorld.xz * 0.11 + vSeed);
      vec3 scan = texture2D(uAlbedo, detailUv).rgb;
      vec3 tangentNormal = texture2D(uDetailNormal, detailUv).xyz * 2.0 - 1.0;
      vec3 detailN = normalize(n + (xFace ? vec3(0., tangentNormal.y, tangentNormal.x)
        : vec3(tangentNormal.x, tangentNormal.y, 0.)) * 0.48 * uHasMaps);
      float water = surfaceWetness(vWorld);
      detailN = normalize(detailN + vec3(wetRipple(vWorld.xz * 0.9, uTime), 0.) * water * 0.06);
      float materialRoughness = mix(0.86, texture2D(uRoughness, detailUv).g, uHasMaps);
      materialRoughness = mix(materialRoughness, 0.12, water);
      wall *= mix(vec3(1.), vec3(0.55) + scan * 1.8, uHasMaps) * (0.82 + 0.3 * macro);
      wall *= (0.75 + 0.35 * max(0., dot(detailN, normalize(vec3(-0.4,0.8,0.25))))) * (1.0-water*0.38);
      vec3 halfDirection = normalize(normalize(cameraPosition-vWorld) + normalize(vec3(-0.4,0.8,0.25)));
      float sheen = pow(max(0.,dot(detailN,halfDirection)),mix(7.,80.,1.-materialRoughness));
      wall += (vec3(0.045,0.065,0.1) + vAccent*0.08) * sheen * (1.-materialRoughness);
      float metres = v * faceH;
      wall *= 0.7 + 0.3 * smoothstep(0.0, 2.6, metres);
      wall += vec3(0.05, 0.03, 0.011) * (1.0 - smoothstep(0.0, 7.0, metres)) * 0.55;
      wall += vAccent * 0.03 * (1.0 - smoothstep(0.0, 0.25, v));
      float slabDist = min(inCell.y, 1.0 - inCell.y);
      wall *= 1.0 - 0.28 * (1.0 - smoothstep(0.02, 0.08, slabDist));
      wall *= 1.0 - 0.16 * (1.0 - smoothstep(0.0, 0.4, inCell.y));
      // Corner AO instead of neon corner glow.
      float tangent = xFace ? abs(vLocal.z) : abs(vLocal.x);
      wall *= 1.0 - 0.35 * smoothstep(0.42, 0.5, tangent);

      // ---------------- window cut by archetype ----------------
      float pattern = fract(vSeed * 0.617);
      vec2 wMin; vec2 wMax; float litChance;
      if (pattern < 0.55) { wMin = vec2(0.2, 0.24); wMax = vec2(0.8, 0.78); litChance = 0.24; }
      else if (pattern < 0.8) { wMin = vec2(0.06, 0.3); wMax = vec2(0.94, 0.85); litChance = 0.17; }
      else { wMin = vec2(0.03, 0.05); wMax = vec2(0.97, 0.95); litChance = 0.12; }

      float wnd =
          (smoothstep(wMin.x - aa.x, wMin.x + aa.x, inCell.x) - smoothstep(wMax.x - aa.x, wMax.x + aa.x, inCell.x))
        * (smoothstep(wMin.y - aa.y, wMin.y + aa.y, inCell.y) - smoothstep(wMax.y - aa.y, wMax.y + aa.y, inCell.y));

      // ---------------- dark glass: night-sky reflection ----------------
      vec3 rd = normalize(vWorld - cameraPosition);
      vec3 rv = reflect(rd, n);
      float horizon = 1.0 - clamp(rv.y, 0.0, 1.0);
      // City glow swells toward the horizon in the reflection.
      vec3 skyRef = mix(vec3(0.045, 0.08, 0.15), uBg * 5.0 + vec3(0.12, 0.07, 0.11), pow(horizon, 2.4));
      float fresnel = pow(1.0 - clamp(dot(-rd, n), 0.0, 1.0), 3.0);
      // Recessed reveals: panes darken toward their jambs — the fake inset
      // that makes flat geometry read as punched openings.
      vec2 wSize = max(wMax - wMin, vec2(1e-3));
      vec2 wUv = clamp((inCell - wMin) / wSize, 0.0, 1.0);
      float rimDist = min(min(wUv.x, 1.0 - wUv.x), min(wUv.y, 1.0 - wUv.y));
      float reveal = 0.5 + 0.5 * smoothstep(0.0, 0.14, rimDist);
      vec3 glass = (skyRef * (0.16 + 0.6 * fresnel) + vec3(0.012, 0.02, 0.034)) * reveal;
      // Mullions: a centre stile on every pane; curtain glass adds a transom.
      float mull = 1.0 - smoothstep(0.015, 0.045, abs(wUv.x - 0.5));
      if (pattern >= 0.8) {
        mull = max(mull, 1.0 - smoothstep(0.015, 0.045, abs(wUv.y - 0.68)));
      }

      // ---------------- lit rooms: interior mapping ----------------
      // A real box room behind every lit pane — back wall, ceiling with a
      // hot light panel, floor, side walls — so windows parallax like rooms
      // instead of glowing like stickers. Heavily skewed brightness: most
      // rooms burn low, a few blaze.
      float lit = step(1.0 - litChance, hash(cell));
      float rdN = xFace ? -rd.x * sign(n.x) : -rd.z * sign(n.z);
      float roomOn = lit * litGate * (0.25 + 0.75 * smoothstep(0.04, 0.3, rdN));
      float lodBlend = smoothstep(45.0, 110.0, vViewDist);

      vec3 windowCol = glass;
      // Whole block skipped for unlit panes and pure-glow distances — the
      // interior raycast only runs where its parallax is actually visible.
      if (roomOn > 0.004) {
        float blinkKey = hash(cell + 31.0);
        float blink = blinkKey > 0.96
          ? 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * (1.5 + blinkKey * 3.0)))
          : 1.0;
        float palKey = hash(cell + 53.0);
        vec3 roomCol = palKey < 0.55 ? vec3(1.0, 0.8, 0.55)
                     : palKey < 0.8  ? vec3(0.82, 0.9, 1.02)
                     : palKey < 0.92 ? vec3(1.0, 0.6, 0.38)
                     : vec3(0.5, 0.72, 1.25) * (0.7 + 0.5 * sin(uTime * 9.0 + palKey * 90.0));
        roomCol *= 0.4 + 1.0 * pow(hash(cell + 7.0), 2.0);

        vec3 interior = roomCol * 0.4;
        if (rdN > 0.02 && lodBlend < 0.998) {
          float rdU = xFace ? rd.z : rd.x;
          vec3 d = vec3(rdU, rd.y, rdN);
          d.x /= max(wSize.x * faceW / cols, 0.5);
          d.y /= max(wSize.y * faceH / rows, 0.5);
          d.z /= 3.4; // room depth, metres
          vec3 p0 = vec3(wUv, 0.0);
          float tz = 1.0 / d.z;
          float dx = abs(d.x) > 1e-4 ? d.x : 1e-4;
          float dy = abs(d.y) > 1e-4 ? d.y : 1e-4;
          float tx = (step(0.0, dx) - p0.x) / dx;
          float ty = (step(0.0, dy) - p0.y) / dy;
          float t = min(tz, min(tx, ty));
          vec3 hpos = p0 + d * t;
          float depthFade = 1.0 - 0.4 * clamp(hpos.z, 0.0, 1.0);
          if (t >= tz - 1e-4) {
            // Back wall, darker furniture band along its base.
            interior = roomCol * (0.5 + 0.25 * hpos.y) * depthFade;
            interior *= 0.55 + 0.45 * smoothstep(0.1, 0.4, hpos.y);
          } else if (t >= ty - 1e-4) {
            if (d.y > 0.0) {
              // Ceiling with a hot light panel mid-room.
              interior = roomCol * (1.1 - 0.4 * clamp(hpos.z, 0.0, 1.0));
              interior += roomCol * (1.0 - smoothstep(0.06, 0.3, abs(hpos.z - 0.45)));
            } else {
              interior = roomCol * 0.32 * depthFade;
            }
          } else {
            interior = roomCol * (0.6 - 0.2 * clamp(hpos.z, 0.0, 1.0));
          }
        }
        // Some tenants pulled the blinds partway.
        float blindKey = hash(cell + 71.0);
        float blindFrac = blindKey < 0.3 ? blindKey * 2.0 : 0.0;
        float blind = step(1.0 - blindFrac, wUv.y);
        interior = mix(interior, roomCol * 0.26 * (0.85 + 0.15 * sin(wUv.y * 80.0)), blind);
        interior *= reveal;

        vec3 flatGlow = roomCol * 0.42;
        windowCol = mix(glass, mix(interior, flatGlow, lodBlend) * 0.85 * blink, roomOn);
      }
      // Mullion bars cut dark across glass and rooms alike.
      windowCol *= 1.0 - 0.85 * mull;

      color = mix(wall, windowCol, wnd);

      // Street-level storefronts: broken band of shopfront light filling the
      // ground floor between the neon signs.
      float shopBand = (1.0 - smoothstep(2.4, 3.1, metres)) * smoothstep(0.5, 1.0, metres);
      vec2 shopCell = vec2(floor(u * max(1.0, floor(faceW / 5.0))), 51.0);
      float shopSeg = step(0.3, hash(shopCell));
      vec3 shopColor = mix(vec3(1.0, 0.72, 0.45), vec3(1.0, 0.45, 0.68), step(0.75, hash(shopCell + 36.0)));
      color += shopColor * shopBand * shopSeg * litGate * 0.5 * clamp(1.3 - vViewDist / 80.0, 0.0, 1.0);
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
  const surface = useSurfaceMaps('facade')
  const { mesh, material, beacons, beaconMaterial } = useMemo(() => {
    const rng = mulberry32(96543)
    // `y0` lifts a box off the ground (roof plant, skybridges); `dark` mutes
    // its glow to silhouette level; `seed` fixes the facade archetype so the
    // TS side can match geometry (balconies) to the shader's pattern choice.
    const placements: Array<{ x: number; z: number; w: number; h: number; d: number; y0?: number; dim?: boolean; dark?: boolean; seed?: number }> = []
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
        const seed = rng() * 100
        placements.push({ x: xc, z: zc, w: width, h, d: depth, seed })
        if (h <= 20) addRoofPlant(xc, zc, width, h)
        else if (rng() > 0.55) beaconSpots.push({ x: xc, y: h + 0.4, z: zc })

        // Punched-window blocks (the shader's residential archetype) grow
        // real balcony slabs at every storey line — silhouette depth no
        // facade shader can fake.
        const pattern = (seed * 0.617) % 1
        if (pattern < 0.55 && h >= 12 && rng() < 0.6) {
          const floors = Math.floor(h / 3.1)
          for (let f = 1; f < floors; f++) {
            placements.push({
              x: side * (front - 0.42),
              z: zc,
              w: 0.95,
              h: 0.14,
              d: depth * 0.82,
              y0: f * 3.1 - 0.14,
              dark: true,
            })
          }
        }

        // Bolt-on AC units breaking up the street face — the small physical
        // clutter that makes a flat wall read as a lived-in building.
        const units = Math.floor(rng() * 4)
        for (let k = 0; k < units; k++) {
          placements.push({
            x: side * (front - 0.18),
            z: zc + (rng() - 0.5) * (depth - 1.5),
            w: 0.5,
            h: 0.55,
            d: 0.75,
            y0: 2.5 + rng() * Math.max(2, h - 4),
            dark: true,
          })
        }
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
        uAlbedo: { value: null },
        uDetailNormal: { value: null },
        uRoughness: { value: null },
        uHasMaps: { value: 0 },
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
      seeds[i] = p.seed ?? rng() * 100
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
          gl_PointSize = mv.z < -0.1 ? clamp(3.2 * (420.0 / max(-mv.z, 0.1)), 1.0, 32.0) : 0.0;
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

  useEffect(() => {
    material.uniforms.uAlbedo.value = surface?.albedo ?? null
    material.uniforms.uDetailNormal.value = surface?.normal ?? null
    material.uniforms.uRoughness.value = surface?.roughness ?? null
    material.uniforms.uHasMaps.value = surface ? 1 : 0
  }, [material, surface])

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
