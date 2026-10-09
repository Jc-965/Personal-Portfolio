/**
 * The phone as a three.js product model. Geometry is in phone-local three.js
 * units, where local +z is the screen side (see threeMap.ts), and every size
 * comes from PHONE and CODE in rig.ts, so the render and the projected
 * callouts agree. This module owns the meshes, their materials, how a pose
 * moves them, and their disposal. Plane textures and develop values belong to
 * TeardownCanvas, which knows when each texture has loaded.
 */
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import type { TeardownStory } from '../../content/teardown/types'
import { createCodeMaterial, createScreenMaterial, glslFloat } from './materials'
import { CODE, PHONE, type PlanePose, type Pose, type Vec3 } from './rig'
import { toThreeMatrix } from './threeMap'

export type PlaneMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>

export interface Product {
  group: THREE.Group
  /** Frame, back plate, camera bump, and buttons. Carries the phone transform. */
  body: THREE.Group
  /** Board, chips, battery, and coil, a child of `body`. Hidden while the stack is assembled. */
  internals: THREE.Group
  glass: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshPhysicalMaterial>
  screen: PlaneMesh
  code: PlaneMesh
  cards: PlaneMesh[]
  /** Moves every part to the pose and sets the glass's light. Plane uniforms are left to the caller. */
  update(pose: Pose): void
  /** Switches the glass between its wide and narrow tuning without a shader recompile. */
  setNarrow(narrow: boolean): void
  dispose(): void
}

/**
 * Environment reflection strength per surface. RoomEnvironment's brightest
 * panel sits behind the camera, so surfaces that face the camera inside the
 * open tray (the back plate and the internals) reflect it as a flat grey wash
 * unless they reflect much less than the frame, which sees it only at grazing angles.
 */
const ENV = { frame: 1, interior: 0.3, battery: 0.5, coil: 0.9 } as const
/** Frame and front lip bevel, world units. */
const BEVEL = 0.012
/** Inset of the frame's front and back lip from the outer silhouette. The lip edge sits between the screen and the glass edge. */
const LIP = 0.022
const GLASS_HALF = { x: PHONE.sx + 0.012, y: PHONE.sy + 0.012, radius: PHONE.sRadius + 0.01, depth: 0.006, bevel: 0.0015 }
/**
 * Glass tuning. At `env` 1.2 a clear sheet reflects RoomEnvironment as a veil
 * that lifts the dark screens beneath it and turns the exploded glass milky,
 * so the glass reflects at `env * GLASS_ENV`. The rim and the sweeping band
 * carry the glass's outline instead. Opacity applies only as the stack comes apart.
 */
const GLASS = { wide: { env: 1.2, roughness: 0.04, opacity: 0.1 }, narrow: { env: 1.6, roughness: 0.05, opacity: 0.16 } } as const
const GLASS_ENV = 0.05
/** Glass light while assembled, from rig.ts. Below it the glass fades out with the arrival. */
const ASSEMBLED_LIGHT = 0.35

/** Rounded rectangle centred on the origin. Both shapes and holes use this counter-clockwise path, which ExtrudeGeometry expects. */
function roundedRect<T extends THREE.Path>(path: T, hx: number, hy: number, r: number): T {
  path.moveTo(-hx + r, -hy)
  path.lineTo(hx - r, -hy)
  path.absarc(hx - r, -hy + r, r, -Math.PI / 2, 0, false)
  path.lineTo(hx, hy - r)
  path.absarc(hx - r, hy - r, r, 0, Math.PI / 2, false)
  path.lineTo(-hx + r, hy)
  path.absarc(-hx + r, hy - r, r, Math.PI / 2, Math.PI, false)
  path.lineTo(-hx, -hy + r)
  path.absarc(-hx + r, -hy + r, r, Math.PI, Math.PI * 1.5, false)
  return path
}

/**
 * Extruded rounded slab centred on z = 0 whose outer silhouette, bevel
 * included, has exactly the given half-extents and total depth. A hole has
 * its given half-extents only at the two cap faces. ExtrudeGeometry bevels a
 * hole inward, so its walls stand `bevel` inside those extents.
 */
function slab(hx: number, hy: number, r: number, depth: number, bevel: number, segments = 32, hole?: { hx: number; hy: number; r: number }): THREE.ExtrudeGeometry {
  const shape = roundedRect(new THREE.Shape(), hx - bevel, hy - bevel, Math.max(0.001, r - bevel))
  if (hole) shape.holes.push(roundedRect(new THREE.Path(), hole.hx, hole.hy, hole.r))
  const core = depth - 2 * bevel
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: core,
    curveSegments: segments,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: bevel > 0 ? 5 : 0,
  })
  geometry.translate(0, 0, -core / 2)
  return geometry
}

export function createProduct(story: TeardownStory, opts: { narrow: boolean; environment: THREE.Texture | null }): Product {
  const geometries: THREE.BufferGeometry[] = []
  const materials: THREE.Material[] = []
  const keep = <G extends THREE.BufferGeometry>(g: G) => { geometries.push(g); return g }
  const own = <M extends THREE.Material>(m: M) => { materials.push(m); return m }
  const envMap = opts.environment
  // A blank texture keeps the plane samplers complete until TeardownCanvas assigns the real maps.
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1)
  blank.needsUpdate = true

  // Materials set envMap themselves: with only scene.environment, three replaces every envMapIntensity with the scene's.
  const lit = (envMapIntensity: number) => ({ envMap, envMapIntensity })
  const frameMat = own(new THREE.MeshPhysicalMaterial({ color: '#2b2d31', metalness: 0.9, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25, ...lit(ENV.frame) }))
  const backMat = own(new THREE.MeshStandardMaterial({ color: '#1c1d20', metalness: 0.6, roughness: 0.45, ...lit(ENV.interior) }))
  const lensMat = own(new THREE.MeshPhysicalMaterial({ color: '#06070a', roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, ...lit(ENV.frame) }))
  const boardMat = own(new THREE.MeshStandardMaterial({ color: '#0f1513', roughness: 0.65, ...lit(ENV.interior) }))
  const chipMat = own(new THREE.MeshStandardMaterial({ color: '#0b0b0d', roughness: 0.35, ...lit(ENV.interior) }))
  const batteryMat = own(new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.75, roughness: 0.42, ...lit(ENV.battery) }))
  const coilMat = own(new THREE.MeshStandardMaterial({ color: '#b87333', metalness: 1, roughness: 0.28, ...lit(ENV.coil) }))

  const group = new THREE.Group()
  const body = new THREE.Group()
  const internals = new THREE.Group()
  body.matrixAutoUpdate = false
  body.add(internals)
  group.add(body)
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(keep(geometry), material)
    m.position.set(x, y, z)
    parent.add(m)
    return m
  }

  // Side frame: an open ring whose lips stop LIP inside the silhouette, and the glass rests on the front lip.
  // The hole's bevel narrows the opening to 0.327 by 0.722 half-extents at the screen's depth (local z 0.038),
  // so the frame covers the screen's outer 0.008 by 0.006 as a thin bezel.
  const lip = { hx: PHONE.hx - LIP, hy: PHONE.hy - LIP, r: PHONE.radius - LIP }
  mesh(slab(PHONE.hx, PHONE.hy, PHONE.radius, 2 * PHONE.hz, BEVEL, 32, lip), frameMat, body)
  // The back plate's outer face stops 0.0015 short of the frame's back lip, so the two never share a depth.
  mesh(slab(PHONE.hx - 0.004, PHONE.hy - 0.004, PHONE.radius - 0.004, 0.008, 0), backMat, body, 0, 0, -PHONE.hz + 0.0055)

  // Camera bump on the back (local -z), 0.03 proud of the back plate and sunk 0.01 into it.
  const bump = new THREE.Group()
  bump.position.set(-0.17, 0.53, -PHONE.hz - 0.01)
  body.add(bump)
  mesh(slab(0.13, 0.13, 0.05, 0.04, 0.005, 16), frameMat, bump)
  const ringGeometry = keep(new THREE.TorusGeometry(0.042, 0.007, 12, 48))
  const lensGeometry = keep(new THREE.CylinderGeometry(0.036, 0.036, 0.006, 40).rotateX(Math.PI / 2))
  for (const [x, y] of [[-0.05, 0.05], [-0.05, -0.05], [0.05, 0]]) {
    const ring = new THREE.Mesh(ringGeometry, frameMat)
    ring.position.set(x, y, -0.021)
    const lens = new THREE.Mesh(lensGeometry, lensMat)
    lens.position.set(x, y, -0.022)
    bump.add(ring, lens)
  }

  // Buttons, placed as in the first renderer: one on the right edge, two on the left.
  for (const [x, y, h] of [[PHONE.hx + 0.006, 0.32, 0.14], [-PHONE.hx - 0.006, 0.38, 0.09], [-PHONE.hx - 0.006, 0.24, 0.09]]) {
    mesh(new RoundedBoxGeometry(0.016, h, 0.032, 2, 0.006), frameMat, body, x, y, 0)
  }

  // Internals stay behind LAYER_Z.code (local z 0.012), so the assembled code layer covers them. The highest
  // point is the coil's top at local z 0.011.
  mesh(new RoundedBoxGeometry(0.56, 0.48, 0.012, 2, 0.004), boardMat, internals, 0, 0.42, -0.02)
  mesh(new RoundedBoxGeometry(0.14, 0.12, 0.024, 2, 0.004), chipMat, internals, -0.08, 0.46, -0.008)
  mesh(new RoundedBoxGeometry(0.1, 0.07, 0.02, 2, 0.004), chipMat, internals, 0.12, 0.36, -0.01)
  mesh(new RoundedBoxGeometry(0.08, 0.08, 0.02, 2, 0.004), chipMat, internals, 0.13, 0.53, -0.01)
  mesh(new RoundedBoxGeometry(0.54, 0.72, 0.028, 3, 0.03), batteryMat, internals, 0, -0.28, -0.012)
  // The coil lies on the battery's screen-side face (local z 0.002), the side the camera sees when the stack
  // is apart. It sinks 0.003 into the battery so its top stays below the code layer.
  mesh(new THREE.TorusGeometry(0.13, 0.012, 16, 96), coilMat, internals, 0, -0.28, -0.001)

  // Glass: a clear sheet whose rim and a sweeping band are added on top of the physical reflection.
  const glassUniforms = { uGlassLight: { value: 0 }, uSweep: { value: 0 }, uBand: { value: 0 } }
  const glassMat = own(new THREE.MeshPhysicalMaterial({
    color: '#000000',
    metalness: 0,
    roughness: (opts.narrow ? GLASS.narrow : GLASS.wide).roughness,
    ior: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMap,
    envMapIntensity: 0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    // The shader's colour is reflected light, so it is added as written while alpha darkens what lies behind.
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  }))
  glassMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, glassUniforms)
    shader.vertexShader = `varying vec2 vGlassLocal;\n${shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlassLocal = position.xy;')}`
    shader.fragmentShader = `varying vec2 vGlassLocal;
uniform float uGlassLight;
uniform float uSweep;
uniform float uBand;
${shader.fragmentShader.replace('#include <opaque_fragment>', `#include <opaque_fragment>
{
  vec2 q = abs(vGlassLocal) - vec2(${glslFloat(GLASS_HALF.x)}, ${glslFloat(GLASS_HALF.y)}) + ${glslFloat(GLASS_HALF.radius)};
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - ${glslFloat(GLASS_HALF.radius)};
  float rim = 1.0 - smoothstep(0.0, .012, -sd);
  // GLSL ES gives pow() no defined result for a negative base, so the Gaussian squares by multiplication.
  float across = (vGlassLocal.x + vGlassLocal.y * .6 - uSweep) * 7.0;
  float glint = (rim * .35 + exp(-across * across) * .35 * uBand) * uGlassLight;
  gl_FragColor.rgb += vec3(1.0, .94, .84) * glint;
  gl_FragColor.a = min(1.0, gl_FragColor.a + glint * .4);
}`)}`
  }
  const glass = new THREE.Mesh(keep(slab(GLASS_HALF.x, GLASS_HALF.y, GLASS_HALF.radius, GLASS_HALF.depth, GLASS_HALF.bevel, 24)), glassMat)
  glass.matrixAutoUpdate = false
  group.add(glass)

  const plane = (hx: number, hy: number, material: THREE.ShaderMaterial): PlaneMesh => {
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(2 * hx, 2 * hy)), own(material))
    m.matrixAutoUpdate = false
    group.add(m)
    return m
  }
  const screenPlane = (seed: number) => {
    const m = plane(PHONE.sx, PHONE.sy, createScreenMaterial(blank, blank))
    m.material.uniforms.uHalf.value.set(PHONE.sx, PHONE.sy)
    m.material.uniforms.uRadius.value = PHONE.sRadius
    m.material.uniforms.uSeed.value = seed
    return m
  }
  const screen = screenPlane(0)
  const code = plane(CODE.hx, CODE.hy, createCodeMaterial(blank))
  const cards = story.cards.map((_, i) => screenPlane(17 * (i + 1)))

  let narrow = opts.narrow
  const setMatrix = (object: THREE.Object3D, position: Vec3, right: Vec3, up: Vec3, normal: Vec3) => {
    object.matrix.fromArray(toThreeMatrix(position, right, up, normal))
    object.matrixWorldNeedsUpdate = true
  }
  const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

  return {
    group,
    body,
    internals,
    glass,
    screen,
    code,
    cards,
    update(pose) {
      const { phone } = pose
      setMatrix(body, phone.pos, phone.right, phone.up, phone.normal)
      internals.visible = pose.internals >= 0.01
      setMatrix(glass, pose.glass.center, phone.right, phone.up, phone.normal)
      const tune = narrow ? GLASS.narrow : GLASS.wide
      const shown = Math.min(1, pose.glass.light / ASSEMBLED_LIGHT)
      glass.visible = shown > 0.005
      glassMat.opacity = tune.opacity * pose.explode * shown
      glassMat.envMapIntensity = tune.env * GLASS_ENV * shown
      glassUniforms.uGlassLight.value = pose.glass.light
      glassUniforms.uSweep.value = pose.glass.sweep
      glassUniforms.uBand.value = pose.glass.band
      const planes: [PlaneMesh, PlanePose | undefined][] = [[screen, pose.screen], [code, pose.code], ...cards.map((c, i): [PlaneMesh, PlanePose | undefined] => [c, pose.cards[i]])]
      for (const [m, p] of planes) if (p) setMatrix(m, p.center, p.right, p.up, cross(p.right, p.up))
    },
    setNarrow(next) {
      narrow = next
      glassMat.roughness = (narrow ? GLASS.narrow : GLASS.wide).roughness
    },
    dispose() {
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      blank.dispose()
    },
  }
}
