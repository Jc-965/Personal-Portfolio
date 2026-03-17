import * as THREE from 'three'

interface LSystemRule {
  symbol: string
  replacement: string
  probability?: number
}

interface TurtleState {
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
  thickness: number
}

const RULES: LSystemRule[][] = [
  // Variant 0: Classic branching
  [
    { symbol: 'F', replacement: 'FF+[+F-F-F]-[-F+F+F]' },
  ],
  // Variant 1: Tall pine-like
  [
    { symbol: 'F', replacement: 'F[+F]F[-F]F' },
  ],
  // Variant 2: Bushy
  [
    { symbol: 'F', replacement: 'F[+F][-F]F[+F]' },
  ],
  // Variant 3: Wispy
  [
    { symbol: 'F', replacement: 'FF-[-F+F+F]+[+F-F-F]' },
  ],
  // Variant 4: Small shrub
  [
    { symbol: 'F', replacement: 'F[+F]F[-F]+F' },
  ],
]

function applyRules(axiom: string, rules: LSystemRule[], iterations: number): string {
  let current = axiom
  for (let i = 0; i < iterations; i++) {
    let next = ''
    for (const char of current) {
      const rule = rules.find(r => r.symbol === char)
      if (rule) {
        if (rule.probability === undefined || Math.random() < rule.probability) {
          next += rule.replacement
        } else {
          next += char
        }
      } else {
        next += char
      }
    }
    current = next
  }
  return current
}

function generateTreeGeometry(variant: number, seed: number): THREE.BufferGeometry {
  const rules = RULES[variant % RULES.length]
  const iterations = variant <= 1 ? 3 : 2
  const str = applyRules('F', rules, iterations)

  const angle = (22 + (seed % 18)) * Math.PI / 180
  const segmentLength = 0.4 + (seed % 10) * 0.02
  const thicknessDecay = 0.7

  const positions: number[] = []
  const stack: TurtleState[] = []
  let state: TurtleState = {
    x: 0, y: 0, z: 0,
    dx: 0, dy: 1, dz: 0,
    thickness: 0.08,
  }

  // Simple seeded random
  let rng = seed
  const random = () => {
    rng = (rng * 16807 + 0) % 2147483647
    return (rng & 0x7fffffff) / 0x7fffffff
  }

  for (const char of str) {
    switch (char) {
      case 'F': {
        const x2 = state.x + state.dx * segmentLength
        const y2 = state.y + state.dy * segmentLength
        const z2 = state.z + state.dz * segmentLength

        // Create cylinder segment as 4 triangles (a quad tube)
        const t = state.thickness
        const perpX = -state.dz
        const perpZ = state.dx
        const len = Math.sqrt(perpX * perpX + perpZ * perpZ) || 1

        const nx = perpX / len * t
        const nz = perpZ / len * t

        // Bottom quad
        positions.push(
          state.x - nx, state.y, state.z - nz,
          state.x + nx, state.y, state.z + nz,
          x2 + nx, y2, z2 + nz,

          state.x - nx, state.y, state.z - nz,
          x2 + nx, y2, z2 + nz,
          x2 - nx, y2, z2 - nz,
        )

        state.x = x2
        state.y = y2
        state.z = z2
        break
      }
      case '+': {
        // Rotate around Y (yaw) + slight random
        const a = angle + (random() - 0.5) * 0.3
        const cosA = Math.cos(a)
        const sinA = Math.sin(a)
        const ndx = state.dx * cosA - state.dz * sinA
        const ndz = state.dx * sinA + state.dz * cosA
        state.dx = ndx
        state.dz = ndz
        break
      }
      case '-': {
        const a = -angle + (random() - 0.5) * 0.3
        const cosA = Math.cos(a)
        const sinA = Math.sin(a)
        const ndx = state.dx * cosA - state.dz * sinA
        const ndz = state.dx * sinA + state.dz * cosA
        state.dx = ndx
        state.dz = ndz
        break
      }
      case '[':
        stack.push({ ...state })
        state.thickness *= thicknessDecay
        break
      case ']':
        if (stack.length > 0) {
          state = stack.pop()!
        }
        break
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.computeVertexNormals()
  return geometry
}

export function createTreeVariants(count: number): THREE.BufferGeometry[] {
  const variants: THREE.BufferGeometry[] = []
  for (let i = 0; i < count; i++) {
    variants.push(generateTreeGeometry(i, i * 7919 + 42))
  }
  return variants
}
