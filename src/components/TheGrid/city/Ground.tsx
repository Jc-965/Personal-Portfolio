import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { SCENE_BG } from './sceneColor'

/**
 * The dry-tier street: night asphalt with worn painted markings — dashed
 * centerline, lane dashes, kerb paint, crosswalks — and concrete sidewalks
 * with paving joints. The wet tier (WetStreet) draws the same road language
 * over real planar reflections; this is the fallback for low-end GPUs.
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
  uniform vec3 uBg;
  varying vec3 vWorld;
  varying float vViewDist;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    float ax = abs(vWorld.x);
    vec3 color = vec3(0.02, 0.03, 0.048) * (0.75 + 0.5 * vnoise(vWorld.xz * 1.7));

    // Painted road markings, worn down by traffic.
    float marks = 0.0;
    marks += (1.0 - smoothstep(0.07, 0.2, ax)) * step(fract(vWorld.z / 6.0), 0.5) * 0.9;
    marks += (1.0 - smoothstep(0.05, 0.15, abs(ax - 4.9))) * step(fract(vWorld.z / 9.0), 0.62) * 0.5;
    marks += (1.0 - smoothstep(0.1, 0.3, abs(ax - 9.6))) * 0.8;
    float cw = step(abs(vWorld.z - 34.0), 1.7)
             + step(abs(vWorld.z + 44.0), 1.7)
             + step(abs(vWorld.z + 90.0), 1.7)
             + step(abs(vWorld.z + 154.0), 1.7);
    marks += min(cw, 1.0) * step(ax, 8.8) * step(0.45, fract(vWorld.x / 1.35)) * 0.55;
    marks *= 0.55 + 0.45 * vnoise(vWorld.xz * 3.1);
    color += vec3(0.5, 0.52, 0.5) * marks * 0.32;

    // Sidewalks: lighter concrete, expansion joints every couple of metres.
    float walk = step(9.7, ax) * (1.0 - step(12.35, ax));
    vec3 pave = vec3(0.05, 0.055, 0.062) * (0.8 + 0.4 * vnoise(vWorld.xz * 2.3));
    float joint = 1.0 - smoothstep(0.02, 0.09, abs(fract(vWorld.z / 2.4) - 0.5) * 2.4);
    pave *= 1.0 - 0.35 * joint;
    color = mix(color, pave, walk);

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
          uBg: { value: SCENE_BG },
        },
      }),
    [],
  )
  const geometry = useMemo(() => new THREE.PlaneGeometry(700, 700), [])

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  return (
    <mesh
      geometry={geometry}
      material={material}
      rotation-x={-Math.PI / 2}
      position={[0, 0, -90]}
    />
  )
}
