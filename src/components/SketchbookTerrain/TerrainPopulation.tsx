import { useMemo, useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { cnoise, getTerrainHeight, getTerrainSample, type TerrainSample } from './noiseUtils'
import { animalFactories, type AnimalType } from './animals/animalDefinitions'

interface PlacedObject {
  position: THREE.Vector3
  rotation: number
  scale: number
  variant: number
  sample: TerrainSample
}

interface PlacementOptions {
  count: number
  rangeX: number
  rangeZ: number
  minDist: number
  seed: number
  maxAttemptsMultiplier?: number
  scaleRange?: [number, number]
  filter?: (sample: TerrainSample, x: number, z: number, rand: () => number) => boolean
}

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s & 0x7fffffff) / 0x7fffffff
  }
}

function remapNoise(value: number) {
  return value * 0.5 + 0.5
}

function createPlacements({
  count,
  rangeX,
  rangeZ,
  minDist,
  seed,
  maxAttemptsMultiplier = 70,
  scaleRange = [0.85, 1.45],
  filter,
}: PlacementOptions): PlacedObject[] {
  const rand = seededRandom(seed)
  const placed: PlacedObject[] = []
  const maxAttempts = count * maxAttemptsMultiplier
  let attempts = 0

  while (placed.length < count && attempts < maxAttempts) {
    attempts += 1
    const x = (rand() - 0.5) * rangeX
    const z = (rand() - 0.5) * rangeZ
    const sample = getTerrainSample(x, z)
    if (filter && !filter(sample, x, z, rand)) continue

    const tooClose = placed.some(item => Math.hypot(item.position.x - x, item.position.z - z) < minDist)
    if (tooClose) continue

    placed.push({
      position: new THREE.Vector3(x, sample.height, z),
      rotation: rand() * Math.PI * 2,
      scale: THREE.MathUtils.lerp(scaleRange[0], scaleRange[1], rand()),
      variant: Math.floor(rand() * 1000),
      sample,
    })
  }

  return placed
}

function forestDensity(sample: TerrainSample, x: number, z: number) {
  return sample.forest * 0.72 + remapNoise(cnoise(x * 0.045 + 14.0, z * 0.045 - 3.0)) * 0.38 - sample.slope * 0.42
}

function meadowDensity(sample: TerrainSample, x: number, z: number) {
  return sample.meadow * 0.68 + remapNoise(cnoise(x * 0.038 - 22.0, z * 0.038 + 9.0)) * 0.24 - sample.slope * 0.35
}

function PineTrees({ isMobile, getDeformOffset }: { isMobile: boolean; getDeformOffset?: (x: number, z: number) => number }) {
  const count = isMobile ? 18 : 54
  const trunkGeo = useMemo(() => new THREE.CylinderGeometry(0.05, 0.09, 1, 6), [])
  const coneGeo = useMemo(() => new THREE.ConeGeometry(1, 1, 7), [])
  const trunkRef = useRef<THREE.InstancedMesh>(null)
  const botRef = useRef<THREE.InstancedMesh>(null)
  const midRef = useRef<THREE.InstancedMesh>(null)
  const topRef = useRef<THREE.InstancedMesh>(null)
  const smoothDeform = useRef<Float32Array | null>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    return () => {
      trunkGeo.dispose()
      coneGeo.dispose()
    }
  }, [coneGeo, trunkGeo])

  const treeData = useMemo(() => createPlacements({
    count,
    rangeX: 108,
    rangeZ: 108,
    minDist: isMobile ? 4.4 : 3.8,
    seed: 12345,
    scaleRange: [0.95, 1.7],
    filter: (sample, x, z) => (
      sample.height > -1.6 &&
      sample.height < 11.2 &&
      sample.slope < 0.82 &&
      sample.meadow < 0.84 &&
      forestDensity(sample, x, z) > 0.74
    ),
  }), [count, isMobile])

  useEffect(() => {
    const layers = [botRef.current, midRef.current, topRef.current]
    if (layers.some(layer => !layer)) return

    layers.forEach((layer, layerIndex) => {
      if (!layer) return
      treeData.forEach((tree, index) => {
        const color = new THREE.Color().setHSL(
          THREE.MathUtils.lerp(0.25, 0.33, tree.sample.moisture),
          THREE.MathUtils.lerp(0.32, 0.48, 1 - tree.sample.meadow * 0.7),
          THREE.MathUtils.lerp(0.18 + layerIndex * 0.02, 0.35 + layerIndex * 0.02, tree.sample.moisture),
        )
        layer.setColorAt(index, color)
      })
      if (layer.instanceColor) layer.instanceColor.needsUpdate = true
    })
  }, [treeData])

  useFrame(() => {
    if (!trunkRef.current) return
    if (!smoothDeform.current || smoothDeform.current.length !== treeData.length) {
      smoothDeform.current = new Float32Array(treeData.length)
    }

    const deformLerp = 0.04
    for (let i = 0; i < treeData.length; i += 1) {
      const tree = treeData[i]
      const rawDeform = getDeformOffset ? getDeformOffset(tree.position.x, tree.position.z) : 0
      smoothDeform.current[i] += (rawDeform - smoothDeform.current[i]) * deformLerp
      const baseY = tree.position.y + smoothDeform.current[i]

      const trunkHeight = 1.7 + tree.scale * 1.25
      const lowerRadius = 0.92 + tree.scale * 0.52
      const lowerHeight = 1.55 + tree.scale * 0.7
      const midRadius = 0.68 + tree.scale * 0.38
      const midHeight = 1.34 + tree.scale * 0.58
      const topRadius = 0.42 + tree.scale * 0.24
      const topHeight = 1.12 + tree.scale * 0.42

      quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), tree.rotation)

      position.set(tree.position.x, baseY + trunkHeight * 0.5, tree.position.z)
      scale.set(1, trunkHeight, 1)
      matrix.compose(position, quaternion, scale)
      trunkRef.current.setMatrixAt(i, matrix)

      if (botRef.current) {
        position.set(tree.position.x, baseY + trunkHeight + lowerHeight * 0.3, tree.position.z)
        scale.set(lowerRadius, lowerHeight, lowerRadius)
        matrix.compose(position, quaternion, scale)
        botRef.current.setMatrixAt(i, matrix)
      }

      if (midRef.current) {
        position.set(tree.position.x, baseY + trunkHeight + lowerHeight * 0.68 + midHeight * 0.3, tree.position.z)
        scale.set(midRadius, midHeight, midRadius)
        matrix.compose(position, quaternion, scale)
        midRef.current.setMatrixAt(i, matrix)
      }

      if (topRef.current) {
        position.set(tree.position.x, baseY + trunkHeight + lowerHeight * 0.68 + midHeight * 0.66 + topHeight * 0.3, tree.position.z)
        scale.set(topRadius, topHeight, topRadius)
        matrix.compose(position, quaternion, scale)
        topRef.current.setMatrixAt(i, matrix)
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
        <meshStandardMaterial color="#8f7451" roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={botRef} args={[coneGeo, undefined, treeData.length]}>
        <meshStandardMaterial vertexColors roughness={0.86} />
      </instancedMesh>
      <instancedMesh ref={midRef} args={[coneGeo, undefined, treeData.length]}>
        <meshStandardMaterial vertexColors roughness={0.84} />
      </instancedMesh>
      <instancedMesh ref={topRef} args={[coneGeo, undefined, treeData.length]}>
        <meshStandardMaterial vertexColors roughness={0.82} />
      </instancedMesh>
    </>
  )
}

function Grass({ isMobile }: { isMobile: boolean }) {
  const grassCount = isMobile ? 170 : 520
  const bladeGeo = useMemo(() => {
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.lineTo(0.05, 0)
    shape.lineTo(0.025, 0.64)
    shape.lineTo(0, 0)
    const geometry = new THREE.ShapeGeometry(shape)
    geometry.rotateX(-Math.PI * 0.1)
    return geometry
  }, [])

  useEffect(() => {
    return () => {
      bladeGeo.dispose()
    }
  }, [bladeGeo])

  const grassData = useMemo(() => createPlacements({
    count: grassCount,
    rangeX: 108,
    rangeZ: 108,
    minDist: 0.78,
    seed: 33333,
    scaleRange: [0.7, 1.45],
    maxAttemptsMultiplier: 110,
    filter: (sample, x, z) => (
      sample.height > -1.8 &&
      sample.height < 9.8 &&
      sample.slope < 0.78 &&
      (sample.meadow > 0.24 || sample.moisture > 0.42 || meadowDensity(sample, x, z) > 0.62)
    ),
  }), [grassCount])

  return (
    <instancedMesh
      args={[bladeGeo, undefined, grassData.length]}
      ref={(mesh: THREE.InstancedMesh | null) => {
        if (!mesh) return

        const matrix = new THREE.Matrix4()
        const quaternion = new THREE.Quaternion()
        const position = new THREE.Vector3()
        const scale = new THREE.Vector3()

        grassData.forEach((blade, index) => {
          const bladeScale = 0.8 + blade.scale * 1.4 + blade.sample.moisture * 0.35
          position.set(blade.position.x, blade.position.y, blade.position.z)
          quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), blade.rotation)
          scale.set(bladeScale, bladeScale * (1.15 + blade.sample.moisture * 0.35), bladeScale)
          matrix.compose(position, quaternion, scale)
          mesh.setMatrixAt(index, matrix)
          mesh.setColorAt(
            index,
            new THREE.Color().setHSL(
              THREE.MathUtils.lerp(0.21, 0.3, blade.sample.moisture),
              THREE.MathUtils.lerp(0.34, 0.5, blade.sample.meadow + blade.sample.moisture * 0.3),
              THREE.MathUtils.lerp(0.28, 0.5, blade.sample.moisture + blade.sample.meadow * 0.25),
            ),
          )
        })
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }}
    >
      <meshStandardMaterial vertexColors roughness={0.92} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

function Shrubs({ isMobile }: { isMobile: boolean }) {
  const count = isMobile ? 9 : 28
  const shrubGeo = useMemo(() => new THREE.IcosahedronGeometry(0.55, 0), [])

  useEffect(() => {
    return () => {
      shrubGeo.dispose()
    }
  }, [shrubGeo])

  const shrubData = useMemo(() => createPlacements({
    count,
    rangeX: 106,
    rangeZ: 106,
    minDist: 2.1,
    seed: 45112,
    scaleRange: [0.75, 1.35],
    filter: (sample, x, z) => (
      sample.height > -1.2 &&
      sample.height < 9.2 &&
      sample.slope < 0.72 &&
      (forestDensity(sample, x, z) > 0.64 || meadowDensity(sample, x, z) > 0.62)
    ),
  }), [count])

  return (
    <instancedMesh
      args={[shrubGeo, undefined, shrubData.length]}
      ref={(mesh: THREE.InstancedMesh | null) => {
        if (!mesh) return

        const matrix = new THREE.Matrix4()
        const quaternion = new THREE.Quaternion()
        const position = new THREE.Vector3()
        const scale = new THREE.Vector3()

        shrubData.forEach((shrub, index) => {
          position.set(shrub.position.x, shrub.position.y + 0.45 * shrub.scale, shrub.position.z)
          quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), shrub.rotation)
          scale.set(0.8 + shrub.scale * 0.7, 0.55 + shrub.scale * 0.45, 0.8 + shrub.scale * 0.7)
          matrix.compose(position, quaternion, scale)
          mesh.setMatrixAt(index, matrix)
          mesh.setColorAt(
            index,
            new THREE.Color().setHSL(
              THREE.MathUtils.lerp(0.22, 0.31, shrub.sample.moisture),
              THREE.MathUtils.lerp(0.26, 0.42, shrub.sample.forest),
              THREE.MathUtils.lerp(0.2, 0.34, shrub.sample.moisture),
            ),
          )
        })
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }}
    >
      <meshStandardMaterial vertexColors roughness={0.88} />
    </instancedMesh>
  )
}

function Rocks({ isMobile }: { isMobile: boolean }) {
  const count = isMobile ? 6 : 18
  const rockGeo = useMemo(() => new THREE.DodecahedronGeometry(0.55, 0), [])

  useEffect(() => {
    return () => {
      rockGeo.dispose()
    }
  }, [rockGeo])

  const rockData = useMemo(() => createPlacements({
    count,
    rangeX: 110,
    rangeZ: 110,
    minDist: 2.8,
    seed: 99881,
    scaleRange: [0.7, 1.4],
    filter: sample => (
      sample.height > -2.2 &&
      sample.height < 15.0 &&
      (sample.rocky > 0.46 || (sample.slope > 0.38 && sample.moisture < 0.55))
    ),
  }), [count])

  return (
    <instancedMesh
      args={[rockGeo, undefined, rockData.length]}
      ref={(mesh: THREE.InstancedMesh | null) => {
        if (!mesh) return

        const matrix = new THREE.Matrix4()
        const quaternion = new THREE.Quaternion()
        const position = new THREE.Vector3()
        const scale = new THREE.Vector3()

        rockData.forEach((rock, index) => {
          position.set(rock.position.x, rock.position.y + 0.26 * rock.scale, rock.position.z)
          quaternion.setFromEuler(new THREE.Euler(rock.rotation * 0.18, rock.rotation, 0))
          scale.set(0.6 + rock.scale * 0.58, 0.42 + rock.scale * 0.34, 0.54 + rock.scale * 0.52)
          matrix.compose(position, quaternion, scale)
          mesh.setMatrixAt(index, matrix)
          mesh.setColorAt(index, new THREE.Color().setHSL(0.09, 0.08, THREE.MathUtils.lerp(0.34, 0.54, 1 - rock.sample.moisture * 0.4)))
        })
        mesh.instanceMatrix.needsUpdate = true
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }}
    >
      <meshStandardMaterial vertexColors roughness={1} />
    </instancedMesh>
  )
}

function FallenLogs({ isMobile }: { isMobile: boolean }) {
  const count = isMobile ? 3 : 7
  const logGeo = useMemo(() => {
    const geometry = new THREE.CylinderGeometry(0.09, 0.12, 1, 6)
    geometry.rotateZ(Math.PI / 2)
    return geometry
  }, [])

  useEffect(() => {
    return () => {
      logGeo.dispose()
    }
  }, [logGeo])

  const logData = useMemo(() => createPlacements({
    count,
    rangeX: 104,
    rangeZ: 104,
    minDist: 7.2,
    seed: 78231,
    scaleRange: [0.85, 1.6],
    filter: (sample, x, z) => (
      sample.height > -1.0 &&
      sample.height < 7.4 &&
      sample.slope < 0.48 &&
      meadowDensity(sample, x, z) > 0.56 &&
      sample.moisture > 0.22
    ),
  }), [count])

  return (
    <instancedMesh
      args={[logGeo, undefined, logData.length]}
      ref={(mesh: THREE.InstancedMesh | null) => {
        if (!mesh) return

        const matrix = new THREE.Matrix4()
        const quaternion = new THREE.Quaternion()
        const position = new THREE.Vector3()
        const scale = new THREE.Vector3()

        logData.forEach((log, index) => {
          position.set(log.position.x, log.position.y + 0.16, log.position.z)
          quaternion.setFromEuler(new THREE.Euler(0, log.rotation, THREE.MathUtils.lerp(-0.08, 0.08, log.sample.slope)))
          scale.set(1.4 + log.scale * 1.4, 0.9 + log.scale * 0.18, 0.9 + log.scale * 0.18)
          matrix.compose(position, quaternion, scale)
          mesh.setMatrixAt(index, matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
      }}
    >
      <meshStandardMaterial color="#816342" roughness={0.96} />
    </instancedMesh>
  )
}

function Animals({
  isMobile,
  animalsRef,
  carriedRef,
  getDeformOffset,
}: {
  isMobile: boolean
  animalsRef?: React.RefObject<THREE.Group | null>
  carriedRef?: React.RefObject<THREE.Mesh | null>
  getDeformOffset?: (worldX: number, worldZ: number) => number
}) {
  const groupRef = useRef<THREE.Group>(null)

  const animalData = useMemo(() => {
    const rand = seededRandom(54321)
    const animals: { type: AnimalType; geo: THREE.BufferGeometry; position: THREE.Vector3; rotation: number; scale: number; isFlying: boolean }[] = []
    const specs: { type: AnimalType; count: number; minDist?: number; filter: PlacementOptions['filter'] }[] = [
      {
        type: 'capybara',
        count: isMobile ? 1 : 5,
        filter: sample => sample.moisture > 0.58 && sample.height < 3.2 && sample.slope < 0.56,
      },
      {
        type: 'tasmanianDevil',
        count: isMobile ? 1 : 2,
        filter: sample => sample.height > -0.5 && sample.height < 6.8 && sample.slope < 0.64 && sample.moisture < 0.68,
      },
      {
        type: 'deer',
        count: isMobile ? 2 : 4,
        filter: sample => sample.height > -0.2 && sample.height < 7.4 && sample.slope < 0.58 && (sample.meadow > 0.24 || sample.forest > 0.45),
      },
      {
        type: 'rabbit',
        count: isMobile ? 2 : 4,
        filter: sample => sample.height > -0.6 && sample.height < 5.8 && sample.slope < 0.44 && sample.meadow > 0.34,
      },
      {
        type: 'bird',
        count: isMobile ? 1 : 2,
        filter: sample => sample.height > 1.2 && sample.height < 10.8 && sample.slope < 0.76,
      },
      {
        type: 'scotty',
        count: isMobile ? 1 : 3,
        minDist: 3.8,
        filter: sample => (
          sample.height > -0.4 &&
          sample.height < 5.8 &&
          sample.slope < 0.5 &&
          (sample.meadow > 0.2 || sample.forest > 0.22)
        ),
      },
    ]

    for (const spec of specs) {
      const geometry = animalFactories[spec.type]()
      const placements = createPlacements({
        count: spec.count,
        rangeX: 104,
        rangeZ: 104,
        minDist: spec.minDist ?? 4.8,
        seed: Math.floor(rand() * 100000),
        scaleRange: [0.92, 1.38],
        filter: spec.filter,
      })

      placements.forEach(item => {
        const isFlying = spec.type === 'bird'
        const position = item.position.clone()
        if (isFlying) position.y += 4.5 + rand() * 3.5

        animals.push({
          type: spec.type,
          geo: geometry,
          position,
          rotation: item.rotation,
          scale: spec.type === 'scotty' ? 3.45 + rand() * 0.5 : spec.type === 'bird' ? 2.4 : 3.0 + rand() * 1.7,
          isFlying,
        })
      })
    }

    return animals
  }, [isMobile])

  useEffect(() => {
    if (animalsRef && 'current' in animalsRef) {
      ;(animalsRef as React.MutableRefObject<THREE.Group | null>).current = groupRef.current
    }
  })

  useEffect(() => {
    return () => {
      const disposed = new Set<THREE.BufferGeometry>()
      animalData.forEach(animal => {
        if (!disposed.has(animal.geo)) {
          animal.geo.dispose()
          disposed.add(animal.geo)
        }
      })
    }
  }, [animalData])

  const smoothDeformY = useRef<Float32Array | null>(null)

  useFrame(({ clock }) => {
    if (!groupRef.current) return

    const time = clock.getElapsedTime()
    if (!smoothDeformY.current || smoothDeformY.current.length !== animalData.length) {
      smoothDeformY.current = new Float32Array(animalData.length)
    }

    const groundClearance = 0.8
    const deformLerp = 0.04

    groupRef.current.children.forEach((child, index) => {
      const data = animalData[index]
      if (!data || carriedRef?.current === child) return

      const phase = index * 2.71828

      if (data.isFlying) {
        const radius = 4 + (index % 3) * 1.5
        const speed = 0.25 + (index % 4) * 0.06
        const bankAngle = Math.sin(time * speed * 0.5 + phase) * 0.15
        child.position.x = data.position.x + Math.sin(time * speed + phase) * radius
        child.position.z = data.position.z + Math.cos(time * speed + phase) * radius
        child.position.y = data.position.y + Math.sin(time * 1.5 + phase) * 1.5 + Math.sin(time * 0.4 + phase * 0.3) * 2.0
        child.rotation.y = Math.atan2(Math.cos(time * speed + phase), -Math.sin(time * speed + phase))
        child.rotation.z = Math.sin(time * speed + phase) * 0.35 + bankAngle
        child.rotation.x = Math.sin(time * 3.0 + phase) * 0.08
        return
      }

      let nextX = child.position.x
      let nextZ = child.position.z
      let yBonus = 0

      switch (data.type) {
        case 'rabbit': {
          const hopCycle = (time * 1.0 + phase) % 3.5
          const isHopping = hopCycle < 0.8
          if (isHopping) {
            const hopT = hopCycle / 0.8
            const direction = Math.floor((time * 1.0 + phase) / 3.5) * 1.618
            nextX = data.position.x + Math.sin(phase + direction) * hopT * 1.4
            nextZ = data.position.z + Math.cos(phase + direction) * hopT * 1.4
            yBonus = Math.sin(hopT * Math.PI) * 1.8
            child.rotation.x = Math.sin(hopT * Math.PI) * 0.25
            child.rotation.y = phase + direction
          } else {
            const settleT = (hopCycle - 0.8) / 2.7
            child.rotation.y = data.rotation + Math.sin(time * 2.0 + phase) * 0.5
            child.rotation.x = 0
            child.rotation.z = Math.sin(time * 8.0 + phase) * 0.02 * (settleT < 0.3 ? 1 : 0)
          }
          break
        }
        case 'deer': {
          const walkSpeed = 0.12 + (index % 3) * 0.04
          const wanderRadius = 3.5 + (index % 2) * 1.5
          nextX = data.position.x + Math.sin(time * walkSpeed + phase) * wanderRadius
          nextZ = data.position.z + Math.cos(time * walkSpeed * 0.7 + phase) * wanderRadius * 0.7
          yBonus = Math.abs(Math.sin(time * walkSpeed * 3.5 + phase)) * 0.2
          child.rotation.y = Math.atan2(
            Math.cos(time * walkSpeed + phase) * walkSpeed,
            -Math.sin(time * walkSpeed * 0.7 + phase) * walkSpeed * 0.7,
          )
          child.rotation.x = Math.sin(time * walkSpeed * 2.5 + phase) * 0.06
          if (Math.sin(time * 0.15 + phase * 3.0) > 0.92) {
            child.rotation.x = -0.08
          }
          break
        }
        case 'capybara': {
          const ambleSpeed = 0.06 + (index % 3) * 0.025
          nextX = data.position.x + Math.sin(time * ambleSpeed + phase) * 2.0
          nextZ = data.position.z + Math.cos(time * ambleSpeed * 0.5 + phase) * 1.4
          child.rotation.y = data.rotation + Math.sin(time * ambleSpeed + phase) * 0.6
          const grazeCycle = Math.sin(time * 0.35 + phase)
          child.rotation.x = grazeCycle > 0.6 ? (grazeCycle - 0.6) * 0.6 : 0
          child.rotation.z = Math.sin(time * 0.4 + phase) * 0.04
          break
        }
        case 'scotty': {
          const trotSpeed = 0.22
          nextX = data.position.x + Math.sin(time * trotSpeed + phase) * 2.8
          nextZ = data.position.z + Math.cos(time * trotSpeed * 0.8 + phase) * 2.0
          yBonus = Math.abs(Math.sin(time * trotSpeed * 5.0 + phase)) * 0.25
          child.rotation.y = data.rotation + Math.sin(time * trotSpeed + phase) * 0.7
          child.rotation.z = Math.sin(time * 4.0 + phase) * 0.08
          child.rotation.x = Math.sin(time * 6.0 + phase) * 0.03
          break
        }
        case 'tasmanianDevil': {
          const dartSpeed = 0.3 + (index % 3) * 0.1
          const dartRadius = 2.0 + (index % 2) * 1.0
          nextX = data.position.x + Math.sin(time * dartSpeed + phase) * dartRadius
          nextZ = data.position.z + Math.cos(time * dartSpeed * 1.3 + phase) * dartRadius * 0.8
          child.rotation.y = data.rotation + Math.sin(time * dartSpeed + phase) * 1.0
          child.rotation.x = Math.sin(time * 3.0 + phase) * 0.12
          child.rotation.z = Math.sin(time * 2.0 + phase) * 0.08
          if (Math.sin(time * 1.2 + phase * 5.0) > 0.95) {
            child.rotation.y += 0.5
          }
          break
        }
        case 'bird':
          return
        default: {
          const exhaustiveCheck: never = data.type
          return exhaustiveCheck
        }
      }

      child.position.x = nextX
      child.position.z = nextZ

      const baseY = getTerrainHeight(nextX, nextZ)
      const rawDeform = getDeformOffset ? getDeformOffset(nextX, nextZ) : 0
      smoothDeformY.current![index] += (rawDeform - smoothDeformY.current![index]) * deformLerp
      child.position.y = baseY + smoothDeformY.current![index] + groundClearance + yBonus

      const persistedBase = child.userData.basePosition as THREE.Vector3 | undefined
      if (persistedBase) {
        data.position.copy(persistedBase)
        child.userData.basePosition = undefined
      }
    })
  })

  const getAnimalColor = (type: AnimalType): string => {
    switch (type) {
      case 'capybara':
        return '#ab8555'
      case 'tasmanianDevil':
        return '#5e4336'
      case 'scotty':
        return '#393838'
      case 'deer':
        return '#bc8d60'
      case 'bird':
        return '#587f73'
      case 'rabbit':
        return '#cfba9a'
      default: {
        const exhaustiveCheck: never = type
        return exhaustiveCheck
      }
    }
  }

  return (
    <group ref={groupRef}>
      {animalData.map((animal, index) => (
        <mesh
          key={index}
          geometry={animal.geo}
          position={animal.position}
          rotation={[0, animal.rotation, 0]}
          scale={animal.scale}
          onUpdate={mesh => {
            if (!mesh.userData.basePosition) {
              mesh.userData.basePosition = animal.position.clone()
            }
            mesh.userData.animalType = animal.type
          }}
        >
          <meshStandardMaterial color={getAnimalColor(animal.type)} roughness={0.88} />
        </mesh>
      ))}
    </group>
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
      <Shrubs isMobile={isMobile} />
      <Grass isMobile={isMobile} />
      <Rocks isMobile={isMobile} />
      <FallenLogs isMobile={isMobile} />
      <Animals isMobile={isMobile} animalsRef={animalsRef} carriedRef={carriedRef} getDeformOffset={getDeformOffset} />
    </group>
  )
}
