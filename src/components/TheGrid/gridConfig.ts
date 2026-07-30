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
// The street. One canyon avenue runs the whole journey down −z: kerbs at
// ±9.6, sidewalks to ±12.2, building walls from ±12.4 out. The camera lives
// at eye-ish height on the centerline — everything is staged to be read from
// the middle of the road, the way the reference night-city shots are framed.
// ---------------------------------------------------------------------------

export const STREET = {
  halfWidth: 9.6, // kerb line
  sidewalkOuter: 12.2,
  wallX: 12.4, // building fronts start here
  zStart: 46, // north end (arrival)
  zEnd: -235, // south end (plaza before the sky climb)
}

export type Vec3Tuple = [number, number, number]

export interface GridStation {
  id: string
  label: string
  title: string
  accent: string
  cam: Vec3Tuple
  look: Vec3Tuple
}

// Camera stays low (street level, y ≈ 4) and looks DOWN the street, so signs
// and gantries stack in perspective like a real avenue at night.
export const STATIONS: GridStation[] = [
  {
    id: 'home',
    label: 'HOME',
    title: content.profile.headline,
    accent: '#00ffff',
    cam: [0, 4.4, 46],
    // Slightly up so the identity screen on the billboard tower terminates
    // the vista over the entry gantry.
    look: [-3, 12, -14],
  },
  {
    id: 'journey',
    label: 'JOURNEY',
    title: 'From research labs to shipped products',
    accent: '#ffb347',
    // All seven role gantries recede down-street from here — the whole
    // career is visible in one frame, nearest stop readable first.
    cam: [0, 4.2, 12],
    look: [0, 7, -34],
  },
  {
    id: 'projects',
    label: 'PROJECTS',
    title: 'Featured builds',
    accent: '#4c8bff',
    // Wall marquees alternate sides ahead, every screen angled up-street.
    cam: [0, 4.6, -82],
    look: [1.5, 8.5, -120],
  },
  {
    id: 'beyond',
    label: 'BEYOND',
    title: 'Outside the code',
    accent: '#ff00ff',
    cam: [0, 4.0, -150],
    look: [-7, 5.5, -178],
  },
  {
    id: 'skills',
    label: 'SKILLS',
    title: 'Technologies and tools',
    accent: '#ffcc00',
    cam: [0, 5.0, -192],
    look: [11, 16, -226],
  },
  {
    id: 'sky',
    label: 'SKY',
    title: 'The constellation above the city',
    accent: '#7efcff',
    // The climb crests before the deck slab's footprint (see rail vias).
    cam: [0, 38, -252],
    look: [0, 110, -340],
  },
]

export const STATION_COUNT = STATIONS.length

/**
 * The camera rail: mostly a straight ride down the centerline with a gentle
 * sway, then the crane up to the sky deck. Vias keep the climb cresting
 * ABOVE the deck slab before entering its footprint.
 */
export const RAIL_POINTS: Vec3Tuple[] = [
  STATIONS[0].cam,
  STATIONS[1].cam,
  [0.9, 4.3, -36], // gentle drift between the gantries
  STATIONS[2].cam,
  [-0.9, 4.2, -118], // drift back past the marquees
  STATIONS[3].cam,
  STATIONS[4].cam,
  [0, 37.5, -238], // crest the climb before the deck slab's footprint
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

// HUD shows a station's readouts while |progress - stationT| is inside the
// enter threshold, hides them past exit (hysteresis kills flicker).
export const STATION_ENTER = 0.055
export const STATION_EXIT = 0.085

// Scroll runway inside the overlay.
export const SCROLL_VH_PER_LEG = 165

// ---------------------------------------------------------------------------
// District structures — positions the scene builds meshes from.
// ---------------------------------------------------------------------------

/** Vertical billboard tower terminating the arrival vista (west side),
 * carrying the identity screen and stacked ad boards — the reference shot's
 * "screen tower at the end of the street". */
export const JUMBOTRON = {
  tower: { x: -17.5, z: -32, width: 9, height: 46, depth: 9 },
  // Vertical identity screen on the +z face, readable from the entry.
  screen: { x: -17.5, y: 28, z: -27.4, width: 8.2, height: 10 },
}

/** Entry gantry: the threshold into the Grid — far enough down-street that
 * the arrival camera looks THROUGH it, torii-style. */
export const ENTRY_GATE = { z: 26, pylonX: 10.6, height: 12.6 }

/** Role gantries: one overhead sign bridge per experience, marching down the
 * street. Riding under them IS the career timeline; a monorail on the
 * centerline above carries the tram that parks at the selected role. */
export const GANTRY = {
  zStart: -2,
  zStep: -12,
  pylonX: 10.3,
  deckY: 7.0,
  railY: 10.6,
}

export const gantryZ = (index: number) => GANTRY.zStart + index * GANTRY.zStep

export interface ProjectSite {
  project: GridProject
  /** Which wall the marquee hangs from: +1 east, −1 west. */
  side: 1 | -1
  z: number
  /** Screen center height. */
  screenY: number
  /** Approx screen center x (street side of the hinge). */
  x: number
  /** Top of the marquee assembly — light shafts rise from here. */
  height: number
  image: string | null
}

/** Marquee screen dimensions and the yaw that angles every screen up-street
 * (toward the approaching camera) instead of flat against its wall. */
export const MARQUEE = { width: 9.5, height: 5.9, tilt: 0.55 }

/** Placement math for a wall marquee: the assembly hinges on the wall face
 * and swings its far edge out over the sidewalk. Shared by the meshes, the
 * fly-to focus poses, and the atmosphere effects. */
export const marqueeCenter = (site: { side: 1 | -1; z: number }) => {
  const t = MARQUEE.tilt
  const half = MARQUEE.width / 2
  return {
    x: site.side * (STREET.wallX - Math.sin(t) * half),
    z: site.z - Math.cos(t) * half,
    rotationY: site.side > 0 ? -Math.PI / 2 + t : Math.PI / 2 - t,
  }
}

// Giant angled marquee screens on alternating walls — every screen faces
// up-street so it's readable on approach, like real billboard canyons.
export const PROJECT_SITES: ProjectSite[] = content.projects.slice(0, 4).map((project, i) => {
  const side = (i % 2 === 0 ? 1 : -1) as 1 | -1
  return {
    project,
    side,
    z: -96 - i * 16,
    screenY: 8.6,
    x: side * 9.9,
    height: 14,
    image: project.images?.[0]?.src ?? null,
  }
})

// West-side storefronts opening onto the sidewalk.
export const BEYOND_SHOPS = content.beyond.map((item, i) => ({
  item,
  x: -13.2,
  z: -158 - i * 10,
}))

export const RELAY_TOWER = {
  x: 15,
  z: -226,
  width: 7,
  height: 30,
  bands: content.toolkit.length,
  bandStartY: 7,
  bandStepY: 5,
}

export const SKY_DECK = { x: 0, y: 35, z: -252, size: 12 }

/** Rects the street-wall generator keeps clear (signature structures own
 * these frontages). */
export const WALL_EXCLUSIONS: Array<{ side: 1 | -1; zMin: number; zMax: number }> = [
  // Wide clearing around the billboard tower so the arrival sightline from
  // the home station reaches its screen unblocked.
  { side: -1, zMin: -46, zMax: -4 },
  { side: -1, zMin: -186, zMax: -152 }, // beyond storefronts
  // Relay plaza, extended north so the skill-band signs clear the wall row
  // from the skills-station sightline.
  { side: 1, zMin: -236, zMax: -204 },
]

// Corridor kept clear of procedural blocks so nothing spawns in the roadway.
export const CORRIDOR_RADIUS = 11

export const CITY_BOUNDS = { minX: -90, maxX: 90, minZ: -260, maxZ: 70 }

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
addAabb('gate-w', -ENTRY_GATE.pylonX, ENTRY_GATE.z, 0.7, ENTRY_GATE.height, 0.7)
addAabb('gate-e', ENTRY_GATE.pylonX, ENTRY_GATE.z, 0.7, ENTRY_GATE.height, 0.7)
content.experiences.forEach((exp, i) => {
  addAabb(`gantry-w:${exp.id}`, -GANTRY.pylonX, gantryZ(i), 0.8, GANTRY.deckY, 0.8)
  addAabb(`gantry-e:${exp.id}`, GANTRY.pylonX, gantryZ(i), 0.8, GANTRY.deckY, 0.8)
})
BEYOND_SHOPS.forEach(({ item, x, z }) => addAabb(`beyond:${item.id}`, x, z, 6, 7, 6))
addAabb('relay', RELAY_TOWER.x, RELAY_TOWER.z, RELAY_TOWER.width, RELAY_TOWER.height, RELAY_TOWER.width)
addAabb('sky-mast', SKY_DECK.x, SKY_DECK.z, 1.1, SKY_DECK.y - 1, 1.1)
// The deck slab column: the rail may only cross its footprint from above.
addAabb('sky-deck-slab', SKY_DECK.x, SKY_DECK.z, SKY_DECK.size, SKY_DECK.y + 0.25, SKY_DECK.size)
