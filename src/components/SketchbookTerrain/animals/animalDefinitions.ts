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

// Capybara: round body, stubby legs, flat head, small ears
export function createCapybaraGeometry(): THREE.BufferGeometry {
  return mergeGeos([
    box(0, 0.35, 0, 0.8, 0.5, 0.45),       // body
    box(0.35, 0.55, 0, 0.35, 0.3, 0.32),    // head
    sphere(0.55, 0.58, 0, 0.12, 3),          // snout
    // legs
    cylinder(-0.2, 0.05, 0.15, 0.06, 0.2),
    cylinder(-0.2, 0.05, -0.15, 0.06, 0.2),
    cylinder(0.2, 0.05, 0.15, 0.06, 0.2),
    cylinder(0.2, 0.05, -0.15, 0.06, 0.2),
    // ears
    box(0.35, 0.75, 0.12, 0.08, 0.08, 0.04),
    box(0.35, 0.75, -0.12, 0.08, 0.08, 0.04),
  ])
}

// Tasmanian Devil: compact, muscular body, big head, pointed snout
export function createTasmanianDevilGeometry(): THREE.BufferGeometry {
  return mergeGeos([
    box(0, 0.3, 0, 0.6, 0.4, 0.4),         // body
    box(0.32, 0.4, 0, 0.35, 0.32, 0.35),    // big head
    box(0.52, 0.38, 0, 0.18, 0.12, 0.12),   // snout
    // legs
    cylinder(-0.15, 0.05, 0.14, 0.05, 0.2),
    cylinder(-0.15, 0.05, -0.14, 0.05, 0.2),
    cylinder(0.15, 0.05, 0.14, 0.05, 0.2),
    cylinder(0.15, 0.05, -0.14, 0.05, 0.2),
    // ears (pointed)
    box(0.28, 0.62, 0.14, 0.06, 0.12, 0.06),
    box(0.28, 0.62, -0.14, 0.06, 0.12, 0.06),
    // tail
    cylinder(-0.35, 0.2, 0, 0.04, 0.3),
  ])
}

// CMU Scotty Terrier: boxy body, distinctive beard, perky ears, short legs
export function createScottyGeometry(): THREE.BufferGeometry {
  return mergeGeos([
    box(0, 0.3, 0, 0.65, 0.35, 0.3),       // boxy body
    box(0.32, 0.38, 0, 0.3, 0.28, 0.25),    // head
    box(0.48, 0.32, 0, 0.14, 0.2, 0.18),    // beard/muzzle (distinctive!)
    // Short stubby legs
    cylinder(-0.18, 0.06, 0.1, 0.05, 0.18),
    cylinder(-0.18, 0.06, -0.1, 0.05, 0.18),
    cylinder(0.18, 0.06, 0.1, 0.05, 0.18),
    cylinder(0.18, 0.06, -0.1, 0.05, 0.18),
    // Perky triangular ears
    box(0.3, 0.58, 0.08, 0.05, 0.1, 0.05),
    box(0.3, 0.58, -0.08, 0.05, 0.1, 0.05),
    // Tail (upright)
    cylinder(-0.32, 0.45, 0, 0.03, 0.2),
    // Eyebrows
    box(0.42, 0.48, 0.06, 0.06, 0.03, 0.04),
    box(0.42, 0.48, -0.06, 0.06, 0.03, 0.04),
  ])
}

// Deer: tall, slim, long legs, antlers
export function createDeerGeometry(): THREE.BufferGeometry {
  return mergeGeos([
    box(0, 0.7, 0, 0.7, 0.35, 0.3),        // body
    box(0.35, 0.95, 0, 0.25, 0.22, 0.2),    // head
    box(0.48, 0.93, 0, 0.1, 0.08, 0.08),    // snout
    // Long legs
    cylinder(-0.2, 0.3, 0.1, 0.04, 0.55),
    cylinder(-0.2, 0.3, -0.1, 0.04, 0.55),
    cylinder(0.2, 0.3, 0.1, 0.04, 0.55),
    cylinder(0.2, 0.3, -0.1, 0.04, 0.55),
    // Antlers (simple branching)
    cylinder(0.32, 1.15, 0.06, 0.02, 0.25),
    cylinder(0.32, 1.15, -0.06, 0.02, 0.25),
    box(0.32, 1.28, 0.12, 0.15, 0.02, 0.02),
    box(0.32, 1.28, -0.12, 0.15, 0.02, 0.02),
    // Tail
    box(-0.38, 0.75, 0, 0.08, 0.06, 0.06),
  ])
}

// Bird: simple triangle body, wings
export function createBirdGeometry(): THREE.BufferGeometry {
  return mergeGeos([
    box(0, 0, 0, 0.2, 0.1, 0.1),            // body
    box(0.12, 0.03, 0, 0.08, 0.06, 0.06),   // head
    box(0.18, 0.02, 0, 0.06, 0.02, 0.02),   // beak
    // Wings (flat angled)
    box(0, 0.04, 0.15, 0.15, 0.02, 0.12),
    box(0, 0.04, -0.15, 0.15, 0.02, 0.12),
    // Tail
    box(-0.14, 0.02, 0, 0.08, 0.02, 0.08),
  ])
}

// Rabbit: round body, long ears, cotton tail
export function createRabbitGeometry(): THREE.BufferGeometry {
  return mergeGeos([
    sphere(0, 0.2, 0, 0.18, 4),              // body
    sphere(0.15, 0.35, 0, 0.12, 3),          // head
    // Long ears
    box(0.14, 0.55, 0.04, 0.04, 0.16, 0.03),
    box(0.14, 0.55, -0.04, 0.04, 0.16, 0.03),
    // Legs
    cylinder(-0.05, 0.04, 0.08, 0.04, 0.12),
    cylinder(-0.05, 0.04, -0.08, 0.04, 0.12),
    cylinder(0.08, 0.04, 0.06, 0.03, 0.1),
    cylinder(0.08, 0.04, -0.06, 0.03, 0.1),
    // Cotton tail
    sphere(-0.15, 0.2, 0, 0.06, 3),
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
