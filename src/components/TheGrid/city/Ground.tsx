import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { SCENE_BG } from './sceneColor'

/**
 * The street plane: a shader grid (the site's background grid made literal)
 * with data pulses streaming down the avenue corridor the camera travels.
 */

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  varying float vViewDist;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mv = viewMatrix * world;
    vViewDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uBg;
  uniform vec3 uLine;
  varying vec3 vWorld;
  varying float vViewDist;

  float gridLine(vec2 p, float spacing, float thickness) {
    vec2 g = abs(fract(p / spacing - 0.5) - 0.5) * spacing;
    float d = min(g.x, g.y);
    return 1.0 - smoothstep(0.0, thickness, d);
  }

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  void main() {
    vec3 color = uBg * 0.9;

    float minor = gridLine(vWorld.xz, 2.0, 0.05);
    float major = gridLine(vWorld.xz, 10.0, 0.09);
    color += uLine * (minor * 0.06 + major * 0.16);

    // Kerb light-lines flanking the avenue — the street reads as a street,
    // not an infinite plane with a grid on it.
    float kerb = 1.0 - smoothstep(0.06, 0.22, abs(abs(vWorld.x) - 9.6));
    color += uLine * kerb * 0.22;

    // Data pulses: bright packets streaming along the avenue lanes.
    float lane = floor(vWorld.x / 2.0);
    if (abs(vWorld.x) < 9.0) {
      float speed = 0.25 + hash(lane) * 0.3;
      float phase = fract(vWorld.z * 0.012 + uTime * speed + hash(lane * 3.7));
      float packet = smoothstep(0.035, 0.0, abs(phase - 0.5) - 0.012);
      float onLane = 1.0 - smoothstep(0.12, 0.4, abs(fract(vWorld.x / 2.0 - 0.5) - 0.5) * 2.0);
      color += uLine * packet * onLane * 0.9;
    }

    float fade = smoothstep(50.0, 175.0, vViewDist);
    color = mix(color, uBg, fade);
    gl_FragColor = vec4(color, 1.0);
  }
`

export default function Ground() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uBg: { value: SCENE_BG },
          uLine: { value: new THREE.Color('#00ffff') },
        },
      }),
    [],
  )
  const geometry = useMemo(() => new THREE.PlaneGeometry(700, 700), [])

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  useFrame(state => {
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return (
    <mesh
      geometry={geometry}
      material={material}
      rotation-x={-Math.PI / 2}
      position={[0, 0, -70]}
    />
  )
}
