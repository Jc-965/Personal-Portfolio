import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from './rand'
import { JUMBOTRON, PROJECT_SITES, RELAY_TOWER } from '../gridConfig'
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
  void main() {
    vSeed = aSeed;
    vec3 p = position;
    p.x += sin(uTime * 0.14 + aSeed * 12.0) * 2.2;
    p.y += sin(uTime * 0.1 + aSeed * 29.0) * 1.6;
    p.z += cos(uTime * 0.12 + aSeed * 7.0) * 2.2;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (0.8 + fract(aSeed) * 1.4) * (uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`

const moteFragmentShader = /* glsl */ `
  uniform float uTime;
  varying float vSeed;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float disc = smoothstep(0.5, 0.05, d);
    float breathe = 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * (0.5 + fract(vSeed)) + vSeed * 40.0));
    gl_FragColor = vec4(vec3(0.35, 0.85, 0.9), disc * breathe * 0.2);
  }
`

function Motes({ tier }: { tier: GridTier }) {
  const count = tier === 'high' ? 320 : tier === 'mid' ? 200 : 90

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

export default function Atmosphere({ tier }: { tier: GridTier }) {
  return (
    <group>
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
      {/* No shaft on the sky deck — the final station belongs to the stars. */}
    </group>
  )
}
