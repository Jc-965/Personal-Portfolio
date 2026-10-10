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
  /** Frame, back plate, bands, buttons, island, ports, and the camera module. Carries the phone transform. */
  body: THREE.Group
  /** Board, chips, cables, modules, battery, and coil, a child of `body`. Hidden while the stack is assembled. */
  internals: THREE.Group
  glass: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshPhysicalMaterial>
  screen: PlaneMesh
  code: PlaneMesh
  cards: PlaneMesh[]
  /** Moves every part to the pose and sets the glass's light. Plane uniforms are left to the caller. */
  update(pose: Pose): void
  /** Switches the glass between its wide and narrow opacity without a shader recompile. */
  setNarrow(narrow: boolean): void
  dispose(): void
}

/**
 * Environment reflection strength per surface. RoomEnvironment's brightest
 * panel sits behind the camera, so surfaces that face the camera inside the
 * open tray (the back plate and the internals) reflect it as a flat grey wash
 * unless they reflect much less than the frame, which sees it only at grazing angles.
 * `steel` feeds only the shield cans and the steel module. Its emissive panels
 * are 17 to 100, so at 0.7 those metal faces clipped to flat white squares in
 * the proof close-up, and at 0.2 they read as grey metal.
 */
const ENV = { frame: 1, interior: 0.3, battery: 0.5, coil: 0.9, steel: 0.2 } as const
/** Frame and front lip bevel, world units. */
const BEVEL = 0.012
/** Inset of the frame's front and back lip from the outer silhouette. The lip edge sits between the screen and the glass edge. */
const LIP = 0.022
const GLASS_HALF = { x: PHONE.sx + 0.012, y: PHONE.sy + 0.012, radius: PHONE.sRadius + 0.01, depth: 0.006, bevel: 0.0015 }
/**
 * Glass tuning. The sheet is a clear physical material drawn with
 * premultiplied alpha, so its reflection scales by `env` times `opacity`,
 * and that product must stay near 0.025 on every stage. At 0.05 the narrow
 * sheet laid a white wedge across the Home capture's chart. RoomEnvironment's
 * ceiling panel reflects across the tilted sheet's upper half, and a larger
 * product fills the exploded sheet with a flat grey that reads as frost
 * instead of a sheen. The rim ring and the sweeping band in the shader carry
 * the sheet's outline, so the body itself stays nearly clear. While the stack
 * is assembled the sheet runs at `assembled` of its opacity and `clearcoat`
 * of its clearcoat, both rising to 1 with the explode, so the screen beneath
 * keeps its colours. At an env of 0.35, 0.4 of the opacity, and a full
 * clearcoat, the assembled sheet mirrored a panel across the top third of the
 * Log screen as the quiet act turned the phone, RGB 61, 62, 65 against the
 * capture's 7, 12, 22 at 1440 by 900, and hid the Dynamic Island. The
 * clearcoat stays above 0, since crossing 0 recompiles the material.
 */
const GLASS = { opacity: { wide: 0.1, narrow: 0.1 }, env: 0.25, roughness: 0.02, assembled: 0.2, clearcoat: 0.3 } as const
/** Glass light while assembled, from rig.ts. Below it the glass fades out with the arrival. */
const ASSEMBLED_LIGHT = 0.35
/** Lens centres on the camera bump, bump-local. The camera barrels inside the tray sit behind them. */
const LENSES: readonly [number, number][] = [[-0.05, 0.05], [-0.05, -0.05], [0.05, 0]]
/** Camera bump centre, 0.03 proud of the back plate and sunk 0.01 into it. */
const BUMP: Vec3 = [-0.17, 0.53, -PHONE.hz - 0.01]
/** Wireless charging coil centre on the battery's screen-side face. */
const COIL: [number, number] = [0, -0.28]

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
 * hole inward, so its walls stand `bevel` inside those extents. A radius equal
 * to the half-height gives a pill.
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

/** Cylinder with its axis along z, centred on the origin. */
function cylinderZ(radius: number, height: number, segments = 32): THREE.CylinderGeometry {
  return new THREE.CylinderGeometry(radius, radius, height, segments).rotateX(Math.PI / 2)
}

export function createProduct(story: TeardownStory, opts: { narrow: boolean; environment: THREE.Texture | null }): Product {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials: THREE.Material[] = []
  const instanced: THREE.InstancedMesh[] = []
  const keep = <G extends THREE.BufferGeometry>(g: G) => { geometries.add(g); return g }
  const own = <M extends THREE.Material>(m: M) => { materials.push(m); return m }
  const envMap = opts.environment
  // A blank texture keeps the plane samplers complete until TeardownCanvas assigns the real maps.
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1)
  blank.needsUpdate = true

  // Materials set envMap themselves: with only scene.environment, three replaces every envMapIntensity with the scene's.
  const lit = (envMapIntensity: number) => ({ envMap, envMapIntensity })
  const frameMat = own(new THREE.MeshPhysicalMaterial({ color: '#2b2d31', metalness: 0.9, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25, ...lit(ENV.frame) }))
  const bandMat = own(new THREE.MeshStandardMaterial({ color: '#43454a', metalness: 0.1, roughness: 0.7, ...lit(ENV.interior) }))
  const backMat = own(new THREE.MeshStandardMaterial({ color: '#1c1d20', metalness: 0.6, roughness: 0.45, ...lit(ENV.interior) }))
  const lensMat = own(new THREE.MeshPhysicalMaterial({ color: '#06070a', roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03, ...lit(ENV.frame) }))
  const elementMat = own(new THREE.MeshPhysicalMaterial({ color: '#0c1a30', roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0.02, ...lit(ENV.frame) }))
  const flashMat = own(new THREE.MeshStandardMaterial({ color: '#f1e3c4', emissive: '#6b5230', emissiveIntensity: 0.4, roughness: 0.35, ...lit(ENV.interior) }))
  const darkMat = own(new THREE.MeshStandardMaterial({ color: '#09090b', roughness: 0.55, ...lit(ENV.interior) }))
  // The display-off face and the Dynamic Island are unlit. Lit at ENV.interior, darkMat mirrors RoomEnvironment's
  // emissive panels across a head-on face, which measured RGB 50 to 105 against the captures' 8, 12, 22 base.
  const faceMat = own(new THREE.MeshBasicMaterial({ color: '#030405' }))
  const boardMat = own(new THREE.MeshStandardMaterial({ color: '#0d1a15', roughness: 0.6, ...lit(ENV.interior) }))
  // The internal camera lenses face the camera in the exploded stack, and RoomEnvironment's area lights behind it
  // are emissive at 17 to 100, so any glossy head-on reflection at ENV.interior with a clearcoat on top clips to
  // a flat white disc. The lens glass therefore reflects at 0.03 with no clearcoat and a soft 0.25 roughness, which
  // keeps the brightest panel to a dim sheen on near-black glass. The barrels around the lenses are titanium at a
  // quarter of the frame's reflection, and the plate under them is matte black.
  const innerLensMat = own(new THREE.MeshPhysicalMaterial({ color: '#05070a', roughness: 0.25, clearcoat: 0, envMap, envMapIntensity: 0.03 }))
  const barrelMat = own(new THREE.MeshStandardMaterial({ color: '#2b2d31', metalness: 0.9, roughness: 0.45, envMap, envMapIntensity: 0.25 }))
  // Bare packages and shield cans in two finishes each, so neighbouring parts catch the light differently and the
  // board reads as hardware instead of flat grey boxes. The cans' roughness of 0.55 and 0.7 spreads the
  // environment's panels into a soft sheen, which a head-on can otherwise mirrors as a flat white square.
  const chipMats = [0.26, 0.4].map((roughness) => own(new THREE.MeshStandardMaterial({ color: '#0c0c0f', roughness, ...lit(ENV.battery) })))
  const shieldMats = [0.55, 0.7].map((roughness) => own(new THREE.MeshStandardMaterial({ color: '#4e5157', metalness: 0.9, roughness, ...lit(ENV.steel) })))
  const steelMat = own(new THREE.MeshStandardMaterial({ color: '#7d8187', metalness: 0.92, roughness: 0.32, ...lit(ENV.steel) }))
  const flexMat = own(new THREE.MeshStandardMaterial({ color: '#5a3a18', metalness: 0.35, roughness: 0.4, ...lit(ENV.battery) }))
  const batteryMat = own(new THREE.MeshStandardMaterial({ color: '#3a3d42', metalness: 0.75, roughness: 0.42, ...lit(ENV.battery) }))
  const labelMat = own(new THREE.MeshStandardMaterial({ color: '#4d5057', metalness: 0.2, roughness: 0.72, ...lit(ENV.interior) }))
  const coilMat = own(new THREE.MeshStandardMaterial({ color: '#b87333', metalness: 1, roughness: 0.28, ...lit(ENV.coil) }))
  const magnetMat = own(new THREE.MeshStandardMaterial({ color: '#2d2f34', metalness: 0.9, roughness: 0.3, ...lit(ENV.battery) }))

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
  const instances = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, count: number, place: (i: number, matrix: THREE.Matrix4) => void) => {
    const m = new THREE.InstancedMesh(keep(geometry), material, count)
    const matrix = new THREE.Matrix4()
    for (let i = 0; i < count; i++) {
      matrix.identity()
      place(i, matrix)
      m.setMatrixAt(i, matrix)
    }
    m.instanceMatrix.needsUpdate = true
    parent.add(m)
    instanced.push(m)
    return m
  }
  const box = (w: number, h: number, d: number, radius: number) => new RoundedBoxGeometry(w, h, d, 2, radius)

  // Side frame: an open ring whose lips stop LIP inside the silhouette, and the glass rests on the front lip.
  // The hole's bevel narrows the opening to 0.327 by 0.722 half-extents at the screen's depth (local z 0.038),
  // so the frame covers the screen's outer 0.008 by 0.006 as a thin bezel.
  const lip = { hx: PHONE.hx - LIP, hy: PHONE.hy - LIP, r: PHONE.radius - LIP }
  mesh(slab(PHONE.hx, PHONE.hy, PHONE.radius, 2 * PHONE.hz, BEVEL, 32, lip), frameMat, body)
  // The back plate's outer face stops 0.0015 short of the frame's back lip, so the two never share a depth.
  mesh(slab(PHONE.hx - 0.004, PHONE.hy - 0.004, PHONE.radius - 0.004, 0.008, 0), backMat, body, 0, 0, -PHONE.hz + 0.0055)

  // Antenna bands: matte inserts 0.0015 proud of the frame's walls, across the frame's flat core depth.
  const bandDepth = 2 * PHONE.hz - 2 * BEVEL + 0.004
  const sideBand = keep(new THREE.BoxGeometry(0.003, 0.007, bandDepth))
  const endBand = keep(new THREE.BoxGeometry(0.007, 0.003, bandDepth))
  for (const y of [0.56, -0.56]) for (const x of [PHONE.hx, -PHONE.hx]) mesh(sideBand, bandMat, body, x, y, 0)
  for (const x of [0.19, -0.19]) for (const y of [PHONE.hy, -PHONE.hy]) mesh(endBand, bandMat, body, x, y, 0)

  // Chamfered buttons: the action and volume buttons on the left, the side button on the right. Each is a slab
  // turned so its bevelled cap faces outward, sunk 0.008 into the frame and standing 0.012 proud of it.
  const button = (halfLength: number) => slab(0.016, halfLength, 0.006, 0.02, 0.003, 8).rotateY(Math.PI / 2)
  for (const [x, y, half] of [[PHONE.hx + 0.002, 0.32, 0.07], [-PHONE.hx - 0.002, 0.5, 0.022], [-PHONE.hx - 0.002, 0.38, 0.045], [-PHONE.hx - 0.002, 0.24, 0.045]]) {
    mesh(button(half), frameMat, body, x, y, 0)
  }

  // The display-off face: a black panel 0.002 behind the screen plane, inside the frame's bezel. It shows wherever
  // the screen plane is transparent on an assembled phone (the narrow deck and the arrival's fade-in), so the front
  // reads as a dark display and never as the empty tray. update() hides it while the internals show, so the
  // exploded stack is unchanged.
  const face = mesh(new THREE.ShapeGeometry(roundedRect(new THREE.Shape(), PHONE.sx, PHONE.sy, PHONE.sRadius), 16), faceMat, body, 0, 0, 0.036)

  // Dynamic Island: a pill just in front of the screen plane (local z 0.038), with its camera dot, over the
  // captures' empty top strip. Top speaker slot on the front lip above it, between the screen and the glass.
  // The dot takes the internal lens glass, since the clearcoated lensMat clipped to a white point head-on.
  mesh(slab(0.105, 0.0315, 0.0315, 0.004, 0.0005, 16), faceMat, body, 0, PHONE.sy - 0.0505, 0.0405)
  mesh(cylinderZ(0.009, 0.002, 20), innerLensMat, body, 0.068, PHONE.sy - 0.0505, 0.0431)
  mesh(slab(0.05, 0.002, 0.002, 0.002, 0, 6), darkMat, body, 0, PHONE.hy - LIP + 0.005, 0.0455)

  // Bottom edge: the charging port and six speaker holes each side, all sunk into the frame and 0.0015 proud of it.
  mesh(box(0.075, 0.012, 0.024, 0.005), darkMat, body, 0, -PHONE.hy + 0.0045, 0)
  instances(new THREE.CylinderGeometry(0.0035, 0.0035, 0.012, 12), darkMat, body, 12, (i, matrix) => {
    const side = i < 6 ? 1 : -1
    matrix.setPosition(side * (0.085 + (i % 6) * 0.017), -PHONE.hy + 0.0045, 0)
  })

  // Camera module on the back (local -z): three lenses with their inner elements, the flash, and a depth sensor.
  const bump = new THREE.Group()
  bump.position.set(...BUMP)
  body.add(bump)
  mesh(slab(0.13, 0.13, 0.05, 0.04, 0.005, 16), frameMat, bump)
  const ringGeometry = keep(new THREE.TorusGeometry(0.042, 0.007, 12, 48))
  const lensGeometry = keep(cylinderZ(0.036, 0.006, 40))
  const elementGeometry = keep(cylinderZ(0.022, 0.004, 32))
  for (const [x, y] of LENSES) {
    mesh(ringGeometry, frameMat, bump, x, y, -0.021)
    mesh(lensGeometry, lensMat, bump, x, y, -0.022)
    mesh(elementGeometry, elementMat, bump, x, y, -0.0235)
  }
  mesh(cylinderZ(0.016, 0.004, 24), flashMat, bump, 0.055, 0.075, -0.021)
  mesh(cylinderZ(0.011, 0.004, 24), lensMat, bump, 0.055, -0.075, -0.021)

  // Internals stay behind LAYER_Z.code (local z 0.012), so the assembled code layer covers them. The highest
  // points are the coil's top and the camera barrels at local z 0.011 and 0.010. The board's top face is at
  // -0.014, the battery's at 0.002, and the back plate's inner face at -0.0355.
  mesh(box(0.58, 0.5, 0.012, 0.004), boardMat, internals, 0, 0.41, -0.02)
  // Camera barrels in the top left corner, behind the bump: titanium barrels, each capped by a dark glass lens
  // that leaves a titanium ring around it. The lens tops sit at local z 0.0105, under the code layer's 0.012.
  mesh(box(0.2, 0.2, 0.016, 0.006), darkMat, internals, BUMP[0], BUMP[1], -0.006)
  const barrelGeometry = keep(cylinderZ(0.036, 0.008, 32))
  const innerLensGeometry = keep(cylinderZ(0.027, 0.001, 32))
  for (const [x, y] of LENSES) {
    mesh(barrelGeometry, barrelMat, internals, BUMP[0] + x, BUMP[1] + y, 0.006)
    mesh(innerLensGeometry, innerLensMat, internals, BUMP[0] + x, BUMP[1] + y, 0.01)
  }
  // Eight chips on the board: shielded packages in steel cans, bare packages in black epoxy.
  const chips: [number, number, number, number, number, THREE.Material][] = [
    [0.15, 0.15, 0.018, 0.08, 0.5, shieldMats[0]],
    [0.09, 0.07, 0.014, 0.22, 0.54, chipMats[1]],
    [0.09, 0.1, 0.016, 0.22, 0.4, shieldMats[1]],
    [0.07, 0.07, 0.012, 0.07, 0.34, chipMats[0]],
    [0.12, 0.06, 0.012, -0.15, 0.33, chipMats[1]],
    [0.05, 0.04, 0.01, -0.04, 0.26, chipMats[0]],
    [0.06, 0.035, 0.01, 0.15, 0.25, chipMats[1]],
    [0.045, 0.045, 0.012, 0.25, 0.25, shieldMats[0]],
  ]
  for (const [w, h, d, x, y, material] of chips) mesh(box(w, h, d, 0.003), material, internals, x, y, -0.014 + d / 2)
  // Two flex cables lying on the board's face: one down the right edge beside the battery, one bridging the gap
  // from the board to the battery and slipping under its top edge.
  mesh(box(0.035, 0.86, 0.002, 0.001), flexMat, internals, 0.3, -0.19, -0.013)
  mesh(box(0.12, 0.16, 0.002, 0.001), flexMat, internals, -0.1, 0.16, -0.013)
  // Haptic motor and speaker module below the battery.
  mesh(box(0.15, 0.06, 0.02, 0.004), steelMat, internals, -0.17, -0.68, -0.016)
  mesh(box(0.2, 0.06, 0.02, 0.004), darkMat, internals, 0.1, -0.68, -0.016)
  // Battery with a matte label panel on its screen-side face.
  mesh(new RoundedBoxGeometry(0.54, 0.72, 0.028, 3, 0.03), batteryMat, internals, 0, -0.28, -0.012)
  mesh(box(0.4, 0.46, 0.0016, 0.004), labelMat, internals, 0, -0.33, 0.0028)
  mesh(box(0.3, 0.05, 0.001, 0.002), darkMat, internals, 0, -0.12, 0.0038)
  // The coil sinks 0.003 into the battery so its top stays below the code layer, ringed by sixteen magnets
  // standing on the battery's face with their long sides tangential.
  mesh(new THREE.TorusGeometry(0.13, 0.012, 16, 96), coilMat, internals, COIL[0], COIL[1], -0.001)
  const magnetUp = new THREE.Vector3(0, 0, 1)
  const magnetTurn = new THREE.Quaternion()
  const magnetAt = new THREE.Vector3()
  const unit = new THREE.Vector3(1, 1, 1)
  instances(new THREE.BoxGeometry(0.028, 0.012, 0.005), magnetMat, internals, 16, (i, matrix) => {
    const angle = (i / 16) * Math.PI * 2
    magnetAt.set(COIL[0] + Math.cos(angle) * 0.165, COIL[1] + Math.sin(angle) * 0.165, 0.0045)
    magnetTurn.setFromAxisAngle(magnetUp, angle + Math.PI / 2)
    matrix.compose(magnetAt, magnetTurn, unit)
  })

  // Glass: a clear sheet whose rim ring and sweeping band are added as light over its premultiplied colour.
  const glassUniforms = { uGlassLight: { value: 0 }, uSweep: { value: 0 }, uBand: { value: 0 } }
  const glassMat = own(new THREE.MeshPhysicalMaterial({
    color: '#000000',
    metalness: 0,
    roughness: GLASS.roughness,
    ior: 1.5,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMap,
    envMapIntensity: GLASS.env,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    premultipliedAlpha: true,
  }))
  glassMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, glassUniforms)
    shader.vertexShader = `varying vec2 vGlassLocal;\n${shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlassLocal = position.xy;')}`
    // Injected after the premultiply, so the ring and the band add light whatever the sheet's opacity.
    shader.fragmentShader = `varying vec2 vGlassLocal;
uniform float uGlassLight;
uniform float uSweep;
uniform float uBand;
${shader.fragmentShader.replace('#include <premultiplied_alpha_fragment>', `#include <premultiplied_alpha_fragment>
{
  vec2 q = abs(vGlassLocal) - vec2(${glslFloat(GLASS_HALF.x)}, ${glslFloat(GLASS_HALF.y)}) + ${glslFloat(GLASS_HALF.radius)};
  float sd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - ${glslFloat(GLASS_HALF.radius)};
  float rim = 1.0 - smoothstep(0.0, .005, -sd);
  // GLSL ES gives pow() no defined result for a negative base, so the Gaussian squares by multiplication.
  float across = (vGlassLocal.x + vGlassLocal.y * .6 - uSweep) * 7.0;
  float glint = (rim * 1.1 + exp(-across * across) * .22 * uBand) * uGlassLight;
  gl_FragColor.rgb += vec3(1.0, .95, .86) * glint;
  gl_FragColor.a = min(1.0, gl_FragColor.a + glint * .6);
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

  let opacity = opts.narrow ? GLASS.opacity.narrow : GLASS.opacity.wide
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
      face.visible = !internals.visible
      setMatrix(glass, pose.glass.center, phone.right, phone.up, phone.normal)
      const shown = Math.min(1, pose.glass.light / ASSEMBLED_LIGHT)
      glass.visible = shown > 0.005
      glassMat.opacity = opacity * shown * (GLASS.assembled + (1 - GLASS.assembled) * pose.explode)
      glassMat.clearcoat = GLASS.clearcoat + (1 - GLASS.clearcoat) * pose.explode
      glassUniforms.uGlassLight.value = pose.glass.light
      glassUniforms.uSweep.value = pose.glass.sweep
      glassUniforms.uBand.value = pose.glass.band
      const planes: [PlaneMesh, PlanePose | undefined][] = [[screen, pose.screen], [code, pose.code], ...cards.map((c, i): [PlaneMesh, PlanePose | undefined] => [c, pose.cards[i]])]
      for (const [m, p] of planes) if (p) setMatrix(m, p.center, p.right, p.up, cross(p.right, p.up))
    },
    setNarrow(narrow) {
      opacity = narrow ? GLASS.opacity.narrow : GLASS.opacity.wide
    },
    dispose() {
      instanced.forEach((m) => m.dispose())
      geometries.forEach((g) => g.dispose())
      materials.forEach((m) => m.dispose())
      blank.dispose()
    },
  }
}
