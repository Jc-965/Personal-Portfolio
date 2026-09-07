import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { WORLD_TIME } from '../../navigation/session'
import { mulberry32 } from '../rand'
import type { GridTier } from '../../gridPerformance'

export default function WeatherLife({ tier, reducedMotion }: { tier: GridTier; reducedMotion: boolean }) {
  const count = tier === 'high' ? 160 : tier === 'mid' ? 90 : 32
  const { mesh, material } = useMemo(() => {
    const rng = mulberry32(17292)
    const geometry = new THREE.PlaneGeometry(1, 1)
    const spots = new Float32Array(count * 4)
    const seeds = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const kind = i % 11 === 0 ? 1 : i % 3 === 0 ? 2 : 0
      const x = kind === 1 ? -41.1 : kind === 2 ? (rng() - 0.5) * 18 : (i % 2 ? 1 : -1) * 9.1
      const z = kind === 1 ? -167 : kind === 2 ? 36 - rng() * 272 : 27 - Math.floor(rng() * 16) * 16
      spots.set([x, 0.08, z, kind], i * 4)
      seeds.set([rng(), 0.5 + rng(), rng() * 6.28], i * 3)
    }
    geometry.setAttribute('aSpot', new THREE.InstancedBufferAttribute(spots, 4))
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 3))
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: WORLD_TIME }, transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 aSpot; attribute vec3 aSeed; uniform float uTime;
        varying vec2 vUv; varying float vLife; varying float vKind; varying float vFade;
        void main() {
          vUv = uv; vKind = aSpot.w;
          float life = fract(uTime * (aSpot.w == 1.0 ? 0.6 : aSpot.w == 2.0 ? 1.2 : 0.16) + aSeed.x);
          vLife = life;
          vec3 center = aSpot.xyz;
          float size = 0.4 + life * 2.7;
          if (aSpot.w == 0.0) { center.y += life * 3.3; center.x += sin(aSeed.z) * life * 0.65; }
          if (aSpot.w == 1.0) { center += vec3(sin(aSeed.z) * life * 2.0, sin(life * 3.14) * aSeed.y * 1.8 + 0.4, cos(aSeed.z) * life); size = 0.025; }
          if (aSpot.w == 2.0) size = life * 0.6 + 0.02;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
          vec3 world = center + (right * position.x + up * position.y) * size;
          if (aSpot.w == 2.0) world = center + vec3(position.x, 0.0, position.y) * size;
          vFade = 1.0 - smoothstep(25.0, 80.0, distance(world, cameraPosition));
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv; varying float vLife; varying float vKind; varying float vFade;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+1.0),f.x),f.y);
        }
        void main() {
          float radius = length(vUv - 0.5);
          float shape = 1.0 - smoothstep(0.13, 0.5, radius);
          float life = sin(vLife * 3.14159265);
          vec3 color = vec3(0.22, 0.32, 0.37); float opacity = 0.095;
          if (vKind == 0.0) shape *= noise(vUv * 7.0 + uTime * 0.05) * 0.7 + noise(vUv * 13.0) * 0.3;
          if (vKind == 1.0) { color = vec3(3.8, 1.5, 0.26); opacity = 0.65; }
          if (vKind == 2.0) { shape = (1.0 - smoothstep(0.02, 0.055, abs(radius - 0.35))); opacity = 0.1; }
          gl_FragColor = vec4(color, shape * life * opacity * vFade);
        }
      `,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.frustumCulled = false
    return { mesh, material }
  }, [count])
  useFrame(({ scene }) => {
    const moon = scene.getObjectByName('grid-moon') as THREE.DirectionalLight | undefined
    if (!moon) return
    const flash = !reducedMotion && !WORLD_TIME.frozen && WORLD_TIME.value > 60 && WORLD_TIME.value % 91 < 0.034
    moon.intensity = flash ? 14 : 1.25
    moon.color.set(flash ? '#edf4ff' : '#94abda')
  })
  useEffect(() => () => { mesh.geometry.dispose(); material.dispose() }, [mesh, material])
  return <primitive object={mesh} />
}
