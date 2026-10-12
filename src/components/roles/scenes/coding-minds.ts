/**
 * The Coding Minds Academy world: a cutaway classroom in warm wood and plaster with chalk outlines on its edges. A
 * chalkboard fills the back wall with the lesson's code, and in front of it a live algorithm floats in 3D chalk over
 * the desks: bubble sort as bars, breadth-first search as a grid of tiles, or binary search as a sorted row with its
 * range drawn underneath. Three language books stand in a stack, an ACSL pennant hangs by the window, and the
 * afternoon sun falls through the window onto the floor.
 *
 * On the home page the lesson rests finished, with the bars sorted. On the journey page the arrival writes the board
 * and shuffles the bars into the input, the work act runs the algorithm with the scroll, and the close sweeps the
 * finished result. The work act's choices switch the algorithm, a click on a book switches the board's language, and
 * a click on the board or the bars draws a new input. Every switch erases the board and the chalk and writes them
 * again over SWITCH_S seconds, the only motion that runs on the clock.
 */
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { GLOW, ease, frame, materials, mulberry32, ramp, smoother, sunlight } from '../kit'
import type { IslandFactory, IslandFrame, IslandOutput } from '../types'

/** World point the camera looks at, the room's middle at desk height. */
const TARGET = new THREE.Vector3(0.05, 0.75, 0)
/** Seconds an erase and rewrite takes when the algorithm, the language, or the input changes. */
const SWITCH_S = 0.9
/** The room's floor spans x and z within these half extents, and its walls stand WALL_H tall. */
const ROOM = { x: 1.8, z: 1.3 }
const WALL_H = 2.0
/** The chalkboard's centre and its inner size, on the back wall. */
const BOARD = { x: 0.15, y: 1.18, z: -ROOM.z + 0.07, w: 2.0, h: 1.0 }
/** Where the floating chalk stands: its centre x, its base y, and its depth in front of the board. */
const CHALK = { x: -0.3, y: 0.5, z: -0.6 }
/** Floating chalk pieces per frame at most: a BFS grid of 7 by 4 plus the baseline and two markers. */
const PIECES = 32
const COLS = 7
const ROWS = 4

type Algorithm = 'sort' | 'bfs' | 'search'
const ALGORITHMS: Algorithm[] = ['sort', 'bfs', 'search']
const LANGUAGES = ['Python', 'C++', 'JavaScript'] as const

const CHALK_COLOR = {
  white: new THREE.Color('#f1ece0'),
  yellow: new THREE.Color('#f6d55c'),
  green: new THREE.Color('#a8d8b9'),
  pink: new THREE.Color('#f29bb2'),
  blue: new THREE.Color('#8ec5e8'),
  wall: new THREE.Color('#5d6b63'),
  faint: new THREE.Color('#b9c2ba'),
  dim: new THREE.Color('#7d8a82'),
}

const TITLES: Record<Algorithm, { name: string; cost: string }> = {
  sort: { name: 'bubble sort', cost: 'O(n²)' },
  bfs: { name: 'breadth-first search', cost: 'O(V + E)' },
  search: { name: 'binary search', cost: 'O(log n)' },
}

/** The board's code, per algorithm and language, as chalk lines. Indentation is spaces. */
const CODE: Record<Algorithm, string[][]> = {
  sort: [
    ['def bubble_sort(a):', '  for i in range(len(a)):', '    for j in range(len(a) - 1 - i):', '      if a[j] > a[j + 1]:', '        a[j], a[j + 1] = a[j + 1], a[j]', '  return a'],
    ['void bubble_sort(vector<int>& a) {', '  for (int i = 0; i < n; i++)', '    for (int j = 0; j + 1 < n - i; j++)', '      if (a[j] > a[j + 1])', '        swap(a[j], a[j + 1]);', '}'],
    ['function bubbleSort(a) {', '  for (let i = 0; i < a.length; i++)', '    for (let j = 0; j < a.length - 1 - i; j++)', '      if (a[j] > a[j + 1])', '        [a[j], a[j + 1]] = [a[j + 1], a[j]]', '  return a', '}'],
  ],
  bfs: [
    ['def bfs(grid, start):', '  dist = {start: 0}', '  q = deque([start])', '  while q:', '    cell = q.popleft()', '    for nxt in neighbors(grid, cell):', '      if nxt not in dist:', '        dist[nxt] = dist[cell] + 1', '        q.append(nxt)'],
    ['queue<P> q; q.push(start);', 'dist[start] = 0;', 'while (!q.empty()) {', '  P c = q.front(); q.pop();', '  for (P n : neighbors(c))', '    if (!dist.count(n)) {', '      dist[n] = dist[c] + 1;', '      q.push(n);', '    }', '}'],
    ['const q = [start]', 'const dist = new Map([[start, 0]])', 'while (q.length) {', '  const c = q.shift()', '  for (const n of neighbors(c)) {', '    if (dist.has(n)) continue', '    dist.set(n, dist.get(c) + 1)', '    q.push(n)', '  }', '}'],
  ],
  search: [
    ['def search(a, x):', '  lo, hi = 0, len(a) - 1', '  while lo <= hi:', '    mid = (lo + hi) // 2', '    if a[mid] == x: return mid', '    if a[mid] < x: lo = mid + 1', '    else: hi = mid - 1', '  return -1'],
    ['int search(vector<int>& a, int x) {', '  int lo = 0, hi = a.size() - 1;', '  while (lo <= hi) {', '    int mid = lo + (hi - lo) / 2;', '    if (a[mid] == x) return mid;', '    if (a[mid] < x) lo = mid + 1;', '    else hi = mid - 1;', '  }', '  return -1;', '}'],
    ['function search(a, x) {', '  let lo = 0, hi = a.length - 1', '  while (lo <= hi) {', '    const mid = (lo + hi) >> 1', '    if (a[mid] === x) return mid', '    if (a[mid] < x) lo = mid + 1', '    else hi = mid - 1', '  }', '  return -1', '}'],
  ],
}

const CHALK_FONT = '"Chalkboard SE", "Comic Sans MS", "Segoe Print", cursive'

/** One run of an algorithm on one input, precomputed so a scroll position maps to a state without search. */
interface SortRun { kind: 'sort'; input: number[]; states: number[][]; compare: [number, number][]; swapped: boolean[]; settled: number[] }
interface BfsRun { kind: 'bfs'; walls: Set<number>; start: number; goal: number; dist: Map<number, number>; path: number[]; steps: number }
interface SearchRun { kind: 'search'; values: number[]; target: number; steps: { lo: number; hi: number; mid: number }[] }
type Run = SortRun | BfsRun | SearchRun

const SORT_N = 8
const SEARCH_N = 11

function runSort(seed: number): SortRun {
  const random = mulberry32(seed)
  const input = Array.from({ length: SORT_N }, (_, k) => k)
  for (let k = SORT_N - 1; k > 0; k--) {
    const j = Math.floor(random() * (k + 1))
    ;[input[k], input[j]] = [input[j], input[k]]
  }
  const a = input.slice()
  const states = [a.slice()]
  const compare: [number, number][] = [[0, 0]]
  const swapped = [false]
  const settled = [SORT_N]
  for (let i = 0; i < SORT_N - 1; i++) {
    let any = false
    for (let j = 0; j < SORT_N - 1 - i; j++) {
      const swap = a[j] > a[j + 1]
      if (swap) {
        ;[a[j], a[j + 1]] = [a[j + 1], a[j]]
        any = true
      }
      states.push(a.slice())
      compare.push([j, j + 1])
      swapped.push(swap)
      settled.push(j === SORT_N - 2 - i ? SORT_N - 1 - i : SORT_N - i)
    }
    if (!any) break
  }
  settled[settled.length - 1] = 0
  return { kind: 'sort', input, states, compare, swapped, settled }
}

function runBfs(seed: number): BfsRun {
  const random = mulberry32(seed * 7 + 3)
  const start = Math.floor(random() * ROWS) * COLS
  const goal = Math.floor(random() * ROWS) * COLS + COLS - 1
  for (;;) {
    const walls = new Set<number>()
    while (walls.size < 7) {
      const cell = Math.floor(random() * COLS * ROWS)
      if (cell !== start && cell !== goal && cell % COLS !== 0 && cell % COLS !== COLS - 1) walls.add(cell)
    }
    const dist = new Map<number, number>([[start, 0]])
    const parent = new Map<number, number>()
    const queue = [start]
    while (queue.length) {
      const cell = queue.shift() as number
      const x = cell % COLS
      const y = Math.floor(cell / COLS)
      for (const [dx, dy] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
        const nx = x + dx
        const ny = y + dy
        const next = ny * COLS + nx
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || walls.has(next) || dist.has(next)) continue
        dist.set(next, (dist.get(cell) as number) + 1)
        parent.set(next, cell)
        queue.push(next)
      }
    }
    if (!dist.has(goal)) continue
    const path = [goal]
    while (path[0] !== start) path.unshift(parent.get(path[0]) as number)
    return { kind: 'bfs', walls, start, goal, dist, path, steps: (dist.get(goal) as number) + 1 }
  }
}

function runSearch(seed: number): SearchRun {
  const random = mulberry32(seed * 13 + 5)
  const values = Array.from({ length: SEARCH_N }, (_, k) => k)
  const target = Math.floor(random() * SEARCH_N)
  const steps: { lo: number; hi: number; mid: number }[] = []
  let lo = 0
  let hi = SEARCH_N - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    steps.push({ lo, hi, mid })
    if (values[mid] === target) break
    if (values[mid] < target) lo = mid + 1
    else hi = mid - 1
  }
  return { kind: 'search', values, target, steps }
}

const runFor = (algorithm: Algorithm, seed: number): Run => (algorithm === 'sort' ? runSort(seed) : algorithm === 'bfs' ? runBfs(seed) : runSearch(seed))

/**
 * Merges the meshes and line segments under `root` that share a material (and, for meshes, a shadow flag) into one
 * object each, in root's space, and replaces root's children with them. Source geometries stay untouched. Returns
 * the merged geometries, which the caller disposes.
 */
function bake(root: THREE.Object3D) {
  root.updateMatrixWorld(true)
  const inverse = root.matrixWorld.clone().invert()
  const relative = new THREE.Matrix4()
  const groups = new Map<string, { material: THREE.Material; cast: boolean; lines: boolean; parts: THREE.BufferGeometry[] }>()
  root.traverse((object) => {
    const mesh = object as THREE.Mesh
    const lines = (object as THREE.LineSegments).isLineSegments === true
    if (!mesh.isMesh && !lines) return
    const material = mesh.material as THREE.Material
    const key = `${material.uuid}|${mesh.castShadow}|${lines}`
    let group = groups.get(key)
    if (!group) {
      group = { material, cast: mesh.castShadow, lines, parts: [] }
      groups.set(key, group)
    }
    const part = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()
    for (const name of Object.keys(part.attributes)) if (name !== 'position' && (lines || name !== 'normal') && name !== 'uv') part.deleteAttribute(name)
    if (!lines && part.getAttribute('uv')) part.deleteAttribute('uv')
    part.applyMatrix4(relative.multiplyMatrices(inverse, mesh.matrixWorld))
    group.parts.push(part)
  })
  root.clear()
  const merged: THREE.BufferGeometry[] = []
  for (const { material, cast, lines, parts } of groups.values()) {
    const geometry = mergeGeometries(parts, false)
    parts.forEach((part) => part.dispose())
    if (!geometry) continue
    merged.push(geometry)
    if (lines) {
      root.add(new THREE.LineSegments(geometry, material))
      continue
    }
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = cast
    mesh.receiveShadow = true
    root.add(mesh)
  }
  return merged
}

/** Draws `text` in chalk: a soft second pass a pixel off the first, so strokes read as powder, not ink. */
function chalkText(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string) {
  g.font = `${size}px ${CHALK_FONT}`
  g.fillStyle = color
  g.globalAlpha = 0.45
  g.fillText(text, x + 1.5, y + 1.2)
  g.globalAlpha = 0.92
  g.fillText(text, x, y)
  g.globalAlpha = 1
}

/** Scatters erased pinholes through everything drawn so far, the grain of chalk on slate. */
function grain(g: CanvasRenderingContext2D, width: number, height: number, seed: number, count: number) {
  const random = mulberry32(seed)
  g.globalCompositeOperation = 'destination-out'
  g.fillStyle = 'rgba(0, 0, 0, 0.55)'
  for (let k = 0; k < count; k++) g.fillRect(random() * width, random() * height, 1 + random() * 2, 1 + random() * 1.5)
  g.globalCompositeOperation = 'source-over'
}

const INK_VERTEX = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'

/** The board's chalk: the canvas's ink revealed in reading order, top left first, as uReveal rises from 0 to 1. */
const INK_FRAGMENT = /* glsl */ `
uniform sampler2D uInk;
uniform float uReveal;
varying vec2 vUv;
void main() {
  vec4 ink = texture2D(uInk, vUv);
  float order = vUv.x * 0.35 + (1.0 - vUv.y) * 0.65;
  float shown = 1.0 - smoothstep(uReveal * 1.1 - 0.08, uReveal * 1.1, order);
  float a = ink.a * shown;
  gl_FragColor = vec4(ink.rgb * 0.92, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const SOFT_VERTEX = /* glsl */ `
attribute float aFade;
varying float vFade;
void main() {
  vFade = aFade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

/** The window's sunbeam: warm light added along the shaft, strongest at the window. */
const SOFT_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uLevel;
varying float vFade;
void main() {
  float a = uLevel * vFade;
  gl_FragColor = vec4(uColor * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const DUST_VERTEX = /* glsl */ `
attribute vec3 aAt;
attribute float aAlpha;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec4 view = modelViewMatrix * vec4(aAt, 1.0);
  view.xy += position.xy * 0.035;
  gl_Position = projectionMatrix * view;
  vUv = uv;
  vAlpha = aAlpha;
}`

const DUST_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying float vAlpha;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = vAlpha * (1.0 - smoothstep(0.0, 1.0, d));
  gl_FragColor = vec4(vec3(1.0, 0.88, 0.62) * a, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

const createScene: IslandFactory = (ctx) => {
  const scene = new THREE.Scene()
  scene.environment = ctx.environment
  scene.environmentIntensity = 0.4
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80)
  const lights = sunlight(scene, { sun: '#ffd49a', sky: '#ffe9c4', ground: '#8a6a48' })
  const mats = materials()
  const random = mulberry32(2025)
  const geometries: THREE.BufferGeometry[] = []
  const owned: THREE.Material[] = []
  const textures: THREE.Texture[] = []
  const keep = <G extends THREE.BufferGeometry>(geometry: G) => {
    geometries.push(geometry)
    return geometry
  }
  const world = new THREE.Group()
  scene.add(world)
  const statics = new THREE.Group()

  const unit = keep(new THREE.BoxGeometry(1, 1, 1))
  const unitEdges = keep(new THREE.EdgesGeometry(unit))
  const chalkLine = new THREE.LineBasicMaterial({ color: '#fff7e6', transparent: true, opacity: 0.55 })
  owned.push(chalkLine)
  /** A box of size w by h by d centred at x, y, z, with chalk on its edges unless `bare`. */
  const block = (w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0, bare = false) => {
    const mesh = new THREE.Mesh(unit, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.scale.set(w, h, d)
    mesh.position.set(x, y, z)
    if (!bare) mesh.add(new THREE.LineSegments(unitEdges, chalkLine))
    return mesh
  }
  const wood = mats.get('#b98a5a', { roughness: 0.9 })
  const darkWood = mats.get('#7d5232', { roughness: 0.9 })
  const plaster = mats.get('#efe2c4', { roughness: 1 })

  // The room: plank floor on a thick slab, and the back and left walls with a wainscot and a window.
  statics.add(block(ROOM.x * 2 + 0.1, 0.16, ROOM.z * 2 + 0.1, darkWood, 0, -0.08, 0))
  const planks = ['#c8945e', '#bf8a55', '#cf9c66']
  for (let k = 0, x = -ROOM.x; x < ROOM.x - 0.01; k++, x += 0.24) {
    statics.add(block(0.235, 0.02, ROOM.z * 2, mats.get(planks[k % 3], { roughness: 0.85 }), x + 0.12, 0.01, 0, true))
  }
  statics.add(block(ROOM.x * 2 + 0.1, WALL_H, 0.1, plaster, 0, WALL_H / 2, -ROOM.z - 0.05))
  statics.add(block(ROOM.x * 2 + 0.1, 0.5, 0.03, wood, 0, 0.25, -ROOM.z + 0.015, true))
  statics.add(block(ROOM.x * 2 + 0.1, 0.04, 0.05, darkWood, 0, 0.52, -ROOM.z + 0.025, true))
  const WINDOW = { z0: -0.25, z1: 0.55, y0: 0.8, y1: 1.6 }
  const wallX = -ROOM.x - 0.05
  statics.add(block(0.1, WINDOW.y0, ROOM.z * 2 + 0.1, plaster, wallX, WINDOW.y0 / 2, 0))
  statics.add(block(0.1, WALL_H - WINDOW.y1, ROOM.z * 2 + 0.1, plaster, wallX, (WALL_H + WINDOW.y1) / 2, 0))
  statics.add(block(0.1, WINDOW.y1 - WINDOW.y0, WINDOW.z0 + ROOM.z + 0.05, plaster, wallX, (WINDOW.y0 + WINDOW.y1) / 2, (WINDOW.z0 - ROOM.z - 0.05) / 2))
  statics.add(block(0.1, WINDOW.y1 - WINDOW.y0, ROOM.z + 0.05 - WINDOW.z1, plaster, wallX, (WINDOW.y0 + WINDOW.y1) / 2, (WINDOW.z1 + ROOM.z + 0.05) / 2))
  statics.add(block(0.03, 0.5, ROOM.z * 2, wood, -ROOM.x + 0.015, 0.25, 0, true))
  statics.add(block(0.05, 0.04, ROOM.z * 2, darkWood, -ROOM.x + 0.025, 0.52, 0, true))
  const sill = mats.get('#f6efe0', { roughness: 0.9 })
  statics.add(block(0.16, 0.04, WINDOW.z1 - WINDOW.z0 + 0.12, sill, -ROOM.x + 0.03, WINDOW.y0 - 0.02, (WINDOW.z0 + WINDOW.z1) / 2))
  statics.add(block(0.06, 0.035, WINDOW.z1 - WINDOW.z0, sill, wallX, (WINDOW.y0 + WINDOW.y1) / 2, (WINDOW.z0 + WINDOW.z1) / 2, true))
  statics.add(block(0.06, WINDOW.y1 - WINDOW.y0, 0.035, sill, wallX, (WINDOW.y0 + WINDOW.y1) / 2, (WINDOW.z0 + WINDOW.z1) / 2, true))
  statics.add(block(0.06, 0.04, WINDOW.z1 - WINDOW.z0 + 0.06, sill, wallX, WINDOW.y1 + 0.02, (WINDOW.z0 + WINDOW.z1) / 2, true))

  // The chalkboard: a dark slate in a wooden frame with a tray of chalk, and the lesson's chalk on a canvas.
  const slate = mats.get('#2e4a3c', { roughness: 0.97 })
  statics.add(block(BOARD.w + 0.14, BOARD.h + 0.14, 0.05, darkWood, BOARD.x, BOARD.y, BOARD.z - 0.01))
  statics.add(block(BOARD.w, BOARD.h, 0.02, slate, BOARD.x, BOARD.y, BOARD.z + 0.02, true))
  statics.add(block(BOARD.w + 0.1, 0.03, 0.09, darkWood, BOARD.x, BOARD.y - BOARD.h / 2 - 0.06, BOARD.z + 0.05))
  const stick = keep(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6).rotateZ(Math.PI / 2))
  for (const [x, color] of [[-0.6, '#f4efe2'], [-0.45, '#f6d55c'], [-0.38, '#f29bb2'], [0.7, '#8ec5e8']] as const) {
    const piece = new THREE.Mesh(stick, mats.get(color, { roughness: 1 }))
    piece.position.set(BOARD.x + x, BOARD.y - BOARD.h / 2 - 0.03, BOARD.z + 0.06)
    piece.castShadow = true
    statics.add(piece)
  }
  statics.add(block(0.14, 0.045, 0.06, mats.get('#3d3a52'), BOARD.x + 0.45, BOARD.y - BOARD.h / 2 - 0.023, BOARD.z + 0.06))

  const ink = document.createElement('canvas')
  ink.width = 1600
  ink.height = 800
  const inkContext = ink.getContext('2d')
  const inkTexture = new THREE.CanvasTexture(ink)
  inkTexture.colorSpace = THREE.SRGBColorSpace
  inkTexture.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy())
  textures.push(inkTexture)
  const inkUniforms = { uInk: { value: inkTexture as THREE.Texture }, uReveal: { value: 1 } }
  const inkMaterial = new THREE.ShaderMaterial({ uniforms: inkUniforms, vertexShader: INK_VERTEX, fragmentShader: INK_FRAGMENT, transparent: true, depthWrite: false })
  owned.push(inkMaterial)
  const inkPlane = new THREE.Mesh(keep(new THREE.PlaneGeometry(BOARD.w, BOARD.h)), inkMaterial)
  inkPlane.position.set(BOARD.x, BOARD.y, BOARD.z + 0.032)
  world.add(inkPlane)

  /** Redraws the board's chalk for an algorithm in a language. Runs on a switch, never per frame. */
  const writeBoard = (algorithm: Algorithm, language: number) => {
    const g = inkContext
    if (!g) return
    g.clearRect(0, 0, ink.width, ink.height)
    const smudge = mulberry32(31)
    for (let k = 0; k < 14; k++) {
      g.fillStyle = `rgba(255, 255, 255, ${0.03 + smudge() * 0.04})`
      g.beginPath()
      g.ellipse(smudge() * 1600, smudge() * 800, 120 + smudge() * 220, 30 + smudge() * 50, (smudge() - 0.5) * 0.4, 0, Math.PI * 2)
      g.fill()
    }
    const title = TITLES[algorithm]
    chalkText(g, title.name, 60, 108, 74, '#f6d55c')
    chalkText(g, `${LANGUAGES[language].toLowerCase()} · ${title.cost}`, 66, 176, 44, '#f4a7b9')
    g.strokeStyle = 'rgba(244, 239, 226, 0.5)'
    g.lineWidth = 4
    g.beginPath()
    g.moveTo(812, 70)
    g.lineTo(808, 740)
    g.stroke()
    const lines = CODE[algorithm][language]
    const size = lines.length > 8 ? 34 : 38
    const step = lines.length > 8 ? 62 : 74
    chalkText(g, language === 0 ? '# lab' : '// lab', 850, 92, size, '#9ccbe8')
    lines.forEach((line, k) => chalkText(g, line, 850, 92 + step * (k + 1), size, '#f3efe4'))
    grain(g, ink.width, ink.height, 77, 9000)
    inkTexture.needsUpdate = true
  }

  // The desks: two rows of three facing the board, each with a chair, a notebook, and a pencil. Four seats are taken.
  const deskTop = mats.get('#d6a86e', { roughness: 0.8 })
  const legs = mats.get('#6a4a33')
  const paper = mats.get('#fbf6ea', { roughness: 1 })
  const shirts = ['#e26d5a', '#4f8fd6', '#f2b84b', '#6fbf8a', '#9b7fd1', '#e98bb5']
  const skins = ['#f1d2b4', '#c99a72', '#e8c4a0', '#9b6b4b']
  const headGeometry = keep(new THREE.IcosahedronGeometry(0.07, 1))
  const hairGeometry = keep(new THREE.SphereGeometry(0.074, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2))
  const bodyGeometry = keep(new THREE.CylinderGeometry(0.06, 0.085, 0.2, 8))
  const pencil = keep(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6).rotateZ(Math.PI / 2))
  const desks: THREE.Vector3[] = []
  for (const z of [-0.08, 0.5]) for (const x of [-0.95, -0.2, 0.55]) desks.push(new THREE.Vector3(x, 0, z))
  desks.forEach((at, k) => {
    statics.add(block(0.4, 0.03, 0.26, deskTop, at.x, 0.36, at.z))
    for (const [dx, dz] of [[-0.17, -0.1], [0.17, -0.1], [-0.17, 0.1], [0.17, 0.1]]) statics.add(block(0.025, 0.35, 0.025, legs, at.x + dx, 0.175, at.z + dz, true))
    statics.add(block(0.16, 0.012, 0.11, paper, at.x - 0.05, 0.381, at.z + 0.01, true))
    const p = new THREE.Mesh(pencil, mats.get('#f2c14e'))
    p.position.set(at.x + 0.09, 0.384, at.z + 0.02)
    p.rotation.y = 0.5
    statics.add(p)
    const chairZ = at.z + 0.26
    statics.add(block(0.2, 0.025, 0.18, wood, at.x, 0.22, chairZ))
    statics.add(block(0.2, 0.2, 0.02, wood, at.x, 0.33, chairZ + 0.09))
    for (const [dx, dz] of [[-0.08, -0.07], [0.08, -0.07], [-0.08, 0.07], [0.08, 0.07]]) statics.add(block(0.02, 0.21, 0.02, legs, at.x + dx, 0.105, chairZ + dz, true))
    if (k === 2 || k === 4) return
    const body = new THREE.Mesh(bodyGeometry, mats.get(shirts[k % shirts.length]))
    body.position.set(at.x, 0.335, chairZ - 0.01)
    const head = new THREE.Mesh(headGeometry, mats.get(skins[k % skins.length]))
    head.position.set(at.x, 0.5, chairZ - 0.02)
    const hair = new THREE.Mesh(hairGeometry, mats.get(k % 2 ? '#3b2a20' : '#1f1a17'))
    hair.position.set(at.x, 0.505, chairZ - 0.015)
    hair.rotation.x = 0.25
    for (const m of [body, head, hair]) { m.castShadow = true; statics.add(m) }
    if (k === 3) {
      const arm = block(0.035, 0.22, 0.035, mats.get(shirts[k % shirts.length]), at.x + 0.08, 0.53, chairZ - 0.03, true)
      arm.rotation.z = -0.25
      statics.add(arm)
      const hand = new THREE.Mesh(headGeometry, mats.get(skins[k % skins.length]))
      hand.scale.setScalar(0.35)
      hand.position.set(at.x + 0.11, 0.65, chairZ - 0.03)
      statics.add(hand)
    }
  })
  statics.add(block(2.3, 0.008, 1.3, mats.get('#c9604a', { roughness: 1 }), -0.2, 0.024, 0.22, true))

  // A plant in the back corner, and the ACSL pennant on the left wall.
  statics.add(block(0.2, 0.22, 0.2, mats.get('#c4693f'), -ROOM.x + 0.25, 0.11, -ROOM.z + 0.25))
  const leaf = keep(new THREE.IcosahedronGeometry(0.13, 0))
  for (let k = 0; k < 6; k++) {
    const m = new THREE.Mesh(leaf, mats.get(k % 2 ? '#5f9a4e' : '#4f8a45'))
    const angle = (k / 6) * Math.PI * 2
    m.position.set(-ROOM.x + 0.25 + Math.cos(angle) * 0.09, 0.32 + (k % 3) * 0.09, -ROOM.z + 0.25 + Math.sin(angle) * 0.09)
    m.scale.set(0.8, 1.2, 0.8)
    m.castShadow = true
    statics.add(m)
  }
  /** Painted labels, kept so they repaint once the display font has loaded. */
  const paints: (() => void)[] = []
  const label = (text: string, background: string, color: string, width: number, height: number, size: number, pennant = false) => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy())
    textures.push(texture)
    const paint = () => {
      const g = canvas.getContext('2d')
      if (!g) return
      g.clearRect(0, 0, width, height)
      g.fillStyle = background
      if (pennant) {
        g.beginPath()
        g.moveTo(0, 0)
        g.lineTo(width, height / 2)
        g.lineTo(0, height)
        g.closePath()
        g.fill()
      } else g.fillRect(0, 0, width, height)
      g.fillStyle = color
      g.font = `700 ${size}px "Space Grotesk", "Helvetica Neue", Arial, sans-serif`
      g.textBaseline = 'middle'
      g.fillText(text, pennant ? width * 0.1 : width * 0.08, height / 2)
      texture.needsUpdate = true
    }
    paint()
    paints.push(paint)
    return texture
  }
  const pennantMaterial = new THREE.MeshStandardMaterial({ map: label('ACSL', '#8f2d3a', '#f6e7c8', 512, 256, 96, true), transparent: true, alphaTest: 0.5, roughness: 1, side: THREE.DoubleSide })
  owned.push(pennantMaterial)
  const pennant = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.72, 0.36)), pennantMaterial)
  pennant.position.set(-ROOM.x + 0.012, 1.35, -0.8)
  pennant.rotation.set(0, Math.PI / 2, -0.12)
  pennant.castShadow = true
  world.add(pennant)
  statics.add(block(0.03, 0.03, 0.04, darkWood, -ROOM.x + 0.02, 1.53, -0.8 - 0.36 * 0.98 * 0.5 + 0.02, true))

  // The language books: three tall books stacked by the desks, spines out, each with its name.
  const BOOKS = [
    { cover: '#3b6fa8', ink: '#ffd84a', w: 0.66, h: 0.18, d: 0.46 },
    { cover: '#5b4c9e', ink: '#ffffff', w: 0.62, h: 0.17, d: 0.44 },
    { cover: '#f0d43a', ink: '#2b2622', w: 0.58, h: 0.16, d: 0.42 },
  ]
  const STACK = new THREE.Vector3(1.28, 0, 0.62)
  const stackTurn = 0.55
  const books = BOOKS.map((spec, k) => {
    const group = new THREE.Group()
    const y = BOOKS.slice(0, k).reduce((sum, b) => sum + b.h, 0) + spec.h / 2
    group.position.set(STACK.x, y, STACK.z)
    group.rotation.y = stackTurn + (k - 1) * 0.12
    const cover = mats.get(spec.cover, { roughness: 0.75 })
    group.add(block(spec.w, spec.h, spec.d, cover))
    group.add(block(spec.w - 0.03, spec.h - 0.03, spec.d - 0.02, paper, 0, 0, -0.012, true))
    const spineMaterial = new THREE.MeshStandardMaterial({ map: label(LANGUAGES[k], spec.cover, spec.ink, 512, 112, 72), roughness: 0.8 })
    owned.push(spineMaterial)
    const spine = new THREE.Mesh(keep(new THREE.PlaneGeometry(spec.w * 0.96, spec.h * 0.8)), spineMaterial)
    spine.position.z = spec.d / 2 + 0.002
    group.add(spine)
    group.traverse((o) => { o.castShadow = true })
    world.add(group)
    return { group, rest: group.position.clone(), turn: group.rotation.y, slide: 0 }
  })

  // The window's light: a shaft from the window to a bright patch on the floor, and dust in it.
  const sun = new THREE.Vector3(1.0, -0.62, 0.32).normalize()
  const shaftCorners = [
    new THREE.Vector3(-ROOM.x, WINDOW.y1, WINDOW.z0), new THREE.Vector3(-ROOM.x, WINDOW.y1, WINDOW.z1),
    new THREE.Vector3(-ROOM.x, WINDOW.y0, WINDOW.z1), new THREE.Vector3(-ROOM.x, WINDOW.y0, WINDOW.z0),
  ]
  const toFloor = (p: THREE.Vector3) => p.clone().addScaledVector(sun, (p.y - 0.03) / -sun.y)
  const floorCorners = shaftCorners.map(toFloor)
  const shaftPositions: number[] = []
  const shaftFade: number[] = []
  for (let k = 0; k < 4; k++) {
    const a = shaftCorners[k]
    const b = shaftCorners[(k + 1) % 4]
    const c = floorCorners[(k + 1) % 4]
    const d = floorCorners[k]
    shaftPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z)
    shaftFade.push(1, 1, 0.25, 1, 0.25, 0.25)
  }
  const [p0, p1, p2, p3] = floorCorners
  shaftPositions.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z)
  shaftFade.push(1.4, 1.4, 1.4, 1.4, 1.4, 1.4)
  const shaftGeometry = keep(new THREE.BufferGeometry())
  shaftGeometry.setAttribute('position', new THREE.Float32BufferAttribute(shaftPositions, 3))
  shaftGeometry.setAttribute('aFade', new THREE.Float32BufferAttribute(shaftFade, 1))
  const shaftUniforms = { uColor: { value: new THREE.Color('#ffcf8a') }, uLevel: { value: 0.12 } }
  const shaftMaterial = new THREE.ShaderMaterial({ uniforms: shaftUniforms, vertexShader: SOFT_VERTEX, fragmentShader: SOFT_FRAGMENT, side: THREE.DoubleSide, ...GLOW })
  owned.push(shaftMaterial)
  world.add(new THREE.Mesh(shaftGeometry, shaftMaterial))
  const MOTES = 28
  const moteAt = new Float32Array(MOTES * 3)
  const moteAlpha = new Float32Array(MOTES)
  const quad = keep(new THREE.PlaneGeometry(1, 1))
  const moteGeometry = keep(new THREE.InstancedBufferGeometry())
  moteGeometry.index = quad.index
  moteGeometry.setAttribute('position', quad.getAttribute('position'))
  moteGeometry.setAttribute('uv', quad.getAttribute('uv'))
  const moteAtAttribute = new THREE.InstancedBufferAttribute(moteAt, 3).setUsage(THREE.DynamicDrawUsage)
  const moteAlphaAttribute = new THREE.InstancedBufferAttribute(moteAlpha, 1).setUsage(THREE.DynamicDrawUsage)
  moteGeometry.setAttribute('aAt', moteAtAttribute)
  moteGeometry.setAttribute('aAlpha', moteAlphaAttribute)
  moteGeometry.instanceCount = MOTES
  const moteMaterial = new THREE.ShaderMaterial({ vertexShader: DUST_VERTEX, fragmentShader: DUST_FRAGMENT, ...GLOW })
  owned.push(moteMaterial)
  const motes = new THREE.Mesh(moteGeometry, moteMaterial)
  motes.frustumCulled = false
  world.add(motes)
  const moteSeeds = Array.from({ length: MOTES }, () => ({ t: random(), u: random(), v: random(), phase: random() * 6 }))

  // Paper planes looping over the desks.
  const planeGeometry = keep(new THREE.BufferGeometry())
  planeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0.13, -0.09, 0.01, -0.09, 0, 0, -0.09,
    0, 0, 0.13, 0, 0, -0.09, 0.09, 0.01, -0.09,
    0, 0, 0.13, 0, 0, -0.09, 0, -0.035, -0.07,
  ], 3))
  planeGeometry.computeVertexNormals()
  const planeMaterial = new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.9, side: THREE.DoubleSide, flatShading: true })
  owned.push(planeMaterial)
  const planes = [{ radius: 0.85, y: 1.75, phase: 0, speed: 1, cx: 0.1, cz: 0.05 }, { radius: 0.6, y: 1.55, phase: 2.6, speed: -1.3, cx: 0.5, cz: 0.35 }].map((spec) => {
    const mesh = new THREE.Mesh(planeGeometry, planeMaterial)
    mesh.castShadow = true
    world.add(mesh)
    return { ...spec, mesh }
  })

  geometries.push(...bake(statics))
  world.add(statics)
  let disposed = false
  document.fonts?.ready.then(() => {
    if (disposed) return
    paints.forEach((paint) => paint())
    ctx.invalidate()
  })

  // The floating chalk: one instanced box per bar, tile, baseline, or marker.
  const chalkMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true })
  owned.push(chalkMaterial)
  const pieces = new THREE.InstancedMesh(unit, chalkMaterial, PIECES)
  pieces.castShadow = true
  pieces.receiveShadow = true
  pieces.frustumCulled = false
  for (let k = 0; k < PIECES; k++) pieces.setColorAt(k, CHALK_COLOR.white)
  world.add(pieces)

  // Pick targets as boxes in `world` space: the three books, then the board and the chalk, which both draw a new
  // input. Nothing here carries a label, since the spines, the pennant, and the board already print their names.
  const targets = [
    ...books.map((b, k) => new THREE.Matrix4().compose(b.rest, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.turn, 0)), new THREE.Vector3(BOOKS[k].w, BOOKS[k].h + 0.01, BOOKS[k].d))),
    new THREE.Matrix4().compose(new THREE.Vector3(BOARD.x, BOARD.y, BOARD.z), new THREE.Quaternion(), new THREE.Vector3(BOARD.w + 0.14, BOARD.h + 0.14, 0.12)),
    new THREE.Matrix4().compose(new THREE.Vector3(CHALK.x, CHALK.y + 0.45, CHALK.z), new THREE.Quaternion(), new THREE.Vector3(1.4, 0.95, 0.35)),
  ]
  const UNIT_BOX = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5))
  const pickWorld = new THREE.Matrix4()
  const pickInverse = new THREE.Matrix4()
  const pickRay = new THREE.Ray()
  const pickHit = new THREE.Vector3()

  // State: what the board shows, what was last asked for, and the erase and rewrite between them.
  const shown = { algorithm: 'sort' as Algorithm, language: 0, seed: 1 }
  const wanted = { ...shown }
  let run: Run = runFor(shown.algorithm, shown.seed)
  let switchAt = -1
  /** True while a switch changes the board's writing, the algorithm or the language, not only the input. */
  let rewriting = false
  writeBoard(shown.algorithm, shown.language)
  const request = (rewrite: boolean) => {
    if (switchAt < 0) switchAt = ctx.now()
    rewriting = rewriting || rewrite
    ctx.invalidate()
  }

  // Output, allocated once and rewritten in place each frame.
  const anchorPoints = { books: new THREE.Vector3(), chalk: new THREE.Vector3() }
  const anchors = new Map<string, THREE.Vector3 | null>(Object.entries(anchorPoints))
  const boundsLocal = [new THREE.Vector3(ROOM.x, -0.16, ROOM.z), new THREE.Vector3(-ROOM.x, -0.16, ROOM.z)]
  const bounds = boundsLocal.map(() => new THREE.Vector3())
  const output: IslandOutput = { anchors, panels: [], bounds, focusY: 0.5, busy: false, ready: true }
  const chalkAnchor = new THREE.Vector3(CHALK.x, CHALK.y + 0.5, CHALK.z)

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const matrix = new THREE.Matrix4()
  const quaternion = new THREE.Quaternion()
  const at = new THREE.Vector3()
  const size = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const edgeA = new THREE.Vector3()
  const edgeB = new THREE.Vector3()
  const hoverGlow = new Float32Array(targets.length)
  const view = { distance: 0, yaw: 0, pitch: 0, focusX: 0.5, focusY: 0.5 }
  let hovered = -1
  let wasJourney = false
  let written = 1
  let erase = 1

  /** The target a ray from the camera through `x`, `y` meets first, or -1. */
  const pick = (x: number, y: number) => {
    ndc.set(x, y)
    raycaster.setFromCamera(ndc, camera)
    let best = -1
    let nearest = Infinity
    for (let k = 0; k < targets.length; k++) {
      pickWorld.multiplyMatrices(world.matrixWorld, targets[k])
      pickInverse.copy(pickWorld).invert()
      pickRay.copy(raycaster.ray).applyMatrix4(pickInverse)
      if (!pickRay.intersectBox(UNIT_BOX, pickHit)) continue
      const distance = pickHit.applyMatrix4(pickWorld).distanceToSquared(raycaster.ray.origin)
      if (distance < nearest) {
        nearest = distance
        best = k
      }
    }
    return best
  }

  const frameView = (f: IslandFrame) => {
    if (f.mode === 'home') {
      view.distance = 8.4 - 0.4 * f.hover
      view.yaw = 0.62 + f.tiltX * 0.26
      view.pitch = 0.46 - f.tiltY * 0.1
      view.focusX = 0.5
      view.focusY = 0.5
      return view
    }
    const a = f.local('arrival')
    const w = f.local('work')
    const c = f.local('impact')
    const dive = smoother(ramp(a, 0, 0.8))
    const close = smoother(ramp(w, 0, 0.3)) * (1 - smoother(ramp(c, 0.1, 0.6)))
    view.distance = (f.narrow ? 30 : 18) - (f.narrow ? 6 : 5.5) * dive - 0.6 * close + 1.6 * smoother(ramp(c, 0.2, 0.8)) + 0.6 * f.push
    view.yaw = 0.3 + 0.3 * dive + 0.12 * w + 0.2 * c + f.tiltX * 0.16 + f.dragYaw
    view.pitch = 0.62 - 0.16 * dive + 0.04 * close - f.tiltY * 0.08
    view.focusX = f.narrow ? 0.5 : 0.36
    view.focusY = f.narrow ? 0.7 : 0.5
    return view
  }

  /** Writes piece k: a box of size `s` centred at `p`, coloured `color`. A zero size hides it. */
  const setPiece = (k: number, p: THREE.Vector3, s: THREE.Vector3, color: THREE.Color) => {
    pieces.setMatrixAt(k, matrix.compose(p, quaternion.identity(), s))
    pieces.setColorAt(k, color)
  }
  /** Piece k of n's scale: the arrival draws the pieces in one after another, and a switch erases and redraws. */
  const grow = (k: number, n: number) => Math.max(1e-4, smoother(written * (n + 3) - k * 0.9 - 1) * erase)
  const tint = new THREE.Color()

  return {
    scene,
    camera,
    update(f): IslandOutput {
      let busy = false
      const atHome = f.mode === 'home'
      // Back on the home page the lesson returns to its defaults, which the journey's choices start from.
      if (atHome && wasJourney && (shown.algorithm !== 'sort' || shown.language !== 0 || shown.seed !== 1)) {
        Object.assign(wanted, { algorithm: 'sort', language: 0, seed: 1 })
        Object.assign(shown, wanted)
        run = runFor(shown.algorithm, shown.seed)
        writeBoard(shown.algorithm, shown.language)
        switchAt = -1
        rewriting = false
      }
      wasJourney = !atHome
      const v = frameView(f)
      world.position.y = 0.1 * f.hover
      for (let k = 0; k < lights.length; k++) lights[k].light.intensity = lights[k].base * (1 + 0.2 * f.push)
      frame(camera, TARGET, v.distance, v.yaw, v.pitch, f.aspect, v.focusX, v.focusY)
      scene.updateMatrixWorld()

      const a = atHome ? 1 : f.local('arrival')
      const w = atHome ? 1 : f.local('work')
      const c = atHome ? 1 : f.local('impact')
      const flow = (atHome ? 0.4 : a * 1.2 + w * 2 + c * 1.2) + f.tiltX * 0.25 + f.tiltY * 0.12 + f.dragYaw * 0.4

      // An erase and rewrite: the chalk wipes away, the new state is applied at the midpoint, and it writes back.
      erase = 1
      if (switchAt >= 0) {
        const phase = (ctx.now() - switchAt) / SWITCH_S
        busy = true
        if (phase >= 0.5 && (shown.algorithm !== wanted.algorithm || shown.language !== wanted.language || shown.seed !== wanted.seed)) {
          const rerun = shown.algorithm !== wanted.algorithm || shown.seed !== wanted.seed
          const rewrite = shown.algorithm !== wanted.algorithm || shown.language !== wanted.language
          shown.algorithm = wanted.algorithm
          shown.language = wanted.language
          shown.seed = wanted.seed
          if (rerun) run = runFor(shown.algorithm, shown.seed)
          if (rewrite) writeBoard(shown.algorithm, shown.language)
        }
        erase = phase < 0.5 ? 1 - smoother(phase * 2) : smoother((phase - 0.5) * 2)
        if (phase >= 1) {
          switchAt = -1
          rewriting = false
          erase = 1
        }
      }
      written = atHome ? 1 : smoother(ramp(a, 0.05, 0.6))
      inkUniforms.uReveal.value = written * (rewriting ? erase : 1)

      // A hovered book leans out of the stack, and the chosen one stands out of it.
      hovered = f.pointer.inside && (atHome ? f.hover > 0.5 : true) ? pick(f.pointer.x, f.pointer.y) : -1
      for (let k = 0; k < targets.length; k++) {
        const next = ease(hoverGlow[k], hovered === k ? 1 : 0, f.dt, 0.12)
        if (next !== hoverGlow[k]) busy = true
        hoverGlow[k] = next
      }
      for (let k = 0; k < books.length; k++) {
        const book = books[k]
        const goal = (k === wanted.language && !atHome ? 1 : 0) + hoverGlow[k] * 0.35
        const next = ease(book.slide, goal, f.dt, 0.14)
        if (next !== book.slide) busy = true
        book.slide = next
        forward.set(Math.sin(book.turn), 0, Math.cos(book.turn))
        book.group.position.copy(book.rest).addScaledVector(forward, 0.14 * next)
        book.group.rotation.set(-0.06 * next, book.turn + 0.1 * next, 0)
      }

      // The floating chalk, by algorithm.
      const progress = atHome ? 1 : ramp(w, 0.1, 0.86)
      const sweep = atHome ? -1 : ramp(c, 0.05, 0.55) * (SORT_N + 2) - 1
      let used = 0
      if (run.kind === 'sort') {
        const steps = run.states.length - 1
        const s = progress * steps
        const k0 = Math.min(steps - 1, Math.floor(s))
        const fStep = s >= steps ? 1 : s - k0
        const before = run.states[k0]
        const after = run.states[Math.min(steps, k0 + 1)]
        // The arrival shuffles the bars from their sorted order, the home pose, into the input.
        const shuffle = atHome ? 0 : smoother(ramp(a, 0.55, 0.95))
        const e = smoother(fStep)
        for (let bar = 0; bar < SORT_N; bar++) {
          const from = before.indexOf(bar)
          const to = after.indexOf(bar)
          let slot = from + (to - from) * e
          let lift = from !== to ? Math.sin(Math.PI * e) * 0.16 * (to > from ? 1 : -1) : 0
          if (atHome) {
            slot = bar
            lift = 0
          } else if (w <= 0) {
            slot = bar + (run.input.indexOf(bar) - bar) * shuffle
            lift = Math.sin(Math.PI * shuffle) * 0.2 * ((bar % 2) * 2 - 1)
          }
          const height = 0.16 + bar * 0.085
          const g = grow(bar, SORT_N)
          at.set(CHALK.x + (slot - (SORT_N - 1) / 2) * 0.17, CHALK.y + 0.03 + (height * g) / 2, CHALK.z + lift)
          const pair = run.compare[Math.min(steps, k0 + 1)]
          const compared = !atHome && w > 0 && s < steps && (pair[0] === from || pair[1] === from) && fStep > 0.02 && fStep < 0.98
          const settled = atHome || s >= steps || slot >= run.settled[Math.min(steps, k0 + 1)] - 0.01
          tint.copy(compared ? CHALK_COLOR.yellow : settled ? CHALK_COLOR.green : CHALK_COLOR.white)
          if (sweep >= 0) tint.lerp(CHALK_COLOR.yellow, Math.max(0, 1 - Math.abs(sweep - slot)))
          setPiece(used++, at, size.set(0.12, height * g, 0.12), tint)
        }
        setPiece(used++, at.set(CHALK.x, CHALK.y, CHALK.z), size.set(1.45 * Math.max(1e-4, erase * written), 0.025, 0.05), CHALK_COLOR.white)
      } else if (run.kind === 'bfs') {
        const s = progress * (run.steps + 2)
        const frontier = Math.floor(s)
        const pathShown = s - run.steps
        for (let cell = 0; cell < COLS * ROWS; cell++) {
          const d = run.dist.get(cell)
          const visited = d !== undefined && d <= s
          const onPath = run.path.indexOf(cell)
          let color = CHALK_COLOR.faint
          let scale = 0.45
          if (run.walls.has(cell)) { color = CHALK_COLOR.wall; scale = 1 }
          else if (cell === run.start) { color = CHALK_COLOR.blue; scale = 1 }
          else if (cell === run.goal) { color = CHALK_COLOR.pink; scale = visited ? 1 : 0.8 }
          else if (onPath >= 0 && pathShown > onPath / run.path.length) { color = CHALK_COLOR.pink; scale = 1 }
          else if (visited) { color = d === frontier ? CHALK_COLOR.yellow : CHALK_COLOR.white; scale = 0.6 + 0.4 * Math.min(1, (s - (d ?? 0)) * 2) }
          const g = grow(cell, COLS * ROWS)
          at.set(CHALK.x + ((cell % COLS) - (COLS - 1) / 2) * 0.19, CHALK.y + 0.22 + (ROWS - 1 - Math.floor(cell / COLS)) * 0.19, CHALK.z)
          setPiece(used++, at, size.set(0.16 * scale * g, 0.16 * scale * g, 0.04), color)
        }
      } else {
        const steps = run.steps.length
        const s = progress * (steps + 1)
        const step = run.steps[Math.min(steps - 1, Math.floor(s))]
        const found = s >= steps
        for (let bar = 0; bar < SEARCH_N; bar++) {
          const height = 0.12 + bar * 0.06
          const g = grow(bar, SEARCH_N)
          let color = bar >= step.lo && bar <= step.hi ? CHALK_COLOR.white : CHALK_COLOR.dim
          if (bar === step.mid && s > 0.02) color = found && bar === run.target ? CHALK_COLOR.pink : CHALK_COLOR.yellow
          at.set(CHALK.x + (bar - (SEARCH_N - 1) / 2) * 0.125, CHALK.y + 0.03 + (height * g) / 2, CHALK.z)
          setPiece(used++, at, size.set(0.085, height * g, 0.085), color)
        }
        const left = CHALK.x + (step.lo - (SEARCH_N - 1) / 2) * 0.125 - 0.05
        const right = CHALK.x + (step.hi - (SEARCH_N - 1) / 2) * 0.125 + 0.05
        const drawn = erase * written
        setPiece(used++, at.set((left + right) / 2, CHALK.y, CHALK.z + 0.02), size.set(Math.max(1e-4, (right - left) * drawn), 0.025, 0.05), CHALK_COLOR.blue)
        setPiece(used++, at.set(CHALK.x + (step.mid - (SEARCH_N - 1) / 2) * 0.125, CHALK.y - 0.06, CHALK.z + 0.02), size.set(0.05 * drawn + 1e-4, 0.05 * drawn + 1e-4, 0.05), CHALK_COLOR.yellow)
      }
      while (used < PIECES) setPiece(used++, at.set(0, -10, 0), size.set(1e-4, 1e-4, 1e-4), CHALK_COLOR.white)
      pieces.instanceMatrix.needsUpdate = true
      if (pieces.instanceColor) pieces.instanceColor.needsUpdate = true

      // Paper planes loop with the flow, banking into the turn.
      for (let k = 0; k < planes.length; k++) {
        const plane = planes[k]
        const angle = plane.phase + flow * 0.9 * plane.speed
        plane.mesh.position.set(plane.cx + Math.cos(angle) * plane.radius, plane.y + Math.sin(angle * 2) * 0.06, plane.cz + Math.sin(angle) * plane.radius * 0.7)
        plane.mesh.rotation.set(0, -angle + (plane.speed > 0 ? 0 : Math.PI), plane.speed > 0 ? 0.35 : -0.35)
      }

      // Dust drifts down the sunbeam with the flow.
      // The home page blends light in display space, where the same level reads about three times brighter.
      const beam = atHome ? 0.35 : 0.6 + 0.4 * smoother(ramp(a, 0.1, 0.6))
      shaftUniforms.uLevel.value = 0.11 * beam
      for (let k = 0; k < MOTES; k++) {
        const mote = moteSeeds[k]
        const t = (mote.t + flow * 0.05) % 1
        edgeA.copy(shaftCorners[0]).lerp(shaftCorners[1], mote.u)
        edgeB.copy(shaftCorners[3]).lerp(shaftCorners[2], mote.u)
        edgeA.lerp(edgeB, mote.v)
        edgeA.addScaledVector(sun, t * ((edgeA.y - 0.05) / -sun.y))
        moteAt[k * 3] = edgeA.x + Math.sin(flow * 2 + mote.phase) * 0.03
        moteAt[k * 3 + 1] = edgeA.y
        moteAt[k * 3 + 2] = edgeA.z + Math.cos(flow * 1.7 + mote.phase) * 0.03
        moteAlpha[k] = 0.5 * beam * Math.sin(Math.PI * t)
      }
      moteAtAttribute.needsUpdate = true
      moteAlphaAttribute.needsUpdate = true

      world.localToWorld(anchorPoints.books.copy(books[1].group.position)).y += 0.08
      world.localToWorld(anchorPoints.chalk.copy(chalkAnchor))
      for (let k = 0; k < bounds.length; k++) world.localToWorld(bounds[k].copy(boundsLocal[k]))
      output.busy = busy
      return output
    },
    press(point) {
      const k = pick(point.x, point.y)
      if (k < 0) return false
      if (k < books.length) {
        if (wanted.language !== k) {
          wanted.language = k
          request(true)
        }
        return true
      }
      wanted.seed += 1
      request(false)
      return true
    },
    command(name, value) {
      if (name !== 'algorithm' || !ALGORITHMS.includes(value as Algorithm) || wanted.algorithm === value) return
      wanted.algorithm = value as Algorithm
      request(true)
    },
    dispose() {
      disposed = true
      geometries.forEach((g) => g.dispose())
      pieces.dispose()
      owned.forEach((m) => m.dispose())
      textures.forEach((t) => t.dispose())
      mats.dispose()
    },
  }
}

export default createScene
