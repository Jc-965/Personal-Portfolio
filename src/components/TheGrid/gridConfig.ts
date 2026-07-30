import portfolioJson from '../../content/portfolio.json'

// ---------------------------------------------------------------------------
// Content (single source: portfolio.json — the Grid renders the same data the
// flat site does, so nothing is ever written twice).
// ---------------------------------------------------------------------------

export interface GridStat {
  label: string
  value: string
}

export interface GridExperience {
  id: string
  company: string
  role: string
  track: string
  period: string
  location: string
  status: string
  summary: string
  stack: string[]
  accent: string
  media?: { kind: string; items: Array<{ src: string; label: string; alt: string; aspect: string }> }
}

export interface GridProject {
  id: string
  name: string
  tag: string
  accent: string
  accentRgb: string
  kind: 'media' | 'code'
  lead: string
  bullets: string[]
  tech: string[]
  stats: GridStat[]
  images?: Array<{ src: string; label: string; alt: string; aspect: string }>
}

export interface GridSkillGroup {
  id: string
  name: string
  accent: string
  items: string[]
}

export interface GridBeyondItem {
  id: string
  title: string
  subtitle: string
  accent: string
  stats: GridStat[]
  bullets: string[]
}

interface GridContent {
  profile: {
    name: string
    eyebrow: string
    headline: string
    description: string
    email: string
    github: string
    linkedin: string
  }
  experiences: GridExperience[]
  projects: GridProject[]
  toolkit: GridSkillGroup[]
  beyond: GridBeyondItem[]
}

export const content = portfolioJson as unknown as GridContent

// ---------------------------------------------------------------------------
// Stations — one per district. `cam` points define the rail spline; `look`
// targets are lerped per leg. Progress 0..1 maps linearly across stations.
// ---------------------------------------------------------------------------

export type Vec3Tuple = [number, number, number]

export interface GridStation {
  id: string
  label: string
  title: string
  accent: string
  cam: Vec3Tuple
  look: Vec3Tuple
}

export const STATIONS: GridStation[] = [
  {
    id: 'home',
    label: 'HOME',
    title: content.profile.headline,
    accent: '#00ffff',
    // Slightly low and far so both gate arches frame the identity screen,
    // which sits dead on the sightline.
    cam: [0, 6.5, 50],
    look: [-3, 13.5, -18],
  },
  {
    id: 'journey',
    label: 'JOURNEY',
    title: 'From research labs to shipped products',
    accent: '#ffb347',
    // Slides past the jumbotron's right edge so the transit line owns the frame.
    cam: [8, 8.5, 6],
    look: [-14, 8.5, -26],
  },
  {
    id: 'projects',
    label: 'PROJECTS',
    title: 'Featured builds',
    accent: '#4c8bff',
    // Crosses the avenue BEHIND the jumbotron block (validator-checked), then
    // faces down the tower row from the west kerb.
    cam: [-2, 11.5, -31],
    // Yawed toward the tower row so the selected tower and its ring sit
    // fully in frame at the rest pose.
    look: [15, 12.5, -62],
  },
  {
    id: 'beyond',
    label: 'BEYOND',
    title: 'Outside the code',
    accent: '#ff00ff',
    cam: [6, 6.5, -86],
    look: [-10, 7, -110],
  },
  {
    id: 'skills',
    label: 'SKILLS',
    title: 'Technologies and tools',
    accent: '#ffcc00',
    cam: [0, 9, -122],
    look: [9, 20, -150],
  },
  {
    id: 'sky',
    label: 'SKY',
    title: 'The constellation above the city',
    accent: '#7efcff',
    // High enough that the arrival leg crests ABOVE the deck slab (y 34.25)
    // instead of passing through it — that read as a black wall while
    // scrolling into the station.
    cam: [0, 37.2, -158],
    look: [0, 110, -250],
  },
]

export const STATION_COUNT = STATIONS.length

/**
 * The camera rail: station anchors plus unlabeled via points that shape the
 * path — keeping it clear of structures and adding the high sweep over the
 * avenue into the Beyond quarter. Progress maps uniformly across SEGMENTS,
 * so station progress values are looked up, not computed.
 */
export const RAIL_POINTS: Vec3Tuple[] = [
  STATIONS[0].cam,
  STATIONS[1].cam,
  [8.5, 10, -29], // wide berth past the jumbotron block, then cross behind it
  STATIONS[2].cam,
  [7, 25, -58], // sweeping climb over the avenue, between the district edges
  STATIONS[3].cam,
  STATIONS[4].cam,
  [0, 37, -147], // crest the climb before the deck slab's footprint begins
  STATIONS[5].cam,
]

const STATION_RAIL_INDEX = [0, 1, 3, 5, 6, 8]
export const STATION_T = STATION_RAIL_INDEX.map(i => i / (RAIL_POINTS.length - 1))
export const stationT = (index: number) => STATION_T[index]

/**
 * Axis-aligned no-fly zones (with margin) for the dev-time rail validator —
 * every signature structure the camera path must never enter. Populated at
 * the bottom of this module, after the structure constants exist.
 */
export const STRUCTURE_AABBS: Array<{ name: string; min: Vec3Tuple; max: Vec3Tuple }> = []

// HUD shows a station's panel while |progress - stationT| is inside the enter
// threshold, and hides it past the exit threshold (hysteresis kills flicker
// when the visitor rests right on a boundary).
export const STATION_ENTER = 0.055
export const STATION_EXIT = 0.085

// Scroll runway inside the overlay. Long enough that each leg is an unhurried
// wheel gesture, short enough that station-to-station travel stays snappy.
export const SCROLL_VH_PER_LEG = 165

// ---------------------------------------------------------------------------
// District structures — positions the scene builds meshes from.
// ---------------------------------------------------------------------------

export const JUMBOTRON = {
  // Shifted west of the avenue centerline so the east-side rail clears it
  // with real margin (the rail validator enforces this).
  tower: { x: -3, z: -24, width: 10, height: 26, depth: 6 },
  // Screen faces +Z, toward the arrival camera.
  screen: { x: -3, y: 15.5, z: -20.85, width: 15.5, height: 8.7 },
}

export const TRANSIT = {
  x: -13,
  beamY: 8.2,
  zStart: 10,
  zStep: -9,
}

export const transitStopZ = (index: number) => TRANSIT.zStart + index * TRANSIT.zStep

export interface ProjectSite {
  project: GridProject
  x: number
  z: number
  height: number
  image: string | null
}

// Four towers on the east side of the avenue, billboards facing the S2 camera.
export const PROJECT_SITES: ProjectSite[] = content.projects.slice(0, 4).map((project, i) => ({
  project,
  x: [13, 14.5, 13, 15][i] ?? 13,
  z: -54 - i * 13,
  height: [30, 26, 34, 24][i] ?? 26,
  image: project.images?.[0]?.src ?? null,
}))

// Staggered so the three storefront signs never stack in projection.
export const BEYOND_SHOPS = content.beyond.map((item, i) => ({
  item,
  x: [-10, -13, -10.5][i] ?? -11,
  z: -98 - i * 10,
}))

export const RELAY_TOWER = {
  x: 10,
  z: -152,
  width: 7,
  height: 30,
  bands: content.toolkit.length,
  bandStartY: 7,
  bandStepY: 5,
}

export const SKY_DECK = { x: 0, y: 34, z: -160, size: 12 }

// Neon threshold arches over the arrival plaza (widths keep the eastward
// rail leg well inside them).
// Crossbars sit above every sightline from the home station to the identity
// screen's top edge, so the gates frame the view without ever cutting it.
export const PLAZA_GATES = [
  { z: 38, halfWidth: 9, height: 16.5 },
  { z: 27, halfWidth: 9, height: 16 },
  { z: 16, halfWidth: 9, height: 15.5 },
]

// Corridor kept clear of procedural towers so the rail never clips a building.
export const CORRIDOR_RADIUS = 11

export const CITY_BOUNDS = { minX: -90, maxX: 90, minZ: -200, maxZ: 70 }

export const BG_COLOR = '#020409'

const MARGIN = 1.5
const addAabb = (name: string, cx: number, cz: number, w: number, h: number, d: number) => {
  STRUCTURE_AABBS.push({
    name,
    min: [cx - w / 2 - MARGIN, -1, cz - d / 2 - MARGIN],
    max: [cx + w / 2 + MARGIN, h + MARGIN, cz + d / 2 + MARGIN],
  })
}
addAabb('jumbotron', JUMBOTRON.tower.x, JUMBOTRON.tower.z, JUMBOTRON.tower.width, JUMBOTRON.tower.height, JUMBOTRON.tower.depth)
PROJECT_SITES.forEach(site => addAabb(`project:${site.project.id}`, site.x, site.z, 8, site.height, 8))
BEYOND_SHOPS.forEach(({ item, x, z }) => addAabb(`beyond:${item.id}`, x, z, 6, 7, 6))
addAabb('relay', RELAY_TOWER.x, RELAY_TOWER.z, RELAY_TOWER.width, RELAY_TOWER.height, RELAY_TOWER.width)
addAabb('sky-mast', SKY_DECK.x, SKY_DECK.z, 1.1, SKY_DECK.y - 1, 1.1)
// The deck slab column: the rail may only cross its footprint from above.
addAabb('sky-deck-slab', SKY_DECK.x, SKY_DECK.z, SKY_DECK.size, SKY_DECK.y + 0.25, SKY_DECK.size)
PLAZA_GATES.forEach(gate => {
  addAabb(`gate-w:${gate.z}`, -gate.halfWidth, gate.z, 0.5, gate.height, 0.5)
  addAabb(`gate-e:${gate.z}`, gate.halfWidth, gate.z, 0.5, gate.height, 0.5)
})
