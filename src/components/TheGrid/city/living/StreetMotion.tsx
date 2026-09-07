import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { WORLD_TIME } from '../../navigation/session'
import { mulberry32 } from '../rand'

/** Sagging service wires and fabric strips share one instanced shader. */
export default function StreetMotion() {
  const { mesh, material } = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(1, 1, 24, 1)
    const count = 36, rng = mulberry32(32102)
    const positions = new Float32Array(count * 4)
    const styles = new Float32Array(count * 4)
    for (let index = 0; index < count; index++) {
      const market = index < 18
      positions.set([market ? -43 : 0, market ? 5.6 + rng() : 10 + rng() * 3,
        market ? -112 - Math.floor(index / 3) * 12 : 30 - Math.floor((index - 18) / 2) * 29, rng() * 6.28], index * 4)
      styles.set([market ? 17 : 24, index % 3 === 0 ? 0.65 : 0.025, rng(), index % 3 === 0 ? 1 : 0], index * 4)
    }
    geometry.setAttribute('aAnchor', new THREE.InstancedBufferAttribute(positions, 4))
    geometry.setAttribute('aStyle', new THREE.InstancedBufferAttribute(styles, 4))
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: WORLD_TIME }, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec4 aAnchor; attribute vec4 aStyle; uniform float uTime;
        varying vec2 vUv; varying vec4 vStyle; varying float vDistance;
        void main() {
          vUv = uv; vStyle = aStyle;
          float edge = 1.0 - pow(position.x * 2.0, 2.0);
          float gust = sin(uTime * 0.21) * 0.6 + sin(uTime * 0.67 + aAnchor.w) * 0.25;
          vec3 p = vec3(position.x * aStyle.x, position.y * aStyle.y - edge * 0.85, edge * gust * 0.35);
          p.z += sin(uv.x * 8.0 + uTime * 0.8 + aAnchor.w) * edge * aStyle.y * 0.2;
          vec4 view = viewMatrix * vec4(p + aAnchor.xyz, 1.0);
          vDistance = -view.z; gl_Position = projectionMatrix * view;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec4 vStyle; varying float vDistance;
        void main() {
          vec3 color = vec3(0.017, 0.023, 0.029);
          if (vStyle.w > 0.5) {
            color = mix(vec3(0.035, 0.14, 0.17), vec3(0.29, 0.046, 0.045), vStyle.z);
            float stripe = step(0.8, fract(vUv.x * 17.0));
            color += stripe * vec3(0.14, 0.09, 0.03);
            color *= 0.7 + sin(vUv.x * 160.0) * 0.04;
          }
          color = mix(color, vec3(0.002, 0.008, 0.016), smoothstep(45.0, 140.0, vDistance));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.frustumCulled = false
    return { mesh, material }
  }, [])
  useEffect(() => () => { mesh.geometry.dispose(); material.dispose() }, [mesh, material])
  return <primitive object={mesh} userData={{ noCollision: true }} />
}
