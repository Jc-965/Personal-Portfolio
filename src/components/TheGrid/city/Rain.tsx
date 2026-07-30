import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mulberry32 } from './rand'

/**
 * The rain itself: a single instanced draw of thin billboarded streaks
 * falling inside a volume that silently follows the camera (offsets wrap
 * within the volume, so the storm never ends and never needs respawning).
 * Slight wind shear, faint cyan tint, streak-length variance.
 */

const RAIN_SPAN = 70 // wrap volume edge (world units)
const RAIN_HEIGHT = 46

const vertexShader = /* glsl */ `
  attribute vec3 aCell;   // x,z offset within volume + fall phase
  attribute float aSpeed;
  attribute float aLength;
  uniform float uTime;
  uniform vec3 uCenter;
  varying float vFade;

  void main() {
    // Wrap the drop's xz around the camera-centred volume.
    vec2 cell = mod(aCell.xz - uCenter.xz, ${RAIN_SPAN.toFixed(1)}) - ${(RAIN_SPAN / 2).toFixed(1)};
    vec2 base = uCenter.xz + cell;
    float fall = mod(aCell.y + uTime * aSpeed, ${RAIN_HEIGHT.toFixed(1)});
    float y = ${RAIN_HEIGHT.toFixed(1)} - fall;

    // Billboard around Y toward the camera; streaks lean with the wind.
    vec3 toCam = normalize(vec3(cameraPosition.x - base.x, 0.0, cameraPosition.z - base.y));
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
    vec3 wind = vec3(0.16, -1.0, 0.05);
    vec3 world = vec3(base.x, y, base.y)
      + right * position.x
      + normalize(wind) * -position.y * aLength;

    // Fade drops right at the lens and at ground contact.
    float camDist = distance(world, cameraPosition);
    vFade = smoothstep(1.5, 6.0, camDist) * (1.0 - smoothstep(30.0, 46.0, camDist))
          * smoothstep(0.0, 2.5, y);

    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  varying float vFade;
  void main() {
    gl_FragColor = vec4(vec3(0.45, 0.65, 0.75), 0.34 * vFade);
  }
`

export default function Rain({ count }: { count: number }) {
  const { mesh, material } = useMemo(() => {
    const rng = mulberry32(777)
    const geometry = new THREE.PlaneGeometry(0.02, 1)
    const cells = new Float32Array(count * 3)
    const speeds = new Float32Array(count)
    const lengths = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      cells.set([rng() * RAIN_SPAN, rng() * RAIN_HEIGHT, rng() * RAIN_SPAN], i * 3)
      speeds[i] = 26 + rng() * 18
      lengths[i] = 0.5 + rng() * 0.9
    }
    geometry.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 3))
    geometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speeds, 1))
    geometry.setAttribute('aLength', new THREE.InstancedBufferAttribute(lengths, 1))

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uCenter: { value: new THREE.Vector3() },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
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
    ;(material.uniforms.uCenter.value as THREE.Vector3).copy(state.camera.position)
  })

  return <primitive object={mesh} />
}
