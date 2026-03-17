/* eslint-disable react/no-unknown-property */
import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getTerrainHeight } from './noiseUtils'
import { createTreeVariants } from './LSystemTree'
import { animalFactories, type AnimalType } from './animals/animalDefinitions'

interface PlacedObject {
  position: THREE.Vector3
  rotation: number
  scale: number
  variant: number
}

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s & 0x7fffffff) / 0x7fffffff
  }
}

function placementPositions(
  count: number,
  rangeX: number,
  rangeZ: number,
  minDist: number,
  seed: number,
  heightMin: number,
  heightMax: number
): PlacedObject[] {
  const rand = seededRandom(seed)
  const placed: PlacedObject[] = []
  let attempts = 0
  const maxAttempts = count * 30

  while (placed.length < count && attempts < maxAttempts) {
    attempts++
    const x = (rand() - 0.5) * rangeX
    const z = (rand() - 0.5) * rangeZ
    const h = getTerrainHeight(x, z)

    if (h < heightMin || h > heightMax) continue

    const tooClose = placed.some(p =>
      Math.hypot(p.position.x - x, p.position.z - z) < minDist
    )
    if (tooClose) continue

    placed.push({
      position: new THREE.Vector3(x, h, z),
      rotation: rand() * Math.PI * 2,
      scale: 0.8 + rand() * 0.6,
      variant: Math.floor(rand() * 100),
    })
  }
  return placed
}

// Trees — L-system with instanced rendering
function Trees({ isMobile }: { isMobile: boolean }) {
  const treeCount = isMobile ? 12 : 30
  const treeVariants = useMemo(() => createTreeVariants(5), [])

  const treeData = useMemo(() => {
    return placementPositions(treeCount, 70, 70, 5, 12345, 0.5, 10)
  }, [treeCount])

  const grouped = useMemo(() => {
    const groups: Map<number, { geo: THREE.BufferGeometry; instances: PlacedObject[] }> = new Map()
    for (const t of treeData) {
      const vi = t.variant % treeVariants.length
      if (!groups.has(vi)) groups.set(vi, { geo: treeVariants[vi], instances: [] })
      groups.get(vi)!.instances.push(t)
    }
    return Array.from(groups.values())
  }, [treeData, treeVariants])

  return (
    <>
      {grouped.map((group, gi) => (
        <instancedMesh
          key={gi}
          args={[group.geo, undefined, group.instances.length]}
          ref={(mesh: THREE.InstancedMesh | null) => {
            if (!mesh) return
            const pos = new THREE.Matrix4()
            const rot = new THREE.Matrix4()
            const scl = new THREE.Matrix4()
            const mat = new THREE.Matrix4()
            group.instances.forEach((inst, i) => {
              const s = inst.scale * 4.0
              pos.makeTranslation(inst.position.x, inst.position.y, inst.position.z)
              rot.makeRotationY(inst.rotation)
              scl.makeScale(s, s, s)
              mat.copy(pos).multiply(rot).multiply(scl)
              mesh.setMatrixAt(i, mat)
            })
            mesh.instanceMatrix.needsUpdate = true
          }}
        >
          <meshStandardMaterial color="#3d5a3a" roughness={0.9} />
        </instancedMesh>
      ))}
    </>
  )
}

// Floating geometric structures
function Structures({ isMobile }: { isMobile: boolean }) {
  const structCount = isMobile ? 3 : 7
  const groupRef = useRef<THREE.Group>(null)

  const structs = useMemo(() => {
    const rand = seededRandom(77777)
    const geos = [
      new THREE.IcosahedronGeometry(1.2, 0),
      new THREE.DodecahedronGeometry(1.0, 0),
      new THREE.OctahedronGeometry(1.3, 0),
      new THREE.TetrahedronGeometry(1.0, 0),
      new THREE.TorusKnotGeometry(0.6, 0.2, 32, 8),
    ]

    const items: { geo: THREE.BufferGeometry; pos: THREE.Vector3; rotSpeed: number }[] = []
    let attempts = 0

    while (items.length < structCount && attempts < 200) {
      attempts++
      const x = (rand() - 0.5) * 60
      const z = (rand() - 0.5) * 60
      const h = getTerrainHeight(x, z)
      const tooClose = items.some(i => Math.hypot(i.pos.x - x, i.pos.z - z) < 8)
      if (tooClose) continue

      items.push({
        geo: geos[Math.floor(rand() * geos.length)],
        pos: new THREE.Vector3(x, h + 4 + rand() * 3, z),
        rotSpeed: 0.15 + rand() * 0.35,
      })
    }
    return items
  }, [structCount])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.getElapsedTime()
    groupRef.current.children.forEach((child, i) => {
      const s = structs[i]
      if (!s) return
      child.rotation.y = t * s.rotSpeed
      child.rotation.x = Math.sin(t * 0.3 + i) * 0.3
      child.position.y = s.pos.y + Math.sin(t * 0.5 + i * 2) * 0.6
    })
  })

  return (
    <group ref={groupRef}>
      {structs.map((s, i) => (
        <mesh key={i} geometry={s.geo} position={s.pos}>
          <meshStandardMaterial
            color="#7a6858"
            wireframe
            transparent
            opacity={0.8}
          />
        </mesh>
      ))}
    </group>
  )
}

// Animals — scaled up significantly
function Animals({ isMobile, animalsRef, carriedRef }: {
  isMobile: boolean
  animalsRef?: React.RefObject<THREE.Group | null>
  carriedRef?: React.RefObject<THREE.Mesh | null>
}) {
  const groupRef = useRef<THREE.Group>(null)

  const animalData = useMemo(() => {
    const rand = seededRandom(54321)
    const waterLine = -1.5

    const types: { type: AnimalType; count: number; heightRange: [number, number] }[] = [
      { type: 'capybara', count: isMobile ? 3 : 8, heightRange: [waterLine, 3] },
      { type: 'tasmanianDevil', count: isMobile ? 1 : 4, heightRange: [0, 7] },
      { type: 'deer', count: isMobile ? 2 : 5, heightRange: [1, 8] },
      { type: 'rabbit', count: isMobile ? 2 : 5, heightRange: [0, 5] },
      { type: 'bird', count: isMobile ? 2 : 5, heightRange: [3, 12] },
      { type: 'scotty', count: 1, heightRange: [2, 8] },
    ]

    const animals: { type: AnimalType; geo: THREE.BufferGeometry; position: THREE.Vector3; rotation: number; scale: number; isFlying: boolean }[] = []

    for (const spec of types) {
      const geo = animalFactories[spec.type]()
      const positions = placementPositions(
        spec.count, 70, 70, 4, Math.floor(rand() * 100000),
        spec.heightRange[0], spec.heightRange[1]
      )

      for (const p of positions) {
        const isFlying = spec.type === 'bird'
        const pos = p.position.clone()
        if (isFlying) pos.y += 5 + rand() * 4

        animals.push({
          type: spec.type,
          geo,
          position: pos,
          rotation: p.rotation,
          scale: spec.type === 'scotty' ? 3.5 : spec.type === 'bird' ? 2.5 : (3.0 + rand() * 2.0),
          isFlying,
        })
      }
    }

    return animals
  }, [isMobile])

  // Forward ref to parent for raycasting
  useEffect(() => {
    if (animalsRef && 'current' in animalsRef) {
      (animalsRef as React.MutableRefObject<THREE.Group | null>).current = groupRef.current
    }
  })

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.getElapsedTime()
    groupRef.current.children.forEach((child, i) => {
      const data = animalData[i]
      if (!data) return

      // Skip animation for carried animal
      if (carriedRef?.current === child) return

      const phase = i * 2.71828 // unique phase per animal

      if (data.isFlying) {
        // Birds: circular flight path with wing-flap bob
        const radius = 3 + (i % 3)
        const speed = 0.3 + (i % 4) * 0.05
        child.position.x = data.position.x + Math.sin(t * speed + phase) * radius
        child.position.z = data.position.z + Math.cos(t * speed + phase) * radius
        child.position.y = data.position.y + Math.sin(t * 2.0 + phase) * 0.8 // wing flap bob
        // Face direction of movement
        child.rotation.y = Math.atan2(
          Math.cos(t * speed + phase) * speed,
          -Math.sin(t * speed + phase) * speed
        )
        // Banking into turns
        child.rotation.z = Math.sin(t * speed + phase) * 0.3
      } else if (data.type === 'rabbit') {
        // Rabbits: periodic hopping
        const hopCycle = (t * 0.8 + phase) % 4.0
        const isHopping = hopCycle < 1.0
        if (isHopping) {
          const hopT = hopCycle // 0 to 1
          child.position.y = data.position.y + Math.sin(hopT * Math.PI) * 1.2
          child.position.x = data.position.x + Math.sin(phase) * hopT * 0.8
          child.position.z = data.position.z + Math.cos(phase) * hopT * 0.8
          child.rotation.x = Math.sin(hopT * Math.PI) * 0.15 // lean forward during hop
        } else {
          child.position.y = data.position.y
          child.position.x = data.position.x + Math.sin(phase) * (1.0 - (hopCycle - 1.0) / 3.0) * 0.8
          child.position.z = data.position.z + Math.cos(phase) * (1.0 - (hopCycle - 1.0) / 3.0) * 0.8
          // Idle ear twitch / head turn
          child.rotation.y = data.rotation + Math.sin(t * 1.5 + phase) * 0.3
          child.rotation.x = 0
        }
      } else if (data.type === 'deer') {
        // Deer: slow graceful walking, head raising
        const walkSpeed = 0.15 + (i % 3) * 0.05
        child.position.x = data.position.x + Math.sin(t * walkSpeed + phase) * 2.5
        child.position.z = data.position.z + Math.cos(t * walkSpeed * 0.7 + phase) * 1.5
        // Face walking direction
        child.rotation.y = Math.atan2(
          Math.cos(t * walkSpeed + phase) * walkSpeed,
          -Math.sin(t * walkSpeed * 0.7 + phase) * walkSpeed * 0.7
        )
        // Gentle walking bob
        child.position.y = data.position.y + Math.abs(Math.sin(t * walkSpeed * 3 + phase)) * 0.15
        child.rotation.x = Math.sin(t * 0.3 + phase) * 0.04 // head raise
      } else if (data.type === 'capybara') {
        // Capybaras: very slow amble, occasional head dip (grazing)
        const ambleSpeed = 0.08 + (i % 3) * 0.03
        child.position.x = data.position.x + Math.sin(t * ambleSpeed + phase) * 1.5
        child.position.z = data.position.z + Math.cos(t * ambleSpeed * 0.6 + phase) * 1.0
        child.rotation.y = data.rotation + Math.sin(t * ambleSpeed + phase) * 0.5
        // Grazing dip every few seconds
        const grazeCycle = Math.sin(t * 0.4 + phase)
        child.rotation.x = grazeCycle > 0.7 ? (grazeCycle - 0.7) * 0.4 : 0
        child.rotation.z = Math.sin(t * 0.5 + phase) * 0.03
      } else if (data.type === 'scotty') {
        // Scotty: energetic trot, tail wag implied by rotation
        const trotSpeed = 0.2
        child.position.x = data.position.x + Math.sin(t * trotSpeed + phase) * 2.0
        child.position.z = data.position.z + Math.cos(t * trotSpeed * 0.8 + phase) * 1.5
        child.position.y = data.position.y + Math.abs(Math.sin(t * trotSpeed * 4 + phase)) * 0.2
        child.rotation.y = data.rotation + Math.sin(t * trotSpeed + phase) * 0.6
        child.rotation.z = Math.sin(t * 3.0 + phase) * 0.06 // tail wag body wiggle
      } else {
        // Tasmanian devils: quick darting movement
        const dartSpeed = 0.25 + (i % 3) * 0.08
        const dartRadius = 1.5 + (i % 2)
        child.position.x = data.position.x + Math.sin(t * dartSpeed + phase) * dartRadius
        child.position.z = data.position.z + Math.cos(t * dartSpeed * 1.3 + phase) * dartRadius * 0.8
        child.rotation.y = data.rotation + Math.sin(t * dartSpeed + phase) * 0.8
        // Quick head movements
        child.rotation.x = Math.sin(t * 2.0 + phase) * 0.08
        child.rotation.z = Math.sin(t * 1.5 + phase) * 0.06
      }
    })
  })

  // Color per animal type
  const getAnimalColor = (type: AnimalType): string => {
    switch (type) {
      case 'capybara': return '#8b6d4a'
      case 'tasmanianDevil': return '#4a3832'
      case 'scotty': return '#2d2d2d'
      case 'deer': return '#a07850'
      case 'bird': return '#5a6e55'
      case 'rabbit': return '#b8a088'
    }
  }

  return (
    <group ref={groupRef}>
      {animalData.map((a, i) => (
        <mesh
          key={i}
          geometry={a.geo}
          position={a.position}
          rotation={[0, a.rotation, 0]}
          scale={a.scale}
        >
          <meshStandardMaterial color={getAnimalColor(a.type)} roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

// River
function River() {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = []
    const rand = seededRandom(99999)

    let x = -40
    let z = (rand() - 0.5) * 20

    for (let i = 0; i < 55; i++) {
      const h = getTerrainHeight(x, z)
      points.push(new THREE.Vector3(x, Math.min(h, -0.5) + 0.2, z))
      x += 1.5
      z += (rand() - 0.5) * 3.5
      z = Math.max(-40, Math.min(40, z))
    }

    const curve = new THREE.CatmullRomCurve3(points)
    return new THREE.TubeGeometry(curve, 48, 1.0, 6, false)
  }, [])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#3a6a90" transparent opacity={0.8} roughness={0.15} />
    </mesh>
  )
}

// Dirt path
function Trail() {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = []
    const rand = seededRandom(11111)

    let x = (rand() - 0.5) * 40
    let z = -38

    for (let i = 0; i < 50; i++) {
      const h = getTerrainHeight(x, z)
      points.push(new THREE.Vector3(x, h + 0.15, z))
      z += 1.5
      x += (rand() - 0.5) * 2.5
      x = Math.max(-40, Math.min(40, x))
    }

    const curve = new THREE.CatmullRomCurve3(points)
    return new THREE.TubeGeometry(curve, 40, 0.45, 4, false)
  }, [])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#9a8a72" roughness={1.0} />
    </mesh>
  )
}

interface TerrainPopulationProps {
  isMobile: boolean
  animalsRef?: React.RefObject<THREE.Group | null>
  carriedRef?: React.RefObject<THREE.Mesh | null>
}

export default function TerrainPopulation({ isMobile, animalsRef, carriedRef }: TerrainPopulationProps) {
  return (
    <group>
      <Trees isMobile={isMobile} />
      <Structures isMobile={isMobile} />
      <Animals isMobile={isMobile} animalsRef={animalsRef} carriedRef={carriedRef} />
      <River />
      <Trail />
    </group>
  )
}
