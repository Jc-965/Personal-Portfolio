import * as THREE from 'three'

// Helper to create a box-like shape from center, size
function box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(sx, sy, sz)
  geo.translate(cx, cy, cz)
  return geo
}

function sphere(cx: number, cy: number, cz: number, r: number, segs = 4): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(r, segs, segs)
  geo.translate(cx, cy, cz)
  return geo
}

function cylinder(cx: number, cy: number, cz: number, r: number, h: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(r, r, h, 4)
  geo.translate(cx, cy, cz)
  return geo
}

function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Manual merge since BufferGeometryUtils may not be available
  let totalVerts = 0
  for (const g of geos) totalVerts += g.attributes.position.count

  const positions = new Float32Array(totalVerts * 3)
  const normals = new Float32Array(totalVerts * 3)
  let offset = 0

  for (const g of geos) {
    const pos = g.attributes.position as THREE.BufferAttribute
    const norm = g.attributes.normal as THREE.BufferAttribute
    if (!norm) g.computeVertexNormals()
    const n = g.attributes.normal as THREE.BufferAttribute

    // Handle indexed geometries
    const index = g.index
    if (index) {
      const nonIndexed = g.toNonIndexed()
      const np = nonIndexed.attributes.position as THREE.BufferAttribute
      const nn = nonIndexed.attributes.normal as THREE.BufferAttribute
      for (let i = 0; i < np.count; i++) {
        positions[(offset + i) * 3] = np.getX(i)
        positions[(offset + i) * 3 + 1] = np.getY(i)
        positions[(offset + i) * 3 + 2] = np.getZ(i)
        normals[(offset + i) * 3] = nn.getX(i)
        normals[(offset + i) * 3 + 1] = nn.getY(i)
        normals[(offset + i) * 3 + 2] = nn.getZ(i)
      }
      offset += np.count
      nonIndexed.dispose()
    } else {
      for (let i = 0; i < pos.count; i++) {
        positions[(offset + i) * 3] = pos.getX(i)
        positions[(offset + i) * 3 + 1] = pos.getY(i)
        positions[(offset + i) * 3 + 2] = pos.getZ(i)
        if (n) {
          normals[(offset + i) * 3] = n.getX(i)
          normals[(offset + i) * 3 + 1] = n.getY(i)
          normals[(offset + i) * 3 + 2] = n.getZ(i)
        }
      }
      offset += pos.count
    }
    g.dispose()
  }

  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, offset * 3), 3))
  merged.setAttribute('normal', new THREE.BufferAttribute(normals.slice(0, offset * 3), 3))
  merged.computeVertexNormals()
  return merged
}

// Capybara: round body, stubby legs, flat head, small ears, nostrils, belly
export function createCapybaraGeometry(): THREE.BufferGeometry {
  return mergeGeos([
    box(0, 0.35, 0, 0.8, 0.5, 0.45),       // body
    box(0, 0.25, 0, 0.7, 0.3, 0.48),        // belly volume
    box(0.35, 0.55, 0, 0.35, 0.3, 0.32),    // head
    sphere(0.55, 0.58, 0, 0.12, 4),          // snout
    sphere(0.62, 0.62, 0.03, 0.03, 3),       // nostril R
    sphere(0.62, 0.62, -0.03, 0.03, 3),      // nostril L
    sphere(0.42, 0.64, 0.1, 0.04, 3),        // eye R
    sphere(0.42, 0.64, -0.1, 0.04, 3),       // eye L
    // legs
    cylinder(-0.22, 0.05, 0.16, 0.07, 0.22),
    cylinder(-0.22, 0.05, -0.16, 0.07, 0.22),
    cylinder(0.22, 0.05, 0.16, 0.07, 0.22),
    cylinder(0.22, 0.05, -0.16, 0.07, 0.22),
    // feet
    box(-0.22, -0.04, 0.16, 0.1, 0.04, 0.08),
    box(-0.22, -0.04, -0.16, 0.1, 0.04, 0.08),
    box(0.22, -0.04, 0.16, 0.1, 0.04, 0.08),
    box(0.22, -0.04, -0.16, 0.1, 0.04, 0.08),
    // ears
    box(0.35, 0.75, 0.12, 0.08, 0.1, 0.05),
    box(0.35, 0.75, -0.12, 0.08, 0.1, 0.05),
  ])
}

// Tasmanian Devil: compact, muscular body, big head, pointed snout, white chest
export function createTasmanianDevilGeometry(): THREE.BufferGeometry {
  return mergeGeos([
    box(0, 0.3, 0, 0.6, 0.4, 0.4),         // body
    box(0, 0.22, 0, 0.5, 0.25, 0.42),       // lower body bulk
    box(0.32, 0.4, 0, 0.35, 0.32, 0.35),    // big head
    box(0.52, 0.38, 0, 0.18, 0.14, 0.14),   // snout
    sphere(0.6, 0.4, 0, 0.04, 3),            // nose
    sphere(0.4, 0.5, 0.1, 0.035, 3),         // eye R
    sphere(0.4, 0.5, -0.1, 0.035, 3),        // eye L
    box(0.15, 0.38, 0, 0.15, 0.12, 0.3),    // chest patch
    // legs (thicker)
    cylinder(-0.16, 0.05, 0.15, 0.06, 0.22),
    cylinder(-0.16, 0.05, -0.15, 0.06, 0.22),
    cylinder(0.16, 0.05, 0.15, 0.06, 0.22),
    cylinder(0.16, 0.05, -0.15, 0.06, 0.22),
    // paws
    sphere(-0.16, -0.04, 0.15, 0.06, 3),
    sphere(-0.16, -0.04, -0.15, 0.06, 3),
    sphere(0.16, -0.04, 0.15, 0.06, 3),
    sphere(0.16, -0.04, -0.15, 0.06, 3),
    // ears (rounded)
    sphere(0.3, 0.62, 0.14, 0.06, 3),
    sphere(0.3, 0.62, -0.14, 0.06, 3),
    // tail
    cylinder(-0.35, 0.2, 0, 0.04, 0.3),
    sphere(-0.5, 0.2, 0, 0.04, 3),          // tail tip
  ])
}

// CMU Scotty Terrier: boxy body, distinctive beard, perky ears, short legs
export function createScottyGeometry(): THREE.BufferGeometry {
  return mergeGeos([
    box(0, 0.3, 0, 0.65, 0.35, 0.3),       // boxy body
    box(-0.1, 0.24, 0, 0.4, 0.22, 0.32),    // hindquarters
    box(0.32, 0.38, 0, 0.3, 0.28, 0.25),    // head
    box(0.48, 0.32, 0, 0.14, 0.22, 0.2),    // beard/muzzle
    sphere(0.56, 0.38, 0, 0.04, 3),          // nose
    sphere(0.38, 0.48, 0.08, 0.03, 3),       // eye R
    sphere(0.38, 0.48, -0.08, 0.03, 3),      // eye L
    // Short stubby legs
    cylinder(-0.18, 0.06, 0.1, 0.05, 0.18),
    cylinder(-0.18, 0.06, -0.1, 0.05, 0.18),
    cylinder(0.18, 0.06, 0.1, 0.05, 0.18),
    cylinder(0.18, 0.06, -0.1, 0.05, 0.18),
    // Paws
    box(-0.18, -0.02, 0.1, 0.07, 0.04, 0.06),
    box(-0.18, -0.02, -0.1, 0.07, 0.04, 0.06),
    box(0.18, -0.02, 0.1, 0.07, 0.04, 0.06),
    box(0.18, -0.02, -0.1, 0.07, 0.04, 0.06),
    // Perky triangular ears
    box(0.3, 0.58, 0.08, 0.05, 0.12, 0.05),
    box(0.3, 0.58, -0.08, 0.05, 0.12, 0.05),
    // Tail (upright, curved)
    cylinder(-0.32, 0.45, 0, 0.03, 0.22),
    sphere(-0.32, 0.57, 0, 0.035, 3),        // tail tip
    // Eyebrows (bushier)
    box(0.42, 0.48, 0.06, 0.08, 0.04, 0.05),
    box(0.42, 0.48, -0.06, 0.08, 0.04, 0.05),
    // Collar
    box(0.22, 0.36, 0, 0.06, 0.06, 0.28),
  ])
}

// Deer: tall, slim, long legs, antlers, neck
export function createDeerGeometry(): THREE.BufferGeometry {
  return mergeGeos([
    box(0, 0.7, 0, 0.7, 0.35, 0.3),        // body
    box(-0.1, 0.65, 0, 0.5, 0.28, 0.32),    // hindquarters
    box(0.28, 0.82, 0, 0.12, 0.2, 0.14),    // neck
    box(0.35, 0.95, 0, 0.25, 0.22, 0.2),    // head
    box(0.48, 0.93, 0, 0.12, 0.09, 0.09),   // snout
    sphere(0.55, 0.95, 0, 0.03, 3),          // nose
    sphere(0.4, 1.0, 0.07, 0.03, 3),         // eye R
    sphere(0.4, 1.0, -0.07, 0.03, 3),        // eye L
    // Long legs (with knee joints)
    cylinder(-0.2, 0.38, 0.1, 0.035, 0.35),  // upper back R
    cylinder(-0.2, 0.12, 0.1, 0.03, 0.3),    // lower back R
    cylinder(-0.2, 0.38, -0.1, 0.035, 0.35),
    cylinder(-0.2, 0.12, -0.1, 0.03, 0.3),
    cylinder(0.2, 0.38, 0.1, 0.035, 0.35),   // upper front R
    cylinder(0.2, 0.12, 0.1, 0.03, 0.3),     // lower front R
    cylinder(0.2, 0.38, -0.1, 0.035, 0.35),
    cylinder(0.2, 0.12, -0.1, 0.03, 0.3),
    // Hooves
    box(-0.2, -0.02, 0.1, 0.05, 0.04, 0.04),
    box(-0.2, -0.02, -0.1, 0.05, 0.04, 0.04),
    box(0.2, -0.02, 0.1, 0.05, 0.04, 0.04),
    box(0.2, -0.02, -0.1, 0.05, 0.04, 0.04),
    // Antlers (more branching)
    cylinder(0.32, 1.15, 0.06, 0.018, 0.28),
    cylinder(0.32, 1.15, -0.06, 0.018, 0.28),
    box(0.32, 1.22, 0.12, 0.1, 0.018, 0.018),  // branch R lower
    box(0.32, 1.22, -0.12, 0.1, 0.018, 0.018),
    box(0.35, 1.3, 0.1, 0.08, 0.018, 0.018),   // branch R upper
    box(0.35, 1.3, -0.1, 0.08, 0.018, 0.018),
    // Ears
    box(0.33, 1.06, 0.1, 0.04, 0.08, 0.03),
    box(0.33, 1.06, -0.1, 0.04, 0.08, 0.03),
    // Tail
    box(-0.38, 0.78, 0, 0.1, 0.08, 0.07),
  ])
}

// Bird: detailed body, head, wings, tail feathers
export function createBirdGeometry(): THREE.BufferGeometry {
  return mergeGeos([
    sphere(0, 0, 0, 0.1, 4),                 // body
    box(0, 0, 0, 0.22, 0.11, 0.11),          // body block
    sphere(0.12, 0.04, 0, 0.07, 4),          // head
    sphere(0.13, 0.06, 0.02, 0.02, 3),       // eye R
    sphere(0.13, 0.06, -0.02, 0.02, 3),      // eye L
    box(0.2, 0.03, 0, 0.08, 0.02, 0.02),    // beak upper
    box(0.2, 0.01, 0, 0.06, 0.015, 0.018),  // beak lower
    // Wings (layered for thickness)
    box(0, 0.04, 0.15, 0.16, 0.025, 0.13),
    box(0.02, 0.04, 0.22, 0.1, 0.02, 0.06), // wing tip R
    box(0, 0.04, -0.15, 0.16, 0.025, 0.13),
    box(0.02, 0.04, -0.22, 0.1, 0.02, 0.06),// wing tip L
    // Tail feathers (fanned)
    box(-0.14, 0.02, 0, 0.1, 0.015, 0.04),
    box(-0.16, 0.03, 0.03, 0.08, 0.015, 0.03),
    box(-0.16, 0.03, -0.03, 0.08, 0.015, 0.03),
    // Feet
    box(0.02, -0.06, 0.02, 0.04, 0.04, 0.02),
    box(0.02, -0.06, -0.02, 0.04, 0.04, 0.02),
  ])
}

// Rabbit: round body, long ears, cotton tail, hind legs
export function createRabbitGeometry(): THREE.BufferGeometry {
  return mergeGeos([
    sphere(0, 0.2, 0, 0.18, 5),              // body
    sphere(-0.05, 0.16, 0, 0.16, 4),         // lower body/haunch
    sphere(0.15, 0.35, 0, 0.13, 4),          // head
    sphere(0.16, 0.38, 0.04, 0.025, 3),      // eye R
    sphere(0.16, 0.38, -0.04, 0.025, 3),     // eye L
    sphere(0.24, 0.34, 0, 0.03, 3),          // nose
    box(0.22, 0.32, 0.01, 0.02, 0.04, 0.01),// whisker R
    box(0.22, 0.32, -0.01, 0.02, 0.04, 0.01),
    // Long ears (with inner detail)
    box(0.14, 0.55, 0.04, 0.04, 0.18, 0.035),
    box(0.14, 0.55, 0.04, 0.02, 0.14, 0.02),// inner ear R
    box(0.14, 0.55, -0.04, 0.04, 0.18, 0.035),
    box(0.14, 0.55, -0.04, 0.02, 0.14, 0.02),
    // Front legs
    cylinder(0.08, 0.06, 0.06, 0.03, 0.14),
    cylinder(0.08, 0.06, -0.06, 0.03, 0.14),
    // Big hind legs
    sphere(-0.08, 0.1, 0.08, 0.06, 3),       // thigh R
    cylinder(-0.08, 0.02, 0.1, 0.035, 0.12),
    sphere(-0.08, 0.1, -0.08, 0.06, 3),      // thigh L
    cylinder(-0.08, 0.02, -0.1, 0.035, 0.12),
    // Hind feet (big)
    box(-0.1, -0.02, 0.1, 0.1, 0.03, 0.05),
    box(-0.1, -0.02, -0.1, 0.1, 0.03, 0.05),
    // Cotton tail
    sphere(-0.17, 0.22, 0, 0.07, 4),
  ])
}

export type AnimalType = 'capybara' | 'tasmanianDevil' | 'scotty' | 'deer' | 'bird' | 'rabbit'

export const animalFactories: Record<AnimalType, () => THREE.BufferGeometry> = {
  capybara: createCapybaraGeometry,
  tasmanianDevil: createTasmanianDevilGeometry,
  scotty: createScottyGeometry,
  deer: createDeerGeometry,
  bird: createBirdGeometry,
  rabbit: createRabbitGeometry,
}
