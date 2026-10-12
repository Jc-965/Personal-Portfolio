/**
 * The CMUMaps world: a cartographer's map slab with Carnegie Mellon's campus on it, built from the CMUMaps
 * pipeline's own output (public/roles/cmumaps/campus.json, derived from OpenStreetMap): 74 buildings on their real
 * footprints, extruded by their floor counts, and their 75 entrances. Above the slab float the pipeline's three
 * layers as glass sheets: the OpenStreetMap points, the footprint outlines, and the entrances. A brass compass, push
 * pins, a rolled map, and a storage bucket stand on and beside the slab.
 *
 * On the home page the finished campus sits under its floating layers. On the journey page the arrival spreads the
 * layers apart, the work act replays the pipeline (the buildings sink, the point layer drops and its points rain
 * onto the footprints, the outline layer imprints them, the floors stack back up, and the entrance layer lights the
 * doors), and the close drops a pin on the chosen building while the output tiles arc into the bucket. Hovering a
 * building names it, and a click moves the pin to it.
 *
 * All buildings are one merged mesh. Each vertex carries its building's index, and a uniform array of rises
 * (0 flat to 1 full height) lowers each building's roof, so floors appear as a building grows instead of
 * stretching. The shadow pass reads the same rises through a matching depth material.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GLOW, ease, frame, materials, mulberry32, ramp, smoother, sunlight } from '../kit'
import type { IslandFactory, IslandFrame, IslandOutput, IslandPanel } from '../types'

interface Building { code: string; name: string; floors: number; rings: [number, number][][]; entrances: [number, number][] }

/** World units per metre: the campus's 1,190 by 870 m fits inside the slab's printed frame. */
const METRE = 0.0026
/** World units per floor, three times the true scale so the floor counts read. */
const FLOOR = 0.032
/** The campus centre in the data's metres, the middle of its bounding box. */
const CENTRE = { x: -48, y: 80 }
/** The map slab's width, depth, and thickness, with its top at y 0. */
const SLAB = { w: 4.8, d: 3.6, t: 0.16 }
/** The three layers' heights above the slab when spread apart, and their sheet size. */
const LAYER_HEIGHTS = [2.3, 1.65, 1.0]
const SHEET = { w: 4.0, d: 3.0 }
/** The building the pin starts on: Gates Hillman, home of the School of Computer Science. */
const START_PIN = 'GHC'
/** Seconds the pin takes to drop and settle. */
const PIN_S = 0.9
/** Output tiles that arc into the bucket at the close. */
const TILES = 28
const BUCKET = new THREE.Vector3(-2.95, 0, -1.1)
const TARGET = new THREE.Vector3(0.15, 0.35, 0)
/** Ink and paper colours of the map. */
const INK = '#2f3d52'
const PAPER = '#e4d4b0'

const toWorld = (x: number, y: number) => ({ x: (x - CENTRE.x) * METRE, z: -(y - CENTRE.y) * METRE })

/**
 * The printed map: paper, a grid, contour lines, a river, a double frame, a north arrow, a scale bar, and, once the
 * data arrives, every footprint in faint ink.
 */
function paperTexture(buildings: Building[] | null, canvas: HTMLCanvasElement) {
  const w = canvas.width
  const h = canvas.height
  const g = canvas.getContext('2d')
  if (!g) return
  const random = mulberry32(1792)
  g.fillStyle = PAPER
  g.fillRect(0, 0, w, h)
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(120, 95, 60, ${0.03 + random() * 0.05})`
    g.fillRect(random() * w, random() * h, 2, 2)
  }
  g.strokeStyle = 'rgba(150, 125, 90, 0.22)'
  g.lineWidth = 1.5
  for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke() }
  for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke() }
  // Contour lines around two hills, wobbling, every fifth one heavier.
  for (const [cx, cy, n] of [[w * 0.22, h * 0.72, 13], [w * 0.82, h * 0.25, 10]] as const) {
    for (let k = 1; k <= n; k++) {
      g.strokeStyle = `rgba(160, 110, 60, ${k % 5 === 0 ? 0.55 : 0.3})`
      g.lineWidth = k % 5 === 0 ? 3 : 1.6
      g.beginPath()
      for (let a = 0; a <= 64; a++) {
        const t = (a / 64) * Math.PI * 2
        const r = k * 34 * (1 + 0.16 * Math.sin(t * 3 + k * 0.7) + 0.08 * Math.cos(t * 5 - k))
        const x = cx + Math.cos(t) * r * 1.3
        const y = cy + Math.sin(t) * r
        if (a) g.lineTo(x, y)
        else g.moveTo(x, y)
      }
      g.stroke()
    }
  }
  // A river along the bottom edge.
  g.strokeStyle = 'rgba(110, 160, 200, 0.75)'
  g.lineWidth = 26
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(-20, h * 0.93)
  g.bezierCurveTo(w * 0.3, h * 0.82, w * 0.55, h * 1.02, w + 20, h * 0.86)
  g.stroke()
  if (buildings) {
    g.fillStyle = 'rgba(47, 61, 82, 0.28)'
    g.strokeStyle = 'rgba(47, 61, 82, 0.8)'
    g.lineWidth = 2
    for (const b of buildings) {
      for (const ring of b.rings) {
        g.beginPath()
        ring.forEach(([x, y], i) => {
          const p = toWorld(x, y)
          const px = (p.x / SLAB.w + 0.5) * w
          const py = (p.z / SLAB.d + 0.5) * h
          if (i) g.lineTo(px, py)
          else g.moveTo(px, py)
        })
        g.closePath()
        g.fill()
        g.stroke()
      }
    }
  }
  // The frame, the north arrow, and the scale bar.
  g.strokeStyle = INK
  g.lineWidth = 8
  g.strokeRect(28, 28, w - 56, h - 56)
  g.lineWidth = 2
  g.strokeRect(44, 44, w - 88, h - 88)
  const nx = w - 120
  const ny = 130
  g.fillStyle = INK
  g.beginPath()
  g.moveTo(nx, ny - 60)
  g.lineTo(nx + 22, ny + 20)
  g.lineTo(nx, ny + 6)
  g.lineTo(nx - 22, ny + 20)
  g.closePath()
  g.fill()
  g.font = '600 40px Georgia, serif'
  g.textAlign = 'center'
  g.fillText('N', nx, ny + 66)
  for (let i = 0; i < 6; i++) {
    g.fillStyle = i % 2 ? PAPER : INK
    g.fillRect(90 + i * 46, h - 110, 46, 16)
  }
  g.strokeStyle = INK
  g.strokeRect(90, h - 110, 276, 16)
}

const createScene: IslandFactory = (ctx) => {
  const scene = new THREE.Scene()
  scene.environment = ctx.environment
  scene.environmentIntensity = 0.45
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80)
  const lights = sunlight(scene, { sun: '#fff4e2', sky: '#e6f0ff', ground: '#b9ab8f' })
  const mats = materials()
  const world = new THREE.Group()
  scene.add(world)
  const owned: THREE.BufferGeometry[] = []
  const own = <G extends THREE.BufferGeometry>(geometry: G) => { owned.push(geometry); return geometry }
  const ownedMaterials: THREE.Material[] = []
  const ownMaterial = <M extends THREE.Material>(material: M) => { ownedMaterials.push(material); return material }

  // The slab: printed paper on top, card-stock edges.
  const paperCanvas = document.createElement('canvas')
  paperCanvas.width = 1536
  paperCanvas.height = 1152
  paperTexture(null, paperCanvas)
  const paper = new THREE.CanvasTexture(paperCanvas)
  paper.colorSpace = THREE.SRGBColorSpace
  paper.anisotropy = 8
  const paperMaterial = ownMaterial(new THREE.MeshStandardMaterial({ map: paper, roughness: 0.92 }))
  const edge = mats.get('#d8c9a6', { roughness: 0.9 })
  const slab = new THREE.Mesh(own(new THREE.BoxGeometry(SLAB.w, SLAB.t, SLAB.d)), [edge, edge, paperMaterial, edge, edge, edge])
  slab.position.y = -SLAB.t / 2
  slab.receiveShadow = true
  slab.castShadow = true
  world.add(slab)

  // Push pins in the slab's corners.
  const pinHeadGeometry = own(new THREE.SphereGeometry(0.07, 14, 10))
  const pinNeedleGeometry = own(new THREE.CylinderGeometry(0.008, 0.008, 0.12, 6))
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const pushPin = new THREE.Group()
    const head = new THREE.Mesh(pinHeadGeometry, mats.get('#d8443c', { roughness: 0.35 }))
    head.position.y = 0.12
    const point = new THREE.Mesh(pinNeedleGeometry, mats.get('#c9c9c9', { metalness: 0.8, roughness: 0.3 }))
    point.position.y = 0.05
    pushPin.add(head, point)
    pushPin.position.set(x * (SLAB.w / 2 - 0.14), 0, z * (SLAB.d / 2 - 0.14))
    pushPin.traverse((o) => { o.castShadow = true })
    world.add(pushPin)
  }

  // The brass compass on the slab's front right, its needle swinging with the pointer.
  const compass = new THREE.Group()
  const brass = mats.get('#c9a14a', { metalness: 0.85, roughness: 0.3 })
  const compassBase = new THREE.Mesh(own(new THREE.CylinderGeometry(0.34, 0.36, 0.06, 40)), brass)
  compassBase.position.y = 0.03
  const compassFace = new THREE.Mesh(own(new THREE.CylinderGeometry(0.3, 0.3, 0.012, 40)), mats.get('#f5eedc', { roughness: 0.6 }))
  compassFace.position.y = 0.066
  const compassRing = new THREE.Mesh(own(new THREE.TorusGeometry(0.32, 0.03, 10, 48)), brass)
  compassRing.rotation.x = Math.PI / 2
  compassRing.position.y = 0.07
  const needle = new THREE.Group()
  const needleGeometry = own(new THREE.ConeGeometry(0.035, 0.24, 4))
  const needleNorth = new THREE.Mesh(needleGeometry, mats.get('#c0392b', { roughness: 0.4 }))
  needleNorth.rotation.x = -Math.PI / 2
  needleNorth.position.z = -0.12
  const needleSouth = new THREE.Mesh(needleGeometry, mats.get('#f2f2f2', { roughness: 0.4 }))
  needleSouth.rotation.x = Math.PI / 2
  needleSouth.position.z = 0.12
  needle.add(needleNorth, needleSouth)
  needle.position.y = 0.09
  compass.add(compassBase, compassFace, compassRing, needle)
  compass.traverse((o) => { o.castShadow = true })
  compass.position.set(1.75, 0, 1.2)
  world.add(compass)

  // A rolled map lying along the slab's front edge.
  const rollMaterial = ownMaterial(new THREE.MeshStandardMaterial({ map: paper, roughness: 0.9 }))
  const roll = new THREE.Mesh(own(new THREE.CylinderGeometry(0.11, 0.11, 1.5, 24)), rollMaterial)
  roll.rotation.z = Math.PI / 2
  roll.position.set(-1.2, 0.02, SLAB.d / 2 + 0.22)
  roll.castShadow = true
  const ribbon = new THREE.Mesh(own(new THREE.TorusGeometry(0.115, 0.02, 8, 24)), mats.get('#b8432f'))
  ribbon.rotation.y = Math.PI / 2
  ribbon.position.set(-1.2, 0.02, SLAB.d / 2 + 0.22)
  world.add(roll, ribbon)

  // The storage bucket off the slab's back right corner, on its own little plinth.
  const bucket = new THREE.Group()
  const steel = ownMaterial(new THREE.MeshStandardMaterial({ color: '#a9b4c2', metalness: 0.75, roughness: 0.35, side: THREE.DoubleSide }))
  const bucketBody = new THREE.Mesh(own(new THREE.CylinderGeometry(0.34, 0.26, 0.5, 28, 1, true)), steel)
  bucketBody.position.y = 0.25
  const bucketFloor = new THREE.Mesh(own(new THREE.CircleGeometry(0.26, 28)), mats.get('#5c6672', { metalness: 0.5, roughness: 0.5 }))
  bucketFloor.rotation.x = -Math.PI / 2
  bucketFloor.position.y = 0.01
  const handle = new THREE.Mesh(own(new THREE.TorusGeometry(0.34, 0.015, 6, 32, Math.PI)), steel)
  handle.position.y = 0.5
  const plinth = new THREE.Mesh(own(new THREE.BoxGeometry(0.9, 0.16, 0.9)), mats.get('#d8c9a6'))
  plinth.position.y = -0.08
  bucket.add(bucketBody, bucketFloor, handle, plinth)
  bucket.traverse((o) => { o.castShadow = true; o.receiveShadow = true })
  bucket.position.copy(BUCKET)
  world.add(bucket)

  // The output tiles: small glowing squares that arc from the campus into the bucket.
  const tileGeometry = own(new THREE.BoxGeometry(0.12, 0.02, 0.12))
  const tileMaterial = ownMaterial(new THREE.MeshBasicMaterial({ color: '#7fd4ff', toneMapped: false, ...GLOW }))
  const tiles = new THREE.InstancedMesh(tileGeometry, tileMaterial, TILES)
  tiles.frustumCulled = false
  tiles.visible = false
  world.add(tiles)
  const tileFrom = Array.from({ length: TILES }, (_, i) => {
    const random = mulberry32(900 + i)
    return new THREE.Vector3((random() - 0.5) * 2.6, 0.3, (random() - 0.5) * 1.8)
  })

  // The buildings' material: sandstone walls with a darker line at every floor, slate roofs, and a glow on the
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
  const buildingMaterial = ownMaterial(new THREE.MeshStandardMaterial({ color: '#c98f62', roughness: 0.75, flatShading: true }))
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
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.36, 0.46), roof * 0.75);
diffuseColor.rgb *= 1.0 - 0.3 * line;
float lit = max(step(abs(vBuilding - uHover), 0.1), step(abs(vBuilding - uPinned), 0.1));
diffuseColor.rgb = mix(diffuseColor.rgb, uAccent, 0.45 * lit);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += uAccent * 0.35 * max(step(abs(vBuilding - uHover), 0.1), step(abs(vBuilding - uPinned), 0.1));`)
  }
  const depthMaterial = ownMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }))
  depthMaterial.onBeforeCompile = (shader) => riseVertex(shader)

  // The three layers: tinted glass sheets with an ink edge, each holding its own data.
  const sheetGeometry = own(new THREE.PlaneGeometry(SHEET.w, SHEET.d))
  sheetGeometry.rotateX(-Math.PI / 2)
  const sheetEdges = own(new THREE.EdgesGeometry(sheetGeometry))
  const layers = LAYER_HEIGHTS.map((_, i) => {
    const group = new THREE.Group()
    const glass = ownMaterial(new THREE.MeshBasicMaterial({ color: ['#9fd0ff', '#b8f0c8', '#ffe39a'][i], transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }))
    const line = ownMaterial(new THREE.LineBasicMaterial({ color: ['#3d7ab8', '#2f8a52', '#b8862a'][i], transparent: true, opacity: 0.8 }))
    group.add(new THREE.Mesh(sheetGeometry, glass), new THREE.LineSegments(sheetEdges, line))
    world.add(group)
    return { group, glass, line }
  })

  let buildings: Building[] = []
  let campus: THREE.Mesh | null = null
  let campusGeometry: THREE.BufferGeometry | null = null
  const centres: THREE.Vector3[] = []
  const tops: number[] = []
  /** Each building's order in the rise wave, 0 to 1, by distance from the campus centre. */
  let waveOrder: number[] = []
  let points: THREE.Points | null = null
  const outlineMaterial = ownMaterial(new THREE.LineBasicMaterial({ color: '#2f8a52', transparent: true, opacity: 0.9 }))
  const doorMaterial = mats.get('#fff3b0', { emissive: '#ffd34d', emissiveIntensity: 2.4 })
  const doorGeometry = own(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 10))
  const pointUniforms = { uFall: { value: 0 }, uLayer: { value: LAYER_HEIGHTS[0] }, uFade: { value: 1 }, uScale: { value: 600 }, uColor: { value: new THREE.Color('#3d7ab8') } }
  const pointMaterial = ownMaterial(new THREE.ShaderMaterial({
    uniforms: pointUniforms,
    ...GLOW,
    vertexShader: /* glsl */ `
attribute float aDelay;
uniform float uFall;
uniform float uLayer;
uniform float uScale;
varying float vAlpha;
void main() {
  float k = smoothstep(0.0, 1.0, clamp(uFall * 1.6 - aDelay * 0.6, 0.0, 1.0));
  vec3 p = vec3(position.x, mix(uLayer, position.y, k * k), position.z);
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = max(1.5, 0.04 * uScale / -view.z);
  vAlpha = 0.6 + 0.4 * k;
}`,
    fragmentShader: /* glsl */ `
uniform vec3 uColor;
uniform float uFade;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = vAlpha * uFade * (1.0 - smoothstep(0.2, 0.5, d));
  gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.35) * a, a);
}`,
  }))

  // The pin: a red map marker that drops onto the chosen building.
  const pin = new THREE.Group()
  const pinMaterial = mats.get('#e8433a', { emissive: '#e8433a', emissiveIntensity: 0.25, roughness: 0.4 })
  const pinHead = new THREE.Mesh(own(new THREE.SphereGeometry(0.09, 18, 12)), pinMaterial)
  pinHead.position.y = 0.3
  const pinPoint = new THREE.Mesh(own(new THREE.ConeGeometry(0.06, 0.22, 14)), pinMaterial)
  pinPoint.rotation.x = Math.PI
  pinPoint.position.y = 0.16
  const pinDot = new THREE.Mesh(own(new THREE.SphereGeometry(0.032, 10, 8)), mats.get('#ffffff'))
  pinDot.position.set(0, 0.3, 0.08)
  pin.add(pinHead, pinPoint, pinDot)
  pin.traverse((o) => { o.castShadow = true })
  pin.visible = false
  world.add(pin)
  let pinned = -1
  let pinDropAt = -1
  let disposed = false

  fetch('/roles/cmumaps/campus.json')
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
    .then((data: { buildings: Building[] }) => {
      if (disposed) return
      buildings = data.buildings
      const parts: THREE.BufferGeometry[] = []
      const ringPoints: number[] = []
      const outline: number[] = []
      buildings.forEach((b, index) => {
        const height = Math.max(1, b.floors) * FLOOR
        let cx = 0, cz = 0, count = 0
        for (const ring of b.rings) {
          if (ring.length < 3) continue
          const shape = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2((x - CENTRE.x) * METRE, (y - CENTRE.y) * METRE)))
          const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
          geometry.rotateX(-Math.PI / 2)
          geometry.deleteAttribute('uv')
          const n = geometry.getAttribute('position').count
          geometry.setAttribute('aBuilding', new THREE.Float32BufferAttribute(new Float32Array(n).fill(index), 1))
          parts.push(geometry)
          ring.forEach(([x, y], i) => {
            const w = toWorld(x, y)
            const next = toWorld(...ring[(i + 1) % ring.length])
            cx += w.x
            cz += w.z
            count++
            ringPoints.push(w.x, 0.012, w.z)
            outline.push(w.x, 0, w.z, next.x, 0, next.z)
          })
        }
        centres.push(new THREE.Vector3(count ? cx / count : 0, 0, count ? cz / count : 0))
        tops.push(height)
      })
      campusGeometry = mergeGeometries(parts, false)
      parts.forEach((g) => g.dispose())
      if (!campusGeometry) return
      campusGeometry.computeVertexNormals()
      const campusMesh = new THREE.Mesh(campusGeometry, buildingMaterial)
      campusMesh.customDepthMaterial = depthMaterial
      campusMesh.castShadow = true
      campusMesh.receiveShadow = true
      const far = Math.max(...centres.map((c) => Math.hypot(c.x, c.z)))
      waveOrder = centres.map((c) => Math.hypot(c.x, c.z) / far)

      // Layer one: the footprint points, which fall from their sheet onto the slab.
      const random = mulberry32(15000)
      const pointGeometry = own(new THREE.BufferGeometry())
      pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(ringPoints, 3))
      pointGeometry.setAttribute('aDelay', new THREE.Float32BufferAttribute(Array.from({ length: ringPoints.length / 3 }, () => random()), 1))
      const pointCloud = new THREE.Points(pointGeometry, pointMaterial)
      pointCloud.frustumCulled = false
      // Layer two: every footprint's outline, carried by its sheet.
      const outlineLines = new THREE.LineSegments(own(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(outline, 3))), outlineMaterial)
      // Layer three: the entrances, carried by their sheet, which land and light at the doors.
      const doorList = buildings.flatMap((b) => b.entrances)
      const doorMesh = new THREE.InstancedMesh(doorGeometry, doorMaterial, doorList.length)
      const m = new THREE.Matrix4()
      doorList.forEach(([x, y], i) => {
        const w = toWorld(x, y)
        doorMesh.setMatrixAt(i, m.makeTranslation(w.x, 0.008, w.z))
      })
      // The campus, its layers' data, and the printed footprints arrive together once the campus's programs have
      // compiled, so its first frame never waits on a compile.
      return ctx.compile(new THREE.Group().add(campusMesh, pointCloud, outlineLines, doorMesh)).then(() => {
        if (disposed) return
        campus = campusMesh
        points = pointCloud
        world.add(campusMesh, pointCloud)
        layers[1].group.add(outlineLines)
        layers[2].group.add(doorMesh)
        pinned = buildings.findIndex((b) => b.code === START_PIN)
        paperTexture(buildings, paperCanvas)
        paper.needsUpdate = true
        ctx.invalidate()
      })
    })
    .catch((error) => console.warn('[roles] the CMUMaps campus failed to load', error))

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const projected = new THREE.Vector3()
  const tileMatrix = new THREE.Matrix4()
  const tilePosition = new THREE.Vector3()
  const tileQuat = new THREE.Quaternion()
  const tileScale = new THREE.Vector3()
  const tileAxis = new THREE.Vector3(0.3, 1, 0.2).normalize()
  let hovered = -1
  let clock = 0
  let needleYaw = 0

  /** The building a ray from the camera meets first, or -1. The ray tests the rises the frame drew. */
  const pick = (x: number, y: number) => {
    if (!campus || !campusGeometry) return -1
    ndc.set(x, y)
    raycaster.setFromCamera(ndc, camera)
    const hit = raycaster.intersectObject(campus, false)[0]
    if (!hit || hit.face == null) return -1
    return Math.round((campusGeometry.getAttribute('aBuilding') as THREE.BufferAttribute).getX(hit.face.a))
  }

  const view = (f: IslandFrame) => {
    if (f.mode === 'home') return { distance: 9.2 - 0.5 * f.hover, yaw: 0.45 + f.tiltX * 0.3, pitch: 0.5 - f.tiltY * 0.1, focusX: 0.5, focusY: 0.46 }
    const a = f.local('arrival')
    const w = f.local('work')
    const c = f.local('impact')
    const dive = smoother(ramp(a, 0, 0.85))
    const work = smoother(ramp(w, 0, 0.2)) * (1 - smoother(ramp(c, 0, 0.5)))
    const distance = (f.narrow ? 32 : 19) - (f.narrow ? 6 : 5.5) * dive - 1.6 * work + 1.6 * smoother(ramp(c, 0.2, 0.8)) + 0.6 * f.push
    const yaw = 0.45 + 0.6 * dive + 0.8 * w + 0.3 * c + f.tiltX * 0.16 + f.dragYaw
    const pitch = 0.62 - 0.12 * dive + 0.14 * work - f.tiltY * 0.08
    return { distance, yaw, pitch, focusX: f.narrow ? 0.5 : 0.36, focusY: f.narrow ? 0.72 : 0.5 }
  }

  /** A building's label panel, hanging its label 0.2 above the anchor. Reused every frame. */
  const hidden = (): IslandPanel => {
    const at = new THREE.Vector3(0, -50, 0)
    return { center: at, up: new THREE.Vector3(0, 1, 0), halfH: -0.2, corners: [at.clone()], develop: 0, opacity: 0 }
  }
  const panels: IslandPanel[] = []

  return {
    scene,
    camera,
    update(f): IslandOutput {
      clock = f.time
      let busy = false
      const v = view(f)
      world.position.y = 0.1 * f.hover
      for (const { light, base } of lights) light.intensity = base * (1 + 0.2 * f.push)
      frame(camera, TARGET, v.distance, v.yaw, v.pitch, f.aspect, v.focusX, v.focusY)

      // The pipeline replay. The arrival spreads the layers apart. The work act sinks the buildings, drops the
      // point layer (its points rain onto the footprints), then the outline layer, raises the floors, and drops the
      // entrance layer onto the doors.
      const journey = f.mode === 'journey'
      const a = journey ? f.local('arrival') : 1
      const w = journey ? f.local('work') : 0
      const c = journey ? f.local('impact') : 0
      const spread = journey ? smoother(ramp(a, 0.1, 0.8)) : 0.55
      const sink = smoother(ramp(w, 0.02, 0.14))
      const drops = [ramp(w, 0.12, 0.34), ramp(w, 0.3, 0.48), ramp(w, 0.72, 0.88)].map(smoother)
      const build = ramp(w, 0.46, 0.76)
      layers.forEach((layer, i) => {
        layer.group.position.y = LAYER_HEIGHTS[i] * spread * (1 - drops[i]) + 0.02 * drops[i]
        layer.glass.opacity = 0.16 * (1 - drops[i])
        layer.line.opacity = 0.8 * (1 - drops[i])
        layer.group.visible = spread > 0.02 || drops[i] > 0
      })
      outlineMaterial.opacity = 0.9 * (1 - smoother(ramp(w, 0.5, 0.7)))
      if (points) {
        // Until it drops, the point layer carries its points. Once it drops, they rain onto the footprints.
        pointUniforms.uLayer.value = layers[0].group.position.y
        pointUniforms.uFall.value = journey ? ramp(w, 0.14, 0.42) : 0
        pointUniforms.uFade.value = 1 - smoother(ramp(w, 0.55, 0.75))
        pointUniforms.uScale.value = ctx.renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))
        points.visible = spread > 0.02 && pointUniforms.uFade.value > 0.01
      }
      ;(doorMaterial as THREE.MeshStandardMaterial).emissiveIntensity = 0.6 + 2 * (journey ? drops[2] : 1)
      const rises = riseUniform.value
      for (let i = 0; i < centres.length; i++) {
        const up = smoother((build - waveOrder[i] * 0.55) / 0.45)
        rises[i] = Math.max(0.025, sink > 0 ? (1 - sink) + sink * up : 1)
      }

      // The compass needle swings toward the pointer's side and settles north.
      const goal = f.tiltX * 0.9
      const next = ease(needleYaw, goal, f.dt, 0.4)
      if (Math.abs(next - goal) > 1e-3) busy = true
      needleYaw = next
      needle.rotation.y = needleYaw

      // The output tiles arc into the bucket over the close.
      const tilesOn = journey && c > 0.08
      tiles.visible = tilesOn
      if (tilesOn) {
        for (let i = 0; i < TILES; i++) {
          const t = smoother(ramp(c, 0.08 + i * 0.012, 0.4 + i * 0.012))
          const from = tileFrom[i]
          tilePosition.lerpVectors(from, BUCKET, t)
          tilePosition.y = from.y + Math.sin(Math.PI * t) * 1.2 + (BUCKET.y + 0.35 - from.y) * t
          tileQuat.setFromAxisAngle(tileAxis, t * 6 + i)
          tileScale.setScalar(t > 0.98 ? 0.001 : 1)
          tiles.setMatrixAt(i, tileMatrix.compose(tilePosition, tileQuat, tileScale))
        }
        tiles.instanceMatrix.needsUpdate = true
      }

      // Hover names a building, and the pin stands on the chosen one from the work's end.
      const pickable = f.mode === 'home' ? f.hover > 0.5 : sink < 0.01 || build > 0.95
      hovered = f.pointer.inside && pickable ? pick(f.pointer.x, f.pointer.y) : -1
      shared.uHover.value = hovered
      const showPin = journey && (w > 0.85 || c > 0) && pinned >= 0
      pin.visible = showPin
      shared.uPinned.value = showPin ? pinned : -1
      if (showPin) {
        const since = pinDropAt < 0 ? 1 : (clock - pinDropAt) / PIN_S
        const drop = since >= 1 ? 1 : 1 - Math.pow(1 - since, 3) * Math.cos(since * 9)
        if (since < 1) busy = true
        const centre = centres[pinned]
        pin.position.set(centre.x, tops[pinned] * rises[pinned] + 0.6 * (1 - Math.min(1, drop)), centre.z)
      }

      // Panels: one per building, named while it is hovered or pinned. The panel objects persist across frames.
      scene.updateMatrixWorld()
      while (panels.length < buildings.length) panels.push(hidden())
      for (let i = 0; i < buildings.length; i++) {
        const panel = panels[i]
        const named = i === hovered || (showPin && i === pinned && hovered < 0)
        panel.develop = named ? 1 : 0
        panel.opacity = named ? 1 : 0
        if (!named) continue
        world.localToWorld(panel.center.copy(centres[i]).setY(tops[i] * rises[i] + (i === pinned && showPin ? 0.42 : 0.06)))
        panel.corners[0].copy(panel.center)
      }

      projected.copy(TARGET).project(camera)
      const anchors = new Map<string, THREE.Vector3 | null>()
      anchors.set('campus', world.localToWorld(new THREE.Vector3(-0.6, 0.15, 0.4)))
      anchors.set('pin', showPin && pinned >= 0 ? world.localToWorld(centres[pinned].clone().setY(tops[pinned] + 0.3)) : null)
      anchors.set('bucket', journey && c > 0.3 ? world.localToWorld(BUCKET.clone().setY(0.55)) : null)
      return {
        anchors,
        panels,
        bounds: [world.localToWorld(new THREE.Vector3(0, -0.3, SLAB.d / 2 + 0.4))],
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
      disposed = true
      campusGeometry?.dispose()
      owned.forEach((g) => g.dispose())
      ownedMaterials.forEach((m) => m.dispose())
      paper.dispose()
      mats.dispose()
    },
  }
}

export default createScene
