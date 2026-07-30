import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from './rand'
import { SCENE_BG } from './sceneColor'
import type { GridTier } from '../gridPerformance'

/**
 * Traffic, two layers in one draw call: street-level cars running the
 * avenue's lanes (white headlights oncoming, red tails receding — the
 * reference shot's traffic), and sparse light-craft threading the skyline
 * above. All motion happens in the vertex shader (per-instance
 * lane/speed/phase), zero per-frame JS.
 */

const Z_MIN = -230
const Z_SPAN = 320

const vertexShader = /* glsl */ `
  attribute vec3 aLane;      // x, y, direction (+1 toward camera start, -1 away)
  attribute float aSpeed;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uTime;
  varying vec3 vColor;
  varying float vLocalZ;
  varying float vViewDist;

  void main() {
    float travel = mod(aPhase + uTime * aSpeed, ${Z_SPAN.toFixed(1)});
    float z = ${Z_MIN.toFixed(1)} + (aLane.z > 0.0 ? travel : ${Z_SPAN.toFixed(1)} - travel);
    // Craft point their nose along their direction of travel.
    vec3 local = vec3(position.x, position.y, position.z * aLane.z);
    vec3 world = vec3(aLane.x, aLane.y, z) + local;
    vColor = aColor;
    vLocalZ = position.z * aLane.z;
    vec4 mv = viewMatrix * vec4(world, 1.0);
    vViewDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uBg;
  varying vec3 vColor;
  varying float vLocalZ;
  varying float vViewDist;

  void main() {
    // White-hot headlight nose, colored body, dimmer tail.
    float head = smoothstep(0.4, 1.4, -vLocalZ);
    float tail = smoothstep(0.2, 1.4, vLocalZ);
    vec3 color = mix(vColor * 1.6, vec3(1.4), head);
    color = mix(color, vColor * 0.4, tail);
    float fade = smoothstep(90.0, 240.0, vViewDist);
    color = mix(color, uBg, fade);
    gl_FragColor = vec4(color, 1.0);
  }
`

const LANE_COLORS = ['#00ffff', '#ff5aa0', '#ffcc00', '#7efcff', '#ff8a3c', '#b287ff']

export default function Traffic({ tier }: { tier: GridTier }) {
  const count = tier === 'high' ? 130 : tier === 'mid' ? 85 : 40

  const { mesh, material } = useMemo(() => {
    const rng = mulberry32(31337)
    const geometry = new THREE.BoxGeometry(0.45, 0.1, 2.6)
    const lanes = new Float32Array(count * 3)
    const speeds = new Float32Array(count)
    const phases = new Float32Array(count)
    const colors = new Float32Array(count * 3)
    const tint = new THREE.Color()

    for (let i = 0; i < count; i++) {
      if (i % 5 < 2) {
        // Street cars: right-hand traffic — west lanes drive toward the
        // camera's travel direction (−z), east lanes come at it (+z), so
        // the visitor sees red tails ahead and white headlights oncoming.
        const lane = [-4.6, -2.1, 2.1, 4.6][Math.floor(rng() * 4)]
        const dir = lane < 0 ? -1 : 1
        lanes.set([lane + (rng() - 0.5) * 0.5, 0.55, dir], i * 3)
        speeds[i] = 11 + rng() * 9
        phases[i] = rng() * Z_SPAN
        tint.set(dir < 0 ? '#ff4a3c' : '#ffd9b0')
        colors.set([tint.r, tint.g, tint.b], i * 3)
        continue
      }
      // Light-craft hugging the skyline sides or crossing high overhead.
      const side = rng() > 0.5 ? 1 : -1
      const nearAvenue = rng() > 0.72
      const x = nearAvenue ? (rng() - 0.5) * 26 : side * (16 + rng() * 60)
      // Capped below the sky deck (y 34) so craft thread the skyline without
      // streaking through the constellation view.
      const y = nearAvenue ? 24 + rng() * 6 : 10 + rng() * 20
      lanes.set([x, y, rng() > 0.5 ? 1 : -1], i * 3)
      speeds[i] = 9 + rng() * 16
      phases[i] = rng() * Z_SPAN
      tint.set(LANE_COLORS[Math.floor(rng() * LANE_COLORS.length)])
      colors.set([tint.r, tint.g, tint.b], i * 3)
    }

    geometry.setAttribute('aLane', new THREE.InstancedBufferAttribute(lanes, 3))
    geometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1))
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1))
    geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3))

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uBg: { value: SCENE_BG },
      },
    })

    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.frustumCulled = false
    return { mesh, material }
  }, [count])

  useEffect(() => () => {
    mesh.geometry.dispose()
    material.dispose()
  }, [mesh, material])

  useFrame(state => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return <primitive object={mesh} />
}
