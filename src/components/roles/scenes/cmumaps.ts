/**
 * The CMUMaps island: Carnegie Mellon's campus from the CMUMaps pipeline's own output (public/roles/cmumaps/
 * campus.json, derived from OpenStreetMap), 74 buildings on their real footprints, extruded by their floor counts,
 * with their 75 entrances. On the home page the finished campus sits on the island. On the journey page the
 * arrival comes down over it, the work act replays the pipeline (the buildings sink to their footprints, the
 * footprint points rain down onto them, the floors stack back up, and the entrances light), and the close pulls
 * back with a pin on the chosen building. Hovering a building names it, and a click moves the pin to it.
 *
 * All buildings are one merged mesh. Each vertex carries its building's index, and a uniform array of rises
 * (0 flat to 1 full height) lowers each building's roof, so floors appear as a building grows instead of
 * stretching. The shadow pass reads the same rises through a matching depth material.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GLOW, ISLAND_RADIUS, ease, frame, island, materials, mulberry32, props, ramp, smoother, sunlight } from '../kit'
import type { IslandFactory, IslandFrame, IslandOutput, IslandPanel } from '../types'

interface Building { code: string; name: string; floors: number; rings: [number, number][][]; entrances: [number, number][] }

/** World units per metre: the campus's 1,190 by 870 m fits inside the island's top. */
const METRE = 0.0026
/** World units per floor, three times the true scale so the floor counts read. */
const FLOOR = 0.032
/** The campus centre in the data's metres, the middle of its bounding box. */
const CENTRE = { x: -48, y: 80 }
/** The building the pin starts on: Gates Hillman, home of the School of Computer Science. */
const START_PIN = 'GHC'
/** Seconds the pin takes to drop and settle. */
const PIN_S = 0.9
const TARGET = new THREE.Vector3(0.1, -0.25, 0.05)

const toWorld = (x: number, y: number) => ({ x: (x - CENTRE.x) * METRE, z: -(y - CENTRE.y) * METRE })

const createScene: IslandFactory = (ctx) => {
  const scene = new THREE.Scene()
  scene.environment = ctx.environment
  scene.environmentIntensity = 0.35
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80)
  const lights = sunlight(scene)
  const mats = materials()
  const kit = props(mats, 23)
  const base = island(mats, { seed: 74, grass: '#86c070', dirt: '#9a6b43', rock: '#8a8178', radius: ISLAND_RADIUS * 1.12 })
  const world = new THREE.Group()
  world.add(base.group)
  scene.add(world)

  // The buildings' material: sandstone walls with a darker line at every floor, pale roofs, and a glow on the
  // hovered and the pinned building.
  const riseUniform = { value: new Float32Array(128).fill(1) }
  const shared = {
    uRise: riseUniform,
    uHover: { value: -1 },
    uPinned: { value: -1 },
    uFloor: { value: FLOOR },
    uAccent: { value: new THREE.Color(ctx.facts.accent) },
  }
  const riseVertex = (shader: { vertexShader: string; uniforms: Record<string, unknown> }) => {
    shader.uniforms.uRise = shared.uRise
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aBuilding;
uniform float uRise[128];
varying float vBuilding;
varying float vHeight;
varying float vUp;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float rise = uRise[int(aBuilding + 0.5)];
transformed.y *= rise;
vBuilding = aBuilding;
vHeight = transformed.y;
vUp = normal.y;`)
  }
  const buildingMaterial = new THREE.MeshStandardMaterial({ color: '#d8c39a', roughness: 0.8, flatShading: true })
  buildingMaterial.onBeforeCompile = (shader) => {
    riseVertex(shader)
    Object.assign(shader.uniforms, { uHover: shared.uHover, uPinned: shared.uPinned, uFloor: shared.uFloor, uAccent: shared.uAccent })
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uHover;
uniform float uPinned;
uniform float uFloor;
uniform vec3 uAccent;
varying float vBuilding;
varying float vHeight;
varying float vUp;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float roof = step(0.5, vUp);
float line = (1.0 - roof) * (1.0 - smoothstep(0.0, 0.18, abs(fract(vHeight / uFloor + 0.5) - 0.5) * 2.0));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.92, 0.88), roof);
diffuseColor.rgb *= 1.0 - 0.28 * line;
float lit = max(step(abs(vBuilding - uHover), 0.1), step(abs(vBuilding - uPinned), 0.1));
diffuseColor.rgb = mix(diffuseColor.rgb, uAccent, 0.45 * lit);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += uAccent * 0.35 * max(step(abs(vBuilding - uHover), 0.1), step(abs(vBuilding - uPinned), 0.1));`)
  }
  const depthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
  depthMaterial.onBeforeCompile = (shader) => riseVertex(shader)

  let buildings: Building[] = []
  let campus: THREE.Mesh | null = null
  let campusGeometry: THREE.BufferGeometry | null = null
  const centres: THREE.Vector3[] = []
  const tops: number[] = []
  /** Each building's order in the rise wave, 0 to 1, by distance from the campus centre. */
  let waveOrder: number[] = []
  let nodes: THREE.Points | null = null
  let nodeGeometry: THREE.BufferGeometry | null = null
  let doors: THREE.InstancedMesh | null = null
  const doorGeometry = new THREE.CylinderGeometry(0.018, 0.018, 0.012, 10)
  const doorMaterial = mats.get('#fff3b0', { emissive: '#ffd34d', emissiveIntensity: 2.4 })
  const nodeUniforms = { uFall: { value: 0 }, uFade: { value: 1 }, uScale: { value: 600 }, uColor: { value: new THREE.Color(ctx.facts.accent) } }
  const nodeMaterial = new THREE.ShaderMaterial({
    uniforms: nodeUniforms,
    ...GLOW,
    vertexShader: /* glsl */ `
attribute vec3 aFrom;
attribute float aDelay;
uniform float uFall;
uniform float uScale;
varying float vAlpha;
void main() {
  float k = smoothstep(0.0, 1.0, clamp(uFall * 1.6 - aDelay * 0.6, 0.0, 1.0));
  vec3 p = mix(aFrom, position, k * k);
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = max(1.5, 0.035 * uScale / -view.z);
  vAlpha = smoothstep(0.0, 0.1, uFall) * (0.5 + 0.5 * k);
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uColor;
uniform float uFade;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = vAlpha * uFade * (1.0 - smoothstep(0.2, 0.5, d));
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.4) * a, a);
}`,
  })

  // The pin: a red map marker that drops onto the chosen building.
  const pin = new THREE.Group()
  const pinHead = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 12), mats.get('#e8433a', { emissive: '#e8433a', emissiveIntensity: 0.25, roughness: 0.4 }))
  pinHead.position.y = 0.22
  const pinPoint = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 14), pinHead.material)
  pinPoint.rotation.x = Math.PI
  pinPoint.position.y = 0.12
  const pinDot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), mats.get('#ffffff'))
  pinDot.position.set(0, 0.22, 0.062)
  pin.add(pinHead, pinPoint, pinDot)
  pin.traverse((o) => { o.castShadow = true })
  pin.visible = false
  world.add(pin)
  let pinned = -1
  let pinDropAt = -1

  fetch('/roles/cmumaps/campus.json')
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((data: { buildings: Building[] }) => {
      buildings = data.buildings
      const parts: THREE.BufferGeometry[] = []
      const footprintPoints: number[] = []
      buildings.forEach((b, index) => {
        const height = Math.max(1, b.floors) * FLOOR
        let cx = 0, cz = 0, count = 0
        for (const ring of b.rings) {
          if (ring.length < 3) continue
          const shape = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2((x - CENTRE.x) * METRE, (y - CENTRE.y) * METRE)))
          const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
          geometry.rotateX(-Math.PI / 2)
          const n = geometry.getAttribute('position').count
          geometry.setAttribute('aBuilding', new THREE.Float32BufferAttribute(new Float32Array(n).fill(index), 1))
          geometry.deleteAttribute('uv')
          parts.push(geometry)
          for (const [x, y] of ring) {
            const w = toWorld(x, y)
            cx += w.x
            cz += w.z
            count++
            footprintPoints.push(w.x, 0.01, w.z)
          }
        }
        centres.push(new THREE.Vector3(count ? cx / count : 0, 0, count ? cz / count : 0))
        tops.push(height)
      })
      campusGeometry = mergeGeometries(parts.map((g) => g.toNonIndexed()), false)
      parts.forEach((g) => g.dispose())
      if (!campusGeometry) return
      campusGeometry.computeVertexNormals()
      campus = new THREE.Mesh(campusGeometry, buildingMaterial)
      campus.customDepthMaterial = depthMaterial
      campus.castShadow = true
      campus.receiveShadow = true
      world.add(campus)
      const far = Math.max(...centres.map((c) => Math.hypot(c.x, c.z)))
      waveOrder = centres.map((c) => Math.hypot(c.x, c.z) / far)

      // The footprint points fall from a loose cloud over the island.
      const random = mulberry32(15000)
      const from: number[] = []
      const delay: number[] = []
      for (let i = 0; i < footprintPoints.length; i += 3) {
        from.push(footprintPoints[i] + (random() - 0.5) * 1.6, 1.4 + random() * 1.6, footprintPoints[i + 2] + (random() - 0.5) * 1.6)
        delay.push(random())
      }
      nodeGeometry = new THREE.BufferGeometry()
      nodeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(footprintPoints, 3))
      nodeGeometry.setAttribute('aFrom', new THREE.Float32BufferAttribute(from, 3))
      nodeGeometry.setAttribute('aDelay', new THREE.Float32BufferAttribute(delay, 1))
      nodes = new THREE.Points(nodeGeometry, nodeMaterial)
      nodes.frustumCulled = false
      nodes.visible = false
      world.add(nodes)

      const doorList = buildings.flatMap((b) => b.entrances)
      doors = new THREE.InstancedMesh(doorGeometry, doorMaterial, doorList.length)
      const m = new THREE.Matrix4()
      doorList.forEach(([x, y], i) => {
        const w = toWorld(x, y)
        doors?.setMatrixAt(i, m.makeTranslation(w.x, 0.008, w.z))
      })
      doors.visible = false
      world.add(doors)

      pinned = buildings.findIndex((b) => b.code === START_PIN)

      // Trees on the open grass, away from every footprint's centre.
      const trees = mulberry32(7474)
      for (let i = 0; i < 70; i++) {
        const angle = trees() * Math.PI * 2
        const r = Math.sqrt(trees()) * ISLAND_RADIUS * 1.02
        const x = Math.cos(angle) * r
        const z = Math.sin(angle) * r
        if (centres.some((c) => Math.hypot(c.x - x, c.z - z) < 0.16)) continue
        const tree = kit.tree(i % 4 ? '#4b9150' : '#5aa25a', 0.42)
        tree.position.set(x, 0, z)
        world.add(tree)
      }
      ctx.invalidate()
    })
    .catch((error) => console.warn('[roles] the CMUMaps campus failed to load', error))

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const projected = new THREE.Vector3()
  const scratch = new THREE.Vector3()
  let hovered = -1
  let rested = 0
  let clock = 0

  /** The building a ray from the camera meets first, or -1. The ray tests the rises the frame drew. */
  const pick = (x: number, y: number) => {
    if (!campus || !campusGeometry) return -1
    ndc.set(x, y)
    raycaster.setFromCamera(ndc, camera)
    const hit = raycaster.intersectObject(campus, false)[0]
    if (!hit || hit.face == null) return -1
    const index = (campusGeometry.getAttribute('aBuilding') as THREE.BufferAttribute).getX(hit.face.a)
    return Math.round(index)
  }

  const view = (f: IslandFrame) => {
    if (f.mode === 'home') return { distance: 8 - 0.4 * f.hover, yaw: 0.5 + f.tiltX * 0.3, pitch: 0.55 - f.tiltY * 0.1, focusX: 0.5, focusY: 0.5 }
    const a = f.local('arrival')
    const w = f.local('work')
    const c = f.local('impact')
    const dive = smoother(ramp(a, 0, 0.85))
    const work = smoother(ramp(w, 0, 0.2)) * (1 - smoother(ramp(c, 0, 0.5)))
    const distance = (f.narrow ? 19 : 17) - (f.narrow ? 4.5 : 5.5) * dive - 2 * work + 1.6 * smoother(ramp(c, 0.2, 0.8)) + 0.6 * f.push
    const yaw = 0.5 + 0.7 * dive + 0.9 * w + 0.3 * c + f.tiltX * 0.16 + f.dragYaw
    const pitch = 0.78 - 0.18 * dive + 0.12 * work - f.tiltY * 0.08
    return { distance, yaw, pitch, focusX: f.narrow ? 0.5 : 0.36, focusY: f.narrow ? 0.72 : 0.5 }
  }

  const hidden = (): IslandPanel => {
    const at = new THREE.Vector3(0, -50, 0)
    return { center: at, up: new THREE.Vector3(0, 1, 0), halfH: 0, corners: [at], develop: 0, opacity: 0 }
  }

  return {
    scene,
    camera,
    update(f): IslandOutput {
      clock = f.time
      let busy = false
      const v = view(f)
      world.position.y = 0.12 * f.hover
      for (const { light, base: intensity } of lights) light.intensity = intensity * (1 + 0.2 * f.push)
      frame(camera, TARGET, v.distance, v.yaw, v.pitch, f.aspect, v.focusX, v.focusY)

      // The pipeline replay: sink to footprints, rain the points, stack the floors, light the entrances.
      const w = f.mode === 'journey' ? f.local('work') : 0
      const c = f.mode === 'journey' ? f.local('impact') : 0
      const sink = smoother(ramp(w, 0.04, 0.22))
      const fall = ramp(w, 0.18, 0.48)
      const build = ramp(w, 0.46, 0.8)
      const doorsOn = smoother(ramp(w, 0.72, 0.86))
      const rises = riseUniform.value
      for (let i = 0; i < centres.length; i++) {
        const up = smoother((build - waveOrder[i] * 0.55) / 0.45)
        rises[i] = Math.max(0.025, sink > 0 ? (1 - sink) + sink * up : 1)
      }
      if (nodes) {
        nodes.visible = fall > 0 && build < 1
        nodeUniforms.uFall.value = fall
        nodeUniforms.uFade.value = 1 - smoother(ramp(w, 0.62, 0.8))
        nodeUniforms.uScale.value = ctx.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
      }
      if (doors) {
        doors.visible = doorsOn > 0.01
        doors.scale.setScalar(1)
        ;(doorMaterial as THREE.MeshStandardMaterial).emissiveIntensity = 2.4 * doorsOn
      }

      // Hover names a building, and the pin stands on the chosen one from the work's end.
      const pickable = f.mode === 'home' ? f.hover > 0.5 : sink < 0.01 || build > 0.95
      hovered = f.pointer.inside && pickable ? pick(f.pointer.x, f.pointer.y) : -1
      shared.uHover.value = hovered
      const showPin = f.mode === 'journey' && (w > 0.85 || c > 0) && pinned >= 0
      pin.visible = showPin
      shared.uPinned.value = showPin ? pinned : -1
      if (showPin) {
        const since = pinDropAt < 0 ? 1 : (clock - pinDropAt) / PIN_S
        const drop = since >= 1 ? 1 : 1 - Math.pow(1 - since, 3) * Math.cos(since * 9)
        if (since < 1) busy = true
        const centre = centres[pinned]
        pin.position.set(centre.x, tops[pinned] * rises[pinned] + 0.5 * (1 - Math.min(1, drop)), centre.z)
        pin.scale.setScalar(1 + 0.15 * Math.sin(Math.PI * Math.min(1, since)))
      }
      rested = ease(rested, hovered >= 0 ? 1 : 0, f.dt, 0.12)

      // Panels: one label per building, shown for the hovered building or the pinned one.
      scene.updateMatrixWorld()
      const panels = buildings.map((_, i) => {
        const named = i === hovered || (showPin && i === pinned && hovered < 0)
        if (!named) return hidden()
        const top = scratch.copy(centres[i]).setY(tops[i] * rises[i] + (i === pinned && showPin ? 0.3 : 0.04))
        const at = world.localToWorld(top.clone())
        return { center: at, up: new THREE.Vector3(0, 1, 0), halfH: -0.06, corners: [at.clone()], develop: 1, opacity: 1 }
      })

      projected.copy(TARGET).project(camera)
      const anchors = new Map<string, THREE.Vector3 | null>()
      anchors.set('campus', world.localToWorld(new THREE.Vector3(-0.6, 0.15, 0.4)))
      anchors.set('pin', showPin && pinned >= 0 ? world.localToWorld(centres[pinned].clone().setY(tops[pinned] + 0.2)) : null)
      anchors.set('door', doorsOn > 0.5 && buildings[0]?.entrances[0] ? (() => { const d = toWorld(...buildings[0].entrances[0]); return world.localToWorld(new THREE.Vector3(d.x, 0.02, d.z)) })() : null)
      return {
        anchors,
        panels,
        bounds: [world.localToWorld(new THREE.Vector3(0, -2.2, 0))],
        focusY: projected.y * 0.5 + 0.5,
        busy,
        ready: campus !== null,
      }
    },
    press(point) {
      const index = pick(point.x, point.y)
      if (index < 0) return false
      pinned = index
      pinDropAt = ctx.now()
      return true
    },
    dispose() {
      base.geometries.forEach((g) => g.dispose())
      campusGeometry?.dispose()
      nodeGeometry?.dispose()
      nodeMaterial.dispose()
      buildingMaterial.dispose()
      depthMaterial.dispose()
      doorGeometry.dispose()
      pinHead.geometry.dispose()
      pinPoint.geometry.dispose()
      pinDot.geometry.dispose()
      kit.dispose()
      mats.dispose()
    },
  }
}

export default createScene
