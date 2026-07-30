import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from './rand'
import { JUMBOTRON, PROJECT_SITES, RELAY_TOWER, BEYOND_SHOPS } from '../gridConfig'
import { STREETLIGHTS } from './streetlights'
import { SCENE_BG } from './sceneColor'
import type { GridTier } from '../gridPerformance'

/**
 * The air itself: drifting motes catching neon light, and volumetric-looking
 * light shafts rising from the city's beacons (crossed gradient quads — the
 * budget version of volumetrics, sold by bloom).
 */

const moteVertexShader = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uScale;
  varying float vSeed;
  varying float vDist;
  void main() {
    vSeed = aSeed;
    vec3 p = position;
    p.x += sin(uTime * 0.14 + aSeed * 12.0) * 2.2;
    p.y += sin(uTime * 0.1 + aSeed * 29.0) * 1.6;
    p.z += cos(uTime * 0.12 + aSeed * 7.0) * 2.2;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDist = -mv.z;
    // Hard cap so near motes never balloon into lens dirt.
    gl_PointSize = min((0.8 + fract(aSeed) * 1.4) * (uScale / -mv.z), 20.0);
    gl_Position = projectionMatrix * mv;
  }
`

const moteFragmentShader = /* glsl */ `
  uniform float uTime;
  varying float vSeed;
  varying float vDist;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float disc = 1.0 - smoothstep(0.05, 0.5, d);
    float breathe = 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * (0.5 + fract(vSeed)) + vSeed * 40.0));
    // Fade out anything close to the lens.
    float near = smoothstep(5.0, 14.0, vDist);
    gl_FragColor = vec4(vec3(0.35, 0.85, 0.9), disc * breathe * near * 0.18);
  }
`

function Motes({ tier }: { tier: GridTier }) {
  const count = tier === 'high' ? 200 : tier === 'mid' ? 130 : 60

  const { points, material } = useMemo(() => {
    const rng = mulberry32(4242)
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      // Concentrated over the avenue where the camera lives.
      positions.set(
        [(rng() - 0.5) * 60, 2 + rng() * 34, 60 - rng() * 240],
        i * 3,
      )
      seeds[i] = rng() * 100
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    const material = new THREE.ShaderMaterial({
      vertexShader: moteVertexShader,
      fragmentShader: moteFragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 340 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    return { points, material }
  }, [count])

  useEffect(() => () => {
    points.geometry.dispose()
    material.dispose()
  }, [points, material])

  useFrame(state => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return <primitive object={points} />
}

const shaftVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const shaftFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float horizontal = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 2.4);
    float vertical = pow(1.0 - vUv.y, 1.6);
    float shimmer = 0.85 + 0.15 * sin(uTime * 1.3 + vUv.y * 9.0);
    gl_FragColor = vec4(uColor, horizontal * vertical * shimmer * 0.34);
  }
`

function LightShaft({
  position,
  color,
  height = 26,
  width = 3,
}: {
  position: [number, number, number]
  color: string
  height?: number
  width?: number
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: shaftVertexShader,
        fragmentShader: shaftFragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uTime: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [color],
  )
  const geometry = useMemo(() => new THREE.PlaneGeometry(width, height), [width, height])

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  useFrame(state => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  // Crossed quads read as a volume from every travel angle.
  return (
    <group position={[position[0], position[1] + height / 2, position[2]]}>
      <mesh geometry={geometry} material={material} />
      <mesh geometry={geometry} material={material} rotation-y={Math.PI / 2} />
    </group>
  )
}

const ringVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ringFragmentShader = /* glsl */ `
  uniform vec3 uBg;
  varying vec2 vUv;
  varying vec3 vWorld;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    // Jagged skyline silhouette with sparse window noise, dissolving upward.
    float column = floor(vUv.x * 160.0);
    float skyline = 0.25 + 0.75 * hash(vec2(column, 7.0));
    if (vUv.y > skyline) discard;
    vec3 color = uBg * 1.4;
    vec2 cell = vec2(floor(vUv.x * 480.0), floor(vUv.y * 40.0));
    float lit = step(0.9, hash(cell));
    color += vec3(0.1, 0.35, 0.4) * lit * 0.35;
    float fadeTop = 1.0 - smoothstep(skyline - 0.3, skyline, vUv.y);
    gl_FragColor = vec4(mix(uBg, color, fadeTop), 1.0);
  }
`

const streakVertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const streakFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float along = pow(1.0 - vUv.y, 1.7);
    float across = pow(max(0.0, 1.0 - abs(vUv.x - 0.5) * 2.0), 1.6);
    gl_FragColor = vec4(uColor, along * across * 0.2 * uIntensity);
  }
`

interface StreakSource {
  x: number
  z: number
  color: string
  length: number
  intensity: number
}

/**
 * Wet-street reflections: an additive streak on the ground under each light
 * source, re-aimed at the camera every frame — the cheap trick that makes a
 * neon city read as rained-on asphalt instead of dry plastic.
 */
function WetReflections() {
  const sources = useMemo<StreakSource[]>(() => {
    const list: StreakSource[] = [
      { x: JUMBOTRON.tower.x, z: JUMBOTRON.tower.z + 3, color: '#00ffff', length: 18, intensity: 1.2 },
      { x: RELAY_TOWER.x, z: RELAY_TOWER.z, color: '#ffe9b0', length: 13, intensity: 0.6 },
    ]
    for (const site of PROJECT_SITES) {
      list.push({ x: site.x - 4, z: site.z, color: site.project.accent, length: 14, intensity: 1 })
    }
    for (const shop of BEYOND_SHOPS) {
      list.push({ x: shop.x + 3, z: shop.z, color: shop.item.accent, length: 10, intensity: 0.9 })
    }
    // Every other streetlight doubles into the asphalt — warm sodium smears
    // between the neon ones.
    STREETLIGHTS.forEach((lamp, i) => {
      if (i % 2 !== 0) return
      list.push({ x: lamp.x - lamp.side * 1.1, z: lamp.z, color: '#ffd9a0', length: 7, intensity: 0.55 })
    })
    return list
  }, [])

  const meshes = useRef<Array<THREE.Mesh | null>>([])
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(2.4, 1)
    g.translate(0, 0.5, 0) // anchor at the light's base; scale stretches outward
    return g
  }, [])
  const materials = useMemo(
    () =>
      sources.map(
        source =>
          new THREE.ShaderMaterial({
            vertexShader: streakVertexShader,
            fragmentShader: streakFragmentShader,
            uniforms: {
              uColor: { value: new THREE.Color(source.color) },
              uIntensity: { value: source.intensity },
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
      ),
    [sources],
  )

  useEffect(() => () => {
    geometry.dispose()
    for (const material of materials) material.dispose()
  }, [geometry, materials])

  useFrame(state => {
    const cam = state.camera.position
    sources.forEach((source, i) => {
      const mesh = meshes.current[i]
      if (!mesh) return
      const dx = cam.x - source.x
      const dz = cam.z - source.z
      // Local +Y (after laying flat) points to -Z; aim it at the camera.
      mesh.rotation.order = 'YXZ'
      mesh.rotation.y = Math.atan2(-dx, -dz) + Math.PI
      mesh.rotation.x = -Math.PI / 2
      mesh.scale.y = source.length
    })
  })

  return (
    <group>
      {sources.map((source, i) => (
        <mesh
          key={i}
          ref={el => { meshes.current[i] = el }}
          geometry={geometry}
          material={materials[i]}
          position={[source.x, 0.07, source.z]}
          renderOrder={3}
        />
      ))}
    </group>
  )
}

/** Slow searchlight beam sweeping the cloud deck from a distant rooftop —
 * the city has a life above the visitor's head. */
function Searchlight({
  position,
  color,
  height = 130,
  tilt = 0.3,
  speed = 0.1,
  phase = 0,
}: {
  position: [number, number, number]
  color: string
  height?: number
  tilt?: number
  speed?: number
  phase?: number
}) {
  const pivot = useRef<THREE.Group>(null)
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: shaftVertexShader,
        fragmentShader: shaftFragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(color) },
          uTime: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [color],
  )
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(4.5, height)
    g.translate(0, height / 2, 0) // pivot at the lamp, not the beam's middle
    return g
  }, [height])

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  useFrame(state => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    if (pivot.current) pivot.current.rotation.y = phase + state.clock.elapsedTime * speed
  })

  return (
    <group position={position}>
      <group ref={pivot}>
        <group rotation-z={tilt}>
          <mesh geometry={geometry} material={material} />
          <mesh geometry={geometry} material={material} rotation-y={Math.PI / 2} />
        </group>
      </group>
    </group>
  )
}

/** Distant silhouette skyline circling the city — hides the world's edge. */
function SkylineRing() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: ringVertexShader,
        fragmentShader: ringFragmentShader,
        uniforms: { uBg: { value: SCENE_BG } },
        side: THREE.BackSide,
      }),
    [],
  )
  const geometry = useMemo(
    () => new THREE.CylinderGeometry(240, 240, 55, 96, 1, true),
    [],
  )
  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])
  return <mesh geometry={geometry} material={material} position={[0, 27, -70]} />
}

export default function Atmosphere({ tier }: { tier: GridTier }) {
  return (
    <group>
      <SkylineRing />
      <WetReflections />
      <Motes tier={tier} />
      <LightShaft
        position={[JUMBOTRON.tower.x, JUMBOTRON.tower.height, JUMBOTRON.tower.z]}
        color="#00ffff"
        height={30}
      />
      {PROJECT_SITES.map(site => (
        <LightShaft
          key={site.project.id}
          position={[site.x, site.height, site.z]}
          color={site.project.accent}
          height={18}
          width={2.2}
        />
      ))}
      <LightShaft
        position={[RELAY_TOWER.x, RELAY_TOWER.height, RELAY_TOWER.z]}
        color="#ffcc00"
        height={24}
        width={2.6}
      />
      {/* Two far rooftop searchlights raking the clouds; both parked well off
          the avenue so they read as city texture, not signage. */}
      <Searchlight position={[-64, 30, -18]} color="#9fd8ff" phase={1.2} speed={0.09} />
      <Searchlight position={[58, 34, -118]} color="#ffd9a0" phase={4.1} speed={-0.07} tilt={0.36} />
      {/* No shaft on the sky deck — the final station belongs to the stars. */}
    </group>
  )
}
