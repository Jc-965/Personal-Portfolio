/* eslint-disable react/no-unknown-property */
import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getTerrainHeight } from './noiseUtils'
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

function PineTrees({ isMobile, getDeformOffset }: { isMobile: boolean; getDeformOffset?: (x: number, z: number) => number }) {
  const count = isMobile ? 18 : 45
  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.04, 0.08, 1, 5), [])
  const coneGeo = useMemo(() => new THREE.ConeGeometry(1, 1, 6), [])
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const botRef = useRef<THREE.InstancedMesh>(null)
  const midRef = useRef<THREE.InstancedMesh>(null)
  const topRef = useRef<THREE.InstancedMesh>(null)
  const smoothDeform = useRef<Float32Array | null>(null)

  useEffect(() => {
    return () => { trunkGeo.dispose(); coneGeo.dispose() }
  }, [trunkGeo, coneGeo])

  const treeData = useMemo(() => {
    return placementPositions(count, 120, 120, 3.5, 12345, 0.0, 7)
  }, [count])

  const crownColors = ['#4da636', '#5cb845', '#3e9e2a', '#68c44e', '#52b03a', '#45a830']

  const colorsInit = useRef(false)
  useEffect(() => {
    if (colorsInit.current) return
    const meshes = [botRef.current, midRef.current, topRef.current]
    const seeds = [11111, 22222, 33333]
    meshes.forEach((mesh, mi) => {
      if (!mesh) return
      const rand = seededRandom(seeds[mi])
      treeData.forEach((_, i) => {
        mesh.setColorAt(i, new THREE.Color(crownColors[Math.floor(rand() * crownColors.length)]))
      })
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })
    colorsInit.current = true
  })

  const _mat = useMemo(() => new THREE.Matrix4(), [])
  const _scl = useMemo(() => new THREE.Matrix4(), [])

  useFrame(() => {
    if (!trunkRef.current) return
    if (!smoothDeform.current || smoothDeform.current.length !== treeData.length) {
      smoothDeform.current = new Float32Array(treeData.length)
    }

    const LERP = 0.04
    for (let i = 0; i < treeData.length; i++) {
      const inst = treeData[i]
      const rawDeform = getDeformOffset ? getDeformOffset(inst.position.x, inst.position.z) : 0
      const prev = smoothDeform.current[i]
      smoothDeform.current[i] = prev + (rawDeform - prev) * LERP
      const yOff = smoothDeform.current[i]

      const trunkH = 1.6 + inst.scale * 1.0
      const botR = 0.9 + inst.scale * 0.5
      const botH = 1.4 + inst.scale * 0.6
      const midR = 0.65 + inst.scale * 0.35
      const midH = 1.2 + inst.scale * 0.5
      const topR = 0.4 + inst.scale * 0.2
      const topH = 1.0 + inst.scale * 0.4
      const baseY = inst.position.y + yOff

      _mat.makeTranslation(inst.position.x, baseY + trunkH * 0.5, inst.position.z)
      _scl.makeScale(1, trunkH, 1)
      _mat.multiply(_scl)
      trunkRef.current!.setMatrixAt(i, _mat)

      if (botRef.current) {
        _mat.makeTranslation(inst.position.x, baseY + trunkH + botH * 0.3, inst.position.z)
        _scl.makeScale(botR, botH, botR)
        _mat.multiply(_scl)
        botRef.current.setMatrixAt(i, _mat)
      }
      if (midRef.current) {
        _mat.makeTranslation(inst.position.x, baseY + trunkH + botH * 0.65 + midH * 0.3, inst.position.z)
        _scl.makeScale(midR, midH, midR)
        _mat.multiply(_scl)
        midRef.current.setMatrixAt(i, _mat)
      }
      if (topRef.current) {
        _mat.makeTranslation(inst.position.x, baseY + trunkH + botH * 0.65 + midH * 0.65 + topH * 0.3, inst.position.z)
        _scl.makeScale(topR, topH, topR)
        _mat.multiply(_scl)
        topRef.current.setMatrixAt(i, _mat)
      }
    }
    trunkRef.current.instanceMatrix.needsUpdate = true
    if (botRef.current) botRef.current.instanceMatrix.needsUpdate = true
    if (midRef.current) midRef.current.instanceMatrix.needsUpdate = true
    if (topRef.current) topRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={trunkRef} args={[trunkGeo, undefined, treeData.length]}>
        <meshStandardMaterial color="#8b6b4a" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={botRef} args={[coneGeo, undefined, treeData.length]}>
        <meshStandardMaterial vertexColors roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={midRef} args={[coneGeo, undefined, treeData.length]}>
        <meshStandardMaterial vertexColors roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={topRef} args={[coneGeo, undefined, treeData.length]}>
        <meshStandardMaterial vertexColors roughness={0.85} />
      </instancedMesh>
    </>
  )
}

function Grass({ isMobile }: { isMobile: boolean }) {
  const grassCount = isMobile ? 250 : 700
  const bladeGeo = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.lineTo(0.06, 0)
    shape.lineTo(0.03, 0.5)
    shape.lineTo(0, 0)
    const geo = new THREE.ShapeGeometry(shape)
    geo.rotateX(-Math.PI * 0.1)
    return geo
  }, [])

  useEffect(() => {
    return () => { bladeGeo.dispose() }
  }, [bladeGeo])

  const grassColors = ['#6aad48', '#7ab85a', '#5a9e3a', '#84c462', '#6cb04a']

  const grassData = useMemo(() => {
    return placementPositions(grassCount, 120, 120, 0.8, 33333, -0.3, 6)
  }, [grassCount])

  return (
    <instancedMesh
      args={[bladeGeo, undefined, grassData.length]}
      ref={(mesh: THREE.InstancedMesh | null) => {
        if (!mesh) return
        const mat = new THREE.Matrix4()
        const pos = new THREE.Matrix4()
        const rot = new THREE.Matrix4()
        const scl = new THREE.Matrix4()
        const rand = seededRandom(33334)
        grassData.forEach((g, i) => {
          const s = 1.0 + g.scale * 1.8
          pos.makeTranslation(g.position.x, g.position.y, g.position.z)
          rot.makeRotationY(g.rotation)
          scl.makeScale(s, s * (1.0 + g.scale * 0.6), s)
          mat.copy(pos).multiply(rot).multiply(scl)
          mesh.setMatrixAt(i, mat)
          const ci = Math.floor(rand() * grassColors.length)
          mesh.setColorAt(i, new THREE.Color(grassColors[ci]))
        })
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }}
    >
      <meshStandardMaterial vertexColors roughness={0.9} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

function Structures({ isMobile }: { isMobile: boolean }) {
  const structCount = isMobile ? 1 : 2
  const groupRef = useRef<THREE.Group>(null)

  const structs = useMemo(() => {
    const rand = seededRandom(77777)
    const geos = [
      new THREE.IcosahedronGeometry(0.8, 0),
      new THREE.DodecahedronGeometry(0.6, 0),
    ]

    const items: { geo: THREE.BufferGeometry; pos: THREE.Vector3; rotSpeed: number }[] = []
    let attempts = 0

    while (items.length < structCount && attempts < 200) {
      attempts++
      const x = (rand() - 0.5) * 60
      const z = (rand() - 0.5) * 60
      const h = getTerrainHeight(x, z)
      if (h < 1 || h > 5) continue
      const tooClose = items.some(i => Math.hypot(i.pos.x - x, i.pos.z - z) < 18)
      if (tooClose) continue

      items.push({
        geo: geos[Math.floor(rand() * geos.length)],
        pos: new THREE.Vector3(x, h + 1.8 + rand() * 1.5, z),
        rotSpeed: 0.12 + rand() * 0.2,
      })
    }
    return { items, geos }
  }, [structCount])

  useEffect(() => {
    return () => {
      structs.geos.forEach(g => g.dispose())
    }
  }, [structs])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.getElapsedTime()
    groupRef.current.children.forEach((child, i) => {
      const s = structs.items[i]
      if (!s) return
      child.rotation.y = t * s.rotSpeed
      child.rotation.x = Math.sin(t * 0.3 + i) * 0.3
      child.position.y = s.pos.y + Math.sin(t * 0.5 + i * 2) * 0.4
    })
  })

  return (
    <group ref={groupRef}>
      {structs.items.map((s, i) => (
        <mesh key={i} geometry={s.geo} position={s.pos}>
          <meshStandardMaterial
            color="#7a6858"
            wireframe
            transparent
            opacity={0.6}
          />
        </mesh>
      ))}
    </group>
  )
}

function Animals({ isMobile, animalsRef, carriedRef, getDeformOffset }: {
  isMobile: boolean
  animalsRef?: React.RefObject<THREE.Group | null>
  carriedRef?: React.RefObject<THREE.Mesh | null>
  getDeformOffset?: (worldX: number, worldZ: number) => number
}) {
  const groupRef = useRef<THREE.Group>(null)

  const animalData = useMemo(() => {
    const rand = seededRandom(54321)
    const waterLine = -1.5

    const types: { type: AnimalType; count: number; heightRange: [number, number] }[] = [
      { type: 'capybara', count: isMobile ? 4 : 9, heightRange: [waterLine, 3.0] },
      { type: 'tasmanianDevil', count: isMobile ? 1 : 4, heightRange: [0, 5] },
      { type: 'deer', count: isMobile ? 3 : 8, heightRange: [0.5, 6] },
      { type: 'rabbit', count: isMobile ? 3 : 8, heightRange: [0, 4.5] },
      { type: 'bird', count: isMobile ? 2 : 6, heightRange: [2, 8] },
      { type: 'scotty', count: 1, heightRange: [1, 5] },
    ]

    const animals: { type: AnimalType; geo: THREE.BufferGeometry; position: THREE.Vector3; rotation: number; scale: number; isFlying: boolean }[] = []

    for (const spec of types) {
      const geo = animalFactories[spec.type]()
      const positions = placementPositions(
        spec.count, 120, 120, 4.5, Math.floor(rand() * 100000),
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

  useEffect(() => {
    if (animalsRef && 'current' in animalsRef) {
      (animalsRef as React.MutableRefObject<THREE.Group | null>).current = groupRef.current
    }
  })

  useEffect(() => {
    return () => {
      const disposed = new Set<THREE.BufferGeometry>()
      animalData.forEach(a => {
        if (!disposed.has(a.geo)) { a.geo.dispose(); disposed.add(a.geo) }
      })
    }
  }, [animalData])

  const smoothDeformY = useRef<Float32Array | null>(null)

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.getElapsedTime()

    if (!smoothDeformY.current || smoothDeformY.current.length !== animalData.length) {
      smoothDeformY.current = new Float32Array(animalData.length)
    }

    const GROUND_CLEARANCE = 0.8
    const DEFORM_LERP = 0.04

    groupRef.current.children.forEach((child, i) => {
      const data = animalData[i]
      if (!data) return
      if (carriedRef?.current === child) return

      const phase = i * 2.71828
      let targetY: number

      if (data.isFlying) {
        const radius = 4 + (i % 3) * 1.5
        const speed = 0.25 + (i % 4) * 0.06
        const bankAngle = Math.sin(t * speed * 0.5 + phase) * 0.15
        child.position.x = data.position.x + Math.sin(t * speed + phase) * radius
        child.position.z = data.position.z + Math.cos(t * speed + phase) * radius
        child.position.y = data.position.y + Math.sin(t * 1.5 + phase) * 1.5 + Math.sin(t * 0.4 + phase * 0.3) * 2
        child.rotation.y = Math.atan2(
          Math.cos(t * speed + phase),
          -Math.sin(t * speed + phase)
        )
        child.rotation.z = Math.sin(t * speed + phase) * 0.35 + bankAngle
        child.rotation.x = Math.sin(t * 3.0 + phase) * 0.08
        return
      }

      let nx: number = child.position.x
      let nz: number = child.position.z
      let yBonus = 0

      if (data.type === 'rabbit') {
        const hopCycle = (t * 1.0 + phase) % 3.5
        const isHopping = hopCycle < 0.8
        if (isHopping) {
          const hopT = hopCycle / 0.8
          const dir = Math.floor((t * 1.0 + phase) / 3.5) * 1.618
          nx = data.position.x + Math.sin(phase + dir) * hopT * 1.4
          nz = data.position.z + Math.cos(phase + dir) * hopT * 1.4
          yBonus = Math.sin(hopT * Math.PI) * 1.8
          child.rotation.x = Math.sin(hopT * Math.PI) * 0.25
          child.rotation.y = phase + dir
        } else {
          const settleT = (hopCycle - 0.8) / 2.7
          child.rotation.y = data.rotation + Math.sin(t * 2.0 + phase) * 0.5
          child.rotation.x = 0
          child.rotation.z = Math.sin(t * 8.0 + phase) * 0.02 * (settleT < 0.3 ? 1 : 0)
        }
      } else if (data.type === 'deer') {
        const walkSpeed = 0.12 + (i % 3) * 0.04
        const wanderRadius = 3.5 + (i % 2) * 1.5
        nx = data.position.x + Math.sin(t * walkSpeed + phase) * wanderRadius
        nz = data.position.z + Math.cos(t * walkSpeed * 0.7 + phase) * wanderRadius * 0.7
        yBonus = Math.abs(Math.sin(t * walkSpeed * 3.5 + phase)) * 0.2
        child.rotation.y = Math.atan2(
          Math.cos(t * walkSpeed + phase) * walkSpeed,
          -Math.sin(t * walkSpeed * 0.7 + phase) * walkSpeed * 0.7
        )
        child.rotation.x = Math.sin(t * walkSpeed * 2.5 + phase) * 0.06
        const alertCycle = Math.sin(t * 0.15 + phase * 3)
        if (alertCycle > 0.92) {
          child.rotation.x = -0.08
        }
      } else if (data.type === 'capybara') {
        const ambleSpeed = 0.06 + (i % 3) * 0.025
        nx = data.position.x + Math.sin(t * ambleSpeed + phase) * 2.0
        nz = data.position.z + Math.cos(t * ambleSpeed * 0.5 + phase) * 1.4
        child.rotation.y = data.rotation + Math.sin(t * ambleSpeed + phase) * 0.6
        const grazeCycle = Math.sin(t * 0.35 + phase)
        child.rotation.x = grazeCycle > 0.6 ? (grazeCycle - 0.6) * 0.6 : 0
        child.rotation.z = Math.sin(t * 0.4 + phase) * 0.04
      } else if (data.type === 'scotty') {
        const trotSpeed = 0.22
        nx = data.position.x + Math.sin(t * trotSpeed + phase) * 2.8
        nz = data.position.z + Math.cos(t * trotSpeed * 0.8 + phase) * 2.0
        yBonus = Math.abs(Math.sin(t * trotSpeed * 5 + phase)) * 0.25
        child.rotation.y = data.rotation + Math.sin(t * trotSpeed + phase) * 0.7
        child.rotation.z = Math.sin(t * 4.0 + phase) * 0.08
        child.rotation.x = Math.sin(t * 6.0 + phase) * 0.03
      } else {
        const dartSpeed = 0.3 + (i % 3) * 0.1
        const dartRadius = 2.0 + (i % 2) * 1.0
        nx = data.position.x + Math.sin(t * dartSpeed + phase) * dartRadius
        nz = data.position.z + Math.cos(t * dartSpeed * 1.3 + phase) * dartRadius * 0.8
        child.rotation.y = data.rotation + Math.sin(t * dartSpeed + phase) * 1.0
        child.rotation.x = Math.sin(t * 3.0 + phase) * 0.12
        child.rotation.z = Math.sin(t * 2.0 + phase) * 0.08
        if (Math.sin(t * 1.2 + phase * 5) > 0.95) {
          child.rotation.y += 0.5
        }
      }

      child.position.x = nx
      child.position.z = nz

      const baseY = getTerrainHeight(nx, nz)
      const rawDeform = getDeformOffset ? getDeformOffset(nx, nz) : 0
      const prevSmooth = smoothDeformY.current![i]
      const smoothed = prevSmooth + (rawDeform - prevSmooth) * DEFORM_LERP
      smoothDeformY.current![i] = smoothed

      child.position.y = baseY + smoothed + GROUND_CLEARANCE + yBonus

      const persistedBase = child.userData.basePosition as THREE.Vector3 | undefined
      if (persistedBase) {
        data.position.copy(persistedBase)
        child.userData.basePosition = undefined
      }
    })
  })

  const getAnimalColor = (type: AnimalType): string => {
    switch (type) {
      case 'capybara': return '#b8935e'
      case 'tasmanianDevil': return '#6e4a3e'
      case 'scotty': return '#3d3d3d'
      case 'deer': return '#c49565'
      case 'bird': return '#5e9e7a'
      case 'rabbit': return '#d4bfa0'
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
          onUpdate={mesh => {
            if (!mesh.userData.basePosition) {
              mesh.userData.basePosition = a.position.clone()
            }
          }}
        >
          <meshStandardMaterial color={getAnimalColor(a.type)} roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

function River() {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = []
    const rand = seededRandom(99999)

    let x = -60
    let z = (rand() - 0.5) * 20

    for (let i = 0; i < 75; i++) {
      const h = getTerrainHeight(x, z)
      points.push(new THREE.Vector3(x, Math.min(h, -0.3) + 0.15, z))
      x += 1.65
      z += (rand() - 0.5) * 2.8
      z = Math.max(-60, Math.min(60, z))
    }

    const curve = new THREE.CatmullRomCurve3(points)
    return new THREE.TubeGeometry(curve, 80, 0.6, 5, false)
  }, [])

  useEffect(() => {
    return () => { geometry.dispose() }
  }, [geometry])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#3a6a90" transparent opacity={0.75} roughness={0.15} />
    </mesh>
  )
}

function Trail() {
  const geometry = useMemo(() => {
    const points: THREE.Vector3[] = []
    const rand = seededRandom(11111)

    let x = (rand() - 0.5) * 60
    let z = -60

    for (let i = 0; i < 75; i++) {
      const h = getTerrainHeight(x, z)
      points.push(new THREE.Vector3(x, h + 0.15, z))
      z += 1.6
      x += (rand() - 0.5) * 2.8
      x = Math.max(-60, Math.min(60, x))
    }

    const curve = new THREE.CatmullRomCurve3(points)
    return new THREE.TubeGeometry(curve, 75, 0.45, 4, false)
  }, [])

  useEffect(() => {
    return () => { geometry.dispose() }
  }, [geometry])

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color="#9a8a72" roughness={1.0} />
    </mesh>
  )
}

interface TerrainPopulationProps {
  isMobile: boolean
  getDeformOffset?: (worldX: number, worldZ: number) => number
  animalsRef?: React.RefObject<THREE.Group | null>
  carriedRef?: React.RefObject<THREE.Mesh | null>
}

export default function TerrainPopulation({ isMobile, getDeformOffset, animalsRef, carriedRef }: TerrainPopulationProps) {
  return (
    <group>
      <PineTrees isMobile={isMobile} getDeformOffset={getDeformOffset} />
      <Grass isMobile={isMobile} />
      <Structures isMobile={isMobile} />
      <Animals isMobile={isMobile} animalsRef={animalsRef} carriedRef={carriedRef} getDeformOffset={getDeformOffset} />
      <River />
      <Trail />
    </group>
  )
}
