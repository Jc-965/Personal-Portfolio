import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { STREET } from '../gridConfig'
import { mulberry32 } from './rand'

const STREET_LENGTH = STREET.zStart - STREET.zEnd
const STREET_CENTER_Z = (STREET.zStart + STREET.zEnd) / 2

function RoadAndSidewalks() {
  const sidewalkWidth = STREET.sidewalkOuter - STREET.halfWidth
  const sidewalkX = STREET.halfWidth + sidewalkWidth / 2

  return (
    <group>
      <mesh
        position={[0, 0.028, STREET_CENTER_Z]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        renderOrder={2}
      >
        <planeGeometry args={[STREET.halfWidth * 2, STREET_LENGTH]} />
        <meshStandardMaterial
          roughness={0.47}
          metalness={0.02}
          color="#89939c"
          envMapIntensity={1.1}
          transparent
          opacity={0.34}
          depthWrite={false}
        />
      </mesh>

      {[-1, 1].map(side => (
        <group key={side}>
          <mesh
            position={[side * sidewalkX, 0.11, STREET_CENTER_Z]}
            receiveShadow
            castShadow
          >
            <boxGeometry args={[sidewalkWidth, 0.22, STREET_LENGTH]} />
            <meshStandardMaterial
              roughness={0.73}
              metalness={0.02}
              color="#75808a"
              envMapIntensity={0.75}
            />
          </mesh>
          <mesh
            position={[side * (STREET.halfWidth + 0.1), 0.19, STREET_CENTER_Z]}
            receiveShadow
            castShadow
          >
            <boxGeometry args={[0.24, 0.38, STREET_LENGTH]} />
            <meshStandardMaterial
              roughness={0.68}
              color="#68737c"
              envMapIntensity={0.72}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function RoadStuds() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const placements = useMemo(() => {
    const result: Array<{ x: number; z: number; color: THREE.Color }> = []
    for (let z = STREET.zStart - 4, index = 0; z > STREET.zEnd + 3; z -= 5.8, index++) {
      result.push({
        x: index % 2 === 0 ? -0.16 : 0.16,
        z,
        color: new THREE.Color(index % 4 === 0 ? '#ffd08a' : '#d7f4ff'),
      })
      if (index % 2 === 0) {
        result.push({ x: -7.45, z, color: new THREE.Color('#61cfff') })
        result.push({ x: 7.45, z, color: new THREE.Color('#ff5d86') })
      }
    }
    return result
  }, [])

  useLayoutEffect(() => {
    if (!ref.current) return
    const matrix = new THREE.Matrix4()
    placements.forEach((placement, index) => {
      matrix.makeTranslation(placement.x, 0.09, placement.z)
      ref.current?.setMatrixAt(index, matrix)
      ref.current?.setColorAt(index, placement.color)
    })
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  }, [placements])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, placements.length]} castShadow>
      <boxGeometry args={[0.22, 0.08, 0.5]} />
      <meshStandardMaterial
        color="#dcefff"
        emissive="#9fdcff"
        emissiveIntensity={1.8}
        roughness={0.28}
        metalness={0.32}
        vertexColors
        toneMapped={false}
      />
    </instancedMesh>
  )
}

function DrainGrates() {
  const baseRef = useRef<THREE.InstancedMesh>(null)
  const slitRef = useRef<THREE.InstancedMesh>(null)
  const drains = useMemo(() => {
    const result: Array<[number, number]> = []
    for (let z = STREET.zStart - 9; z > STREET.zEnd + 5; z -= 17) {
      result.push([-9.14, z], [9.14, z - 7.5])
    }
    return result
  }, [])

  useLayoutEffect(() => {
    const base = baseRef.current
    const slits = slitRef.current
    if (!base || !slits) return
    const matrix = new THREE.Matrix4()
    let slitIndex = 0
    drains.forEach(([x, z], index) => {
      matrix.makeTranslation(x, 0.225, z)
      base.setMatrixAt(index, matrix)
      for (let offset = -0.39; offset <= 0.4; offset += 0.26) {
        matrix.makeTranslation(x, 0.25, z + offset)
        slits.setMatrixAt(slitIndex, matrix)
        slitIndex++
      }
    })
    base.instanceMatrix.needsUpdate = true
    slits.instanceMatrix.needsUpdate = true
  }, [drains])

  return (
    <group>
      <instancedMesh ref={baseRef} args={[undefined, undefined, drains.length]} receiveShadow>
        <boxGeometry args={[0.7, 0.045, 1.18]} />
        <meshStandardMaterial color="#11161a" metalness={0.88} roughness={0.34} />
      </instancedMesh>
      <instancedMesh ref={slitRef} args={[undefined, undefined, drains.length * 4]}>
        <boxGeometry args={[0.56, 0.012, 0.075]} />
        <meshStandardMaterial color="#020406" metalness={0.96} roughness={0.22} />
      </instancedMesh>
    </group>
  )
}

function ManholesAndPuddles() {
  const coverRef = useRef<THREE.InstancedMesh>(null)
  const puddleRef = useRef<THREE.InstancedMesh>(null)
  const details = useMemo(() => {
    const rng = mulberry32(1108)
    const covers: Array<[number, number]> = []
    const puddles: Array<{ x: number; z: number; sx: number; sz: number; rotation: number }> = []
    for (let index = 0; index < 13; index++) {
      covers.push([(rng() - 0.5) * 9, STREET.zEnd + 16 + rng() * (STREET_LENGTH - 32)])
    }
    for (let index = 0; index < 24; index++) {
      puddles.push({
        x: (rng() - 0.5) * 15.5,
        z: STREET.zEnd + 8 + rng() * (STREET_LENGTH - 16),
        sx: 0.7 + rng() * 1.8,
        sz: 0.35 + rng() * 1.2,
        rotation: rng() * Math.PI,
      })
    }
    return { covers, puddles }
  }, [])

  useLayoutEffect(() => {
    if (!coverRef.current || !puddleRef.current) return
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()
    details.covers.forEach(([x, z], index) => {
      matrix.makeTranslation(x, 0.075, z)
      coverRef.current?.setMatrixAt(index, matrix)
    })
    details.puddles.forEach((puddle, index) => {
      position.set(puddle.x, 0.066, puddle.z)
      quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, puddle.rotation))
      scale.set(puddle.sx, puddle.sz, 1)
      matrix.compose(position, quaternion, scale)
      puddleRef.current?.setMatrixAt(index, matrix)
    })
    coverRef.current.instanceMatrix.needsUpdate = true
    puddleRef.current.instanceMatrix.needsUpdate = true
  }, [details])

  return (
    <group>
      <instancedMesh ref={coverRef} args={[undefined, undefined, details.covers.length]} receiveShadow>
        <cylinderGeometry args={[0.62, 0.62, 0.055, 48]} />
        <meshStandardMaterial
          color="#1b2429"
          metalness={0.84}
          roughness={0.31}
          envMapIntensity={1.3}
        />
      </instancedMesh>
      <instancedMesh
        ref={puddleRef}
        args={[undefined, undefined, details.puddles.length]}
        renderOrder={3}
      >
        <circleGeometry args={[1, 36]} />
        <meshPhysicalMaterial
          color="#07141c"
          metalness={0.26}
          roughness={0.08}
          clearcoat={1}
          clearcoatRoughness={0.04}
          envMapIntensity={2.4}
          transparent
          opacity={0.58}
          depthWrite={false}
        />
      </instancedMesh>
    </group>
  )
}

function CrosswalksAndBollards() {
  const stripeRef = useRef<THREE.InstancedMesh>(null)
  const bollardRef = useRef<THREE.InstancedMesh>(null)
  const ringRef = useRef<THREE.InstancedMesh>(null)
  const crossings = [-73, -145, -204]
  const bollards = useMemo(() => {
    const result: Array<[number, number]> = []
    for (const z of [-88, -104, -120, -136, -158, -174, -190]) {
      result.push([-11.25, z], [11.25, z + 4])
    }
    return result
  }, [])

  useLayoutEffect(() => {
    if (!stripeRef.current || !bollardRef.current || !ringRef.current) return
    const matrix = new THREE.Matrix4()
    let stripeIndex = 0
    for (const z of crossings) {
      for (let x = -8.4; x <= 8.4; x += 1.55) {
        matrix.makeTranslation(x, 0.082, z)
        stripeRef.current.setMatrixAt(stripeIndex, matrix)
        stripeIndex++
      }
    }
    bollards.forEach(([x, z], index) => {
      matrix.makeTranslation(x, 0.68, z)
      bollardRef.current?.setMatrixAt(index, matrix)
      matrix.makeTranslation(x, 1.03, z)
      ringRef.current?.setMatrixAt(index, matrix)
    })
    stripeRef.current.instanceMatrix.needsUpdate = true
    bollardRef.current.instanceMatrix.needsUpdate = true
    ringRef.current.instanceMatrix.needsUpdate = true
  }, [bollards, crossings])

  return (
    <group>
      <instancedMesh ref={stripeRef} args={[undefined, undefined, crossings.length * 11]} receiveShadow>
        <boxGeometry args={[0.82, 0.018, 3.6]} />
        <meshStandardMaterial
          color="#aeb8b4"
          roughness={0.66}
          metalness={0.02}
          transparent
          opacity={0.7}
        />
      </instancedMesh>
      <instancedMesh ref={bollardRef} args={[undefined, undefined, bollards.length]} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 0.92, 16]} />
        <meshStandardMaterial color="#171d21" metalness={0.72} roughness={0.28} />
      </instancedMesh>
      <instancedMesh ref={ringRef} args={[undefined, undefined, bollards.length]}>
        <cylinderGeometry args={[0.151, 0.151, 0.075, 16]} />
        <meshStandardMaterial
          color="#74efff"
          emissive="#31dfff"
          emissiveIntensity={4}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  )
}

function UtilityWires() {
  const geometries = useMemo(() => {
    const result: THREE.TubeGeometry[] = []
    for (let index = 0; index < 11; index++) {
      const z = 34 - index * 25
      const height = 13 + (index % 3) * 2.2
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-14.2, height, z),
        new THREE.Vector3(0, height - 2.4, z - 1.5),
        new THREE.Vector3(14.2, height + 0.4, z - 3),
      )
      result.push(new THREE.TubeGeometry(curve, 24, 0.028, 6, false))
    }
    return result
  }, [])
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({
      color: '#11171d',
      metalness: 0.78,
      roughness: 0.42,
    }),
    [],
  )

  useEffect(() => () => {
    geometries.forEach(geometry => geometry.dispose())
    material.dispose()
  }, [geometries, material])

  return (
    <group>
      {geometries.map((geometry, index) => (
        <mesh key={index} geometry={geometry} material={material} castShadow />
      ))}
    </group>
  )
}

function RisingSteam() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const geometry = useMemo(() => {
    const rng = mulberry32(771)
    const vents = [
      [-4.2, -12],
      [3.6, -64],
      [-5.5, -112],
      [4.7, -166],
      [-3.4, -214],
    ]
    const count = 180
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    for (let index = 0; index < count; index++) {
      const vent = vents[index % vents.length]
      positions.set([
        vent[0] + (rng() - 0.5) * 0.8,
        0.18,
        vent[1] + (rng() - 0.5) * 0.8,
      ], index * 3)
      seeds[index] = rng()
    }
    const next = new THREE.BufferGeometry()
    next.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    next.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    return next
  }, [])

  useFrame(state => {
    if (materialRef.current) materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
  })

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
        uniforms={{ uTime: { value: 0 } }}
        vertexShader={/* glsl */ `
          attribute float aSeed;
          uniform float uTime;
          varying float vFade;
          void main() {
            float age = mod(aSeed * 5.0 + uTime * (0.34 + aSeed * 0.28), 5.0);
            vec3 p = position;
            p.y += age;
            p.x += sin(age * 1.45 + aSeed * 23.0) * age * 0.12;
            p.z += cos(age * 1.2 + aSeed * 17.0) * age * 0.08;
            vFade = sin(clamp(age / 5.0, 0.0, 1.0) * 3.14159);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (15.0 + age * 8.0) * (260.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `}
        fragmentShader={/* glsl */ `
          varying float vFade;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float alpha = (1.0 - smoothstep(0.12, 0.5, d)) * vFade * 0.13;
            gl_FragColor = vec4(0.52, 0.7, 0.76, alpha);
          }
        `}
      />
    </points>
  )
}


function StreetLamps() {
  const poleRef = useRef<THREE.InstancedMesh>(null)
  const headRef = useRef<THREE.InstancedMesh>(null)
  const glowRef = useRef<THREE.InstancedMesh>(null)
  const lamps = useMemo(() => {
    const result: Array<{ x: number; z: number }> = []
    for (let z = STREET.zStart - 6; z > STREET.zEnd + 8; z -= 22) {
      result.push({ x: -STREET.sidewalkOuter + 0.55, z })
      result.push({ x: STREET.sidewalkOuter - 0.55, z: z - 11 })
    }
    return result
  }, [])

  useLayoutEffect(() => {
    if (!poleRef.current || !headRef.current || !glowRef.current) return
    const matrix = new THREE.Matrix4()
    lamps.forEach((lamp, index) => {
      matrix.makeTranslation(lamp.x, 4.2, lamp.z)
      poleRef.current?.setMatrixAt(index, matrix)
      matrix.makeTranslation(lamp.x + Math.sign(lamp.x) * -0.45, 8.35, lamp.z)
      headRef.current?.setMatrixAt(index, matrix)
      matrix.makeTranslation(lamp.x + Math.sign(lamp.x) * -0.45, 8.05, lamp.z)
      glowRef.current?.setMatrixAt(index, matrix)
    })
    poleRef.current.instanceMatrix.needsUpdate = true
    headRef.current.instanceMatrix.needsUpdate = true
    glowRef.current.instanceMatrix.needsUpdate = true
  }, [lamps])

  return (
    <group>
      <instancedMesh ref={poleRef} args={[undefined, undefined, lamps.length]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 8.4, 6]} />
        <meshStandardMaterial color="#1a2229" metalness={0.72} roughness={0.38} />
      </instancedMesh>
      <instancedMesh ref={headRef} args={[undefined, undefined, lamps.length]}>
        <boxGeometry args={[0.85, 0.18, 0.42]} />
        <meshStandardMaterial color="#2a343c" metalness={0.55} roughness={0.42} />
      </instancedMesh>
      <instancedMesh ref={glowRef} args={[undefined, undefined, lamps.length]}>
        <boxGeometry args={[0.62, 0.08, 0.28]} />
        <meshStandardMaterial
          color="#ffd7a1"
          emissive="#ffb45c"
          emissiveIntensity={2.4}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  )
}

function SidewalkFurniture() {
  const binRef = useRef<THREE.InstancedMesh>(null)
  const planterRef = useRef<THREE.InstancedMesh>(null)
  const hydrantRef = useRef<THREE.InstancedMesh>(null)
  const props = useMemo(() => {
    const rng = mulberry32(0x51de)
    const bins: Array<[number, number]> = []
    const planters: Array<[number, number]> = []
    const hydrants: Array<[number, number]> = []
    for (let z = STREET.zStart - 10; z > STREET.zEnd + 12; z -= 19) {
      bins.push([-STREET.sidewalkOuter + 1.1, z + rng() * 3])
      bins.push([STREET.sidewalkOuter - 1.1, z - 8 + rng() * 2])
      planters.push([-STREET.halfWidth - 1.3, z - 4])
      planters.push([STREET.halfWidth + 1.3, z - 12])
      if (rng() > 0.35) hydrants.push([-(STREET.halfWidth + 0.55), z - 2.5])
      if (rng() > 0.45) hydrants.push([STREET.halfWidth + 0.55, z - 15])
    }
    return { bins, planters, hydrants }
  }, [])

  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4()
    props.bins.forEach(([x, z], index) => {
      matrix.makeTranslation(x, 0.55, z)
      binRef.current?.setMatrixAt(index, matrix)
    })
    props.planters.forEach(([x, z], index) => {
      matrix.makeTranslation(x, 0.32, z)
      planterRef.current?.setMatrixAt(index, matrix)
    })
    props.hydrants.forEach(([x, z], index) => {
      matrix.makeTranslation(x, 0.48, z)
      hydrantRef.current?.setMatrixAt(index, matrix)
    })
    if (binRef.current) binRef.current.instanceMatrix.needsUpdate = true
    if (planterRef.current) planterRef.current.instanceMatrix.needsUpdate = true
    if (hydrantRef.current) hydrantRef.current.instanceMatrix.needsUpdate = true
  }, [props])

  return (
    <group>
      <instancedMesh ref={binRef} args={[undefined, undefined, props.bins.length]} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 1.05, 8]} />
        <meshStandardMaterial color="#1c242b" metalness={0.55} roughness={0.48} />
      </instancedMesh>
      <instancedMesh ref={planterRef} args={[undefined, undefined, props.planters.length]} castShadow>
        <boxGeometry args={[0.9, 0.55, 0.9]} />
        <meshStandardMaterial color="#3a454d" roughness={0.82} metalness={0.08} />
      </instancedMesh>
      <instancedMesh ref={hydrantRef} args={[undefined, undefined, props.hydrants.length]} castShadow>
        <cylinderGeometry args={[0.16, 0.2, 0.9, 8]} />
        <meshStandardMaterial
          color="#c4453a"
          emissive="#6a1c16"
          emissiveIntensity={0.25}
          metalness={0.35}
          roughness={0.45}
        />
      </instancedMesh>
    </group>
  )
}

function LaneDashes() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const dashes = useMemo(() => {
    const result: number[] = []
    for (let z = STREET.zStart - 2; z > STREET.zEnd + 2; z -= 3.4) result.push(z)
    return result
  }, [])

  useLayoutEffect(() => {
    if (!ref.current) return
    const matrix = new THREE.Matrix4()
    dashes.forEach((z, index) => {
      matrix.makeTranslation(0, 0.045, z)
      ref.current?.setMatrixAt(index, matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
  }, [dashes])

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, dashes.length]}>
      <boxGeometry args={[0.18, 0.02, 1.5]} />
      <meshStandardMaterial
        color="#d8e6f0"
        emissive="#8eb4cc"
        emissiveIntensity={0.35}
        roughness={0.55}
        metalness={0.05}
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </instancedMesh>
  )
}

function NeonShopfronts() {
  const awningRef = useRef<THREE.InstancedMesh>(null)
  const glowRef = useRef<THREE.InstancedMesh>(null)
  const fronts = useMemo(() => {
    const rng = mulberry32(0x71a2)
    const result: Array<{ x: number; z: number; color: THREE.Color; width: number }> = []
    const palette = ['#31dfff', '#ff5d86', '#ffb347', '#7dffb3', '#c58cff']
    for (let z = STREET.zStart - 14; z > STREET.zEnd + 16; z -= 14) {
      const color = new THREE.Color(palette[Math.floor(rng() * palette.length)])
      result.push({
        x: -STREET.sidewalkOuter + 0.2,
        z: z + rng() * 2,
        color,
        width: 2.4 + rng() * 1.8,
      })
      result.push({
        x: STREET.sidewalkOuter - 0.2,
        z: z - 7 + rng() * 2,
        color: new THREE.Color(palette[Math.floor(rng() * palette.length)]),
        width: 2.2 + rng() * 1.6,
      })
    }
    return result
  }, [])

  useLayoutEffect(() => {
    if (!awningRef.current || !glowRef.current) return
    const matrix = new THREE.Matrix4()
    const quaternion = new THREE.Quaternion()
    const position = new THREE.Vector3()
    const scale = new THREE.Vector3()
    fronts.forEach((front, index) => {
      const faceIn = Math.sign(front.x) * -1
      position.set(front.x + faceIn * 0.55, 3.1, front.z)
      quaternion.setFromEuler(new THREE.Euler(0, faceIn > 0 ? 0 : Math.PI, 0))
      scale.set(front.width, 0.16, 0.9)
      matrix.compose(position, quaternion, scale)
      awningRef.current?.setMatrixAt(index, matrix)
      position.set(front.x + faceIn * 0.2, 2.55, front.z)
      scale.set(front.width * 0.92, 1.4, 0.08)
      matrix.compose(position, quaternion, scale)
      glowRef.current?.setMatrixAt(index, matrix)
      glowRef.current?.setColorAt(index, front.color)
    })
    awningRef.current.instanceMatrix.needsUpdate = true
    glowRef.current.instanceMatrix.needsUpdate = true
    if (glowRef.current.instanceColor) glowRef.current.instanceColor.needsUpdate = true
  }, [fronts])

  return (
    <group>
      <instancedMesh ref={awningRef} args={[undefined, undefined, fronts.length]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#1a2229" metalness={0.45} roughness={0.55} />
      </instancedMesh>
      <instancedMesh ref={glowRef} args={[undefined, undefined, fronts.length]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial
          color="#7adfff"
          emissive="#4ec8ff"
          emissiveIntensity={1.6}
          toneMapped={false}
          transparent
          opacity={0.55}
          depthWrite={false}
          vertexColors
        />
      </instancedMesh>
    </group>
  )
}

export default function StreetDetails() {
  return (
    <group>
      <RoadAndSidewalks />
      <LaneDashes />
      <RoadStuds />
      <DrainGrates />
      <ManholesAndPuddles />
      <CrosswalksAndBollards />
      <StreetLamps />
      <SidewalkFurniture />
      <NeonShopfronts />
      <UtilityWires />
      <RisingSteam />
    </group>
  )
}
