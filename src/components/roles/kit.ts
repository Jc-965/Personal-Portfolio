/**
 * The diorama kit every role's island is built from: the floating island itself (a grass cap, a dirt band, and a
 * jagged rock cone hanging under it), the warm sun and sky light with its soft shadow, flat-shaded materials, and
 * small props (trees, rocks, clouds, lamps, paths). Islands are about ISLAND_RADIUS across with their grass at
 * y 0, so every scene frames the same way. Everything here is static geometry. Scenes animate their own parts.
 */
import * as THREE from 'three'

/** The island top's radius in world units, and how far the rock cone hangs below it. */
export const ISLAND_RADIUS = 2
export const ISLAND_DEPTH = 1.7

/** A small seeded generator returning floats in [0, 1), so an island is the same on every visit. */
export function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
export const ramp = (t: number, a: number, b: number) => clamp01((t - a) / Math.max(1e-9, b - a))
export const smoother = (t: number) => {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}
/** Eases `from` toward `to` with time constant `tc` seconds, landing on it once within 1e-4. */
export const ease = (from: number, to: number, dt: number, tc: number) => (Math.abs(to - from) < 1e-4 ? to : from + (to - from) * (1 - Math.exp(-dt / tc)))

/**
 * Flat-shaded, rough materials by colour, shared within one scene. The scene disposes them through `dispose`.
 */
export function materials() {
  const cache = new Map<string, THREE.MeshStandardMaterial>()
  return {
    get(color: THREE.ColorRepresentation, options: { emissive?: THREE.ColorRepresentation; emissiveIntensity?: number; roughness?: number; metalness?: number } = {}) {
      const key = `${new THREE.Color(color).getHexString()}|${options.emissive ? new THREE.Color(options.emissive).getHexString() : ''}|${options.emissiveIntensity ?? 0}|${options.roughness ?? 0.85}|${options.metalness ?? 0}`
      let material = cache.get(key)
      if (!material) {
        material = new THREE.MeshStandardMaterial({
          color,
          flatShading: true,
          roughness: options.roughness ?? 0.85,
          metalness: options.metalness ?? 0,
          emissive: options.emissive ?? '#000000',
          emissiveIntensity: options.emissiveIntensity ?? 0,
        })
        cache.set(key, material)
      }
      return material
    },
    dispose() {
      for (const material of cache.values()) material.dispose()
      cache.clear()
    },
  }
}
export type Materials = ReturnType<typeof materials>

/**
 * Blending for light a scene adds on top (sparks, glows, rays): the shader writes premultiplied colour, which is
 * added to the target, and the target's coverage is left alone. Additive blending that also wrote alpha would mark
 * those pixels as covered, so the journey's composite would hide its glyph room behind a glow's faint fringe.
 */
export const GLOW = {
  transparent: true,
  depthWrite: false,
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const

/** Moves every vertex of `geometry` by up to `amount` in each axis, seeded, and recomputes flat normals. */
function jitter(geometry: THREE.BufferGeometry, amount: number, random: () => number, keepTop = Infinity) {
  const position = geometry.getAttribute('position') as THREE.BufferAttribute
  // Coincident vertices move together, so the faceted surface stays closed.
  const moved = new Map<string, [number, number, number]>()
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const y = position.getY(i)
    const z = position.getZ(i)
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`
    let offset = moved.get(key)
    if (!offset) {
      offset = y >= keepTop ? [0, 0, 0] : [(random() - 0.5) * amount, (random() - 0.5) * amount, (random() - 0.5) * amount]
      moved.set(key, offset)
    }
    position.setXYZ(i, x + offset[0], y + offset[1], z + offset[2])
  }
  geometry.computeVertexNormals()
}

export interface IslandOptions {
  seed: number
  grass: THREE.ColorRepresentation
  dirt: THREE.ColorRepresentation
  rock: THREE.ColorRepresentation
  radius?: number
  depth?: number
}

/**
 * A floating island with its grass at y 0: a slightly irregular grass cap, a dirt band, a hanging cone of faceted
 * rock, and three small rocks floating under it. Returns the group and the geometries it owns.
 */
export function island(mats: Materials, o: IslandOptions) {
  const random = mulberry32(o.seed)
  const radius = o.radius ?? ISLAND_RADIUS
  const depth = o.depth ?? ISLAND_DEPTH
  const group = new THREE.Group()
  const geometries: THREE.BufferGeometry[] = []
  const add = (geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation) => {
    geometries.push(geometry)
    const mesh = new THREE.Mesh(geometry, mats.get(color))
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
    return mesh
  }
  // The rim wobbles a little around the circle, the same wobble for the cap and the band.
  const wobble = Array.from({ length: 28 }, () => 1 + (random() - 0.5) * 0.09)
  const shape = (geometry: THREE.CylinderGeometry, scale: number) => {
    const position = geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i)
      const z = position.getZ(i)
      const r = Math.hypot(x, z)
      if (r < 1e-4) continue
      const angle = Math.atan2(z, x)
      const k = Math.round(((angle + Math.PI) / (Math.PI * 2)) * 28) % 28
      position.setX(i, x * wobble[k] * scale)
      position.setZ(i, z * wobble[k] * scale)
    }
    geometry.computeVertexNormals()
    return geometry
  }
  const cap = add(shape(new THREE.CylinderGeometry(radius, radius * 0.98, 0.14, 28, 1), 1), o.grass)
  cap.position.y = -0.07
  const band = add(shape(new THREE.CylinderGeometry(radius * 0.98, radius * 0.9, 0.3, 28, 1), 1), o.dirt)
  band.position.y = -0.29
  const coneGeometry = new THREE.ConeGeometry(radius * 0.9, depth, 11, 4)
  coneGeometry.rotateX(Math.PI)
  jitter(coneGeometry, 0.32, random, depth / 2 - 0.01)
  const cone = add(coneGeometry, o.rock)
  cone.position.y = -0.44 - depth / 2
  for (let i = 0; i < 3; i++) {
    const size = 0.16 + random() * 0.18
    const pebble = new THREE.IcosahedronGeometry(size, 0)
    jitter(pebble, size * 0.4, random)
    const mesh = add(pebble, o.rock)
    const angle = random() * Math.PI * 2
    mesh.position.set(Math.cos(angle) * radius * (0.8 + random() * 0.4), -0.9 - random() * 1.1, Math.sin(angle) * radius * (0.8 + random() * 0.4))
  }
  return { group, geometries }
}

/**
 * The warm sun with a soft shadow over the island, a sky and ground fill, and a cool rim from behind. Returns the
 * lights so a scene can scale their intensity.
 */
export function sunlight(scene: THREE.Scene, o: { sun?: THREE.ColorRepresentation; sky?: THREE.ColorRepresentation; ground?: THREE.ColorRepresentation } = {}) {
  const sun = new THREE.DirectionalLight(o.sun ?? '#ffe3bd', 2.4)
  sun.position.set(3.2, 6, 2.6)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  const reach = ISLAND_RADIUS * 1.5
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: 16 })
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.02
  sun.shadow.radius = 4
  const fill = new THREE.HemisphereLight(o.sky ?? '#cfe6ff', o.ground ?? '#6b5b44', 1.1)
  const rim = new THREE.DirectionalLight('#b9d2ff', 0.8)
  rim.position.set(-3, 2.5, -4)
  scene.add(sun, sun.target, fill, rim)
  return [sun, fill, rim].map((light) => ({ light, base: light.intensity }))
}

/** Marks every mesh under `root` to cast and receive the sun's shadow. */
export function shadowed<T extends THREE.Object3D>(root: T): T {
  root.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) {
      object.castShadow = true
      object.receiveShadow = true
    }
  })
  return root
}

/**
 * Props built from shared geometries. Each call returns a group the caller places. `dispose` frees the geometries.
 */
export function props(mats: Materials, seed = 7) {
  const random = mulberry32(seed)
  const geometries: THREE.BufferGeometry[] = []
  const keep = <G extends THREE.BufferGeometry>(geometry: G) => {
    geometries.push(geometry)
    return geometry
  }
  const unitBox = keep(new THREE.BoxGeometry(1, 1, 1))
  const trunk = keep(new THREE.CylinderGeometry(0.035, 0.05, 0.28, 6))
  const crowns = [0, 1, 2].map((k) => keep(new THREE.ConeGeometry(0.2 - k * 0.04, 0.3, 7)))
  const bushGeometry = keep(new THREE.IcosahedronGeometry(0.14, 0))
  const rockGeometry = keep(new THREE.IcosahedronGeometry(0.12, 0))
  const cloudPuff = keep(new THREE.IcosahedronGeometry(0.3, 1))
  const post = keep(new THREE.CylinderGeometry(0.012, 0.016, 0.34, 6))
  const bulb = keep(new THREE.IcosahedronGeometry(0.035, 1))
  const mesh = (geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, options?: Parameters<Materials['get']>[1]) => {
    const m = new THREE.Mesh(geometry, mats.get(color, options))
    m.castShadow = true
    m.receiveShadow = true
    return m
  }
  return {
    /** A box of size w by h by d with its base at y 0. */
    box(w: number, h: number, d: number, color: THREE.ColorRepresentation, options?: Parameters<Materials['get']>[1]) {
      const m = mesh(unitBox, color, options)
      m.scale.set(w, h, d)
      m.position.y = h / 2
      const group = new THREE.Group()
      group.add(m)
      return group
    },
    /** A conifer about 0.6 tall. */
    tree(color: THREE.ColorRepresentation = '#3f8a4f', scale = 1) {
      const group = new THREE.Group()
      const t = mesh(trunk, '#7a5233')
      t.position.y = 0.14
      group.add(t)
      crowns.forEach((crown, k) => {
        const c = mesh(crown, color)
        c.position.y = 0.32 + k * 0.13
        c.rotation.y = random() * Math.PI
        group.add(c)
      })
      group.scale.setScalar(scale * (0.85 + random() * 0.3))
      return group
    },
    bush(color: THREE.ColorRepresentation = '#5aa05a') {
      const m = mesh(bushGeometry, color)
      m.position.y = 0.08
      m.scale.set(1 + random() * 0.4, 0.8, 1 + random() * 0.4)
      m.rotation.y = random() * Math.PI
      const group = new THREE.Group()
      group.add(m)
      return group
    },
    rock(color: THREE.ColorRepresentation = '#8c8478') {
      const m = mesh(rockGeometry, color)
      m.position.y = 0.05
      m.scale.set(1 + random() * 0.6, 0.6 + random() * 0.4, 1 + random() * 0.6)
      m.rotation.y = random() * Math.PI
      const group = new THREE.Group()
      group.add(m)
      return group
    },
    /** A soft cloud of four to six puffs. It casts no shadow. */
    cloud(color: THREE.ColorRepresentation = '#ffffff') {
      const group = new THREE.Group()
      const n = 4 + Math.floor(random() * 3)
      for (let i = 0; i < n; i++) {
        const puff = new THREE.Mesh(cloudPuff, mats.get(color, { roughness: 1 }))
        puff.position.set((i - n / 2) * 0.28 + random() * 0.1, random() * 0.12, (random() - 0.5) * 0.2)
        puff.scale.setScalar(0.7 + random() * 0.6)
        group.add(puff)
      }
      return group
    },
    /** A lamp post with a warm bulb. */
    lamp(glow: THREE.ColorRepresentation = '#ffd27a') {
      const group = new THREE.Group()
      const p = mesh(post, '#3d3a36')
      p.position.y = 0.17
      const b = new THREE.Mesh(bulb, mats.get(glow, { emissive: glow, emissiveIntensity: 2.2 }))
      b.position.y = 0.36
      group.add(p, b)
      return group
    },
    /** A flat path strip along `points` on the grass, `width` wide, lifted just above it. */
    path(points: THREE.Vector2[], width: number, color: THREE.ColorRepresentation) {
      const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p.x, 0.005, p.y)))
      const n = Math.max(8, points.length * 8)
      const positions: number[] = []
      const index: number[] = []
      const up = new THREE.Vector3(0, 1, 0)
      const side = new THREE.Vector3()
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const at = curve.getPoint(t)
        side.crossVectors(curve.getTangent(t), up).normalize().multiplyScalar(width / 2)
        positions.push(at.x - side.x, at.y, at.z - side.z, at.x + side.x, at.y, at.z + side.z)
        if (i < n) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
      }
      const geometry = keep(new THREE.BufferGeometry())
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      geometry.setIndex(index)
      geometry.computeVertexNormals()
      const m = new THREE.Mesh(geometry, mats.get(color))
      m.receiveShadow = true
      return m
    },
    random,
    dispose() {
      for (const geometry of geometries) geometry.dispose()
    },
  }
}
export type Props = ReturnType<typeof props>

/**
 * Places the camera on a sphere around `target` at `distance`, `yaw` radians around y from +z and `pitch` radians
 * above the horizon, then shifts the view so `target` lands at screen x `focusX` (0 left, 1 right) and screen y
 * `focusY` (0 bottom, 1 top) instead of the centre. The shift moves the frustum, not the camera, so perspective
 * is unchanged.
 */
export function frame(camera: THREE.PerspectiveCamera, target: THREE.Vector3, distance: number, yaw: number, pitch: number, aspect: number, focusX = 0.5, focusY = 0.5) {
  camera.aspect = aspect
  camera.position.set(
    target.x + Math.sin(yaw) * Math.cos(pitch) * distance,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(yaw) * Math.cos(pitch) * distance,
  )
  camera.lookAt(target)
  camera.updateProjectionMatrix()
  // A lens shift: the projection's x and y offsets, in clip units, move the target off centre.
  camera.projectionMatrix.elements[8] = -(focusX - 0.5) * 2
  camera.projectionMatrix.elements[9] = -(focusY - 0.5) * 2
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
  camera.updateMatrixWorld()
}
