import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../rand'
import { WORLD_TIME } from '../../navigation/session'
import { CROSS_STREETS, STATIONS } from '../../gridConfig'
import { SCENE_BG } from '../sceneColor'
import type { GridTier } from '../../gridPerformance'

/** Coats, limbs and umbrellas share one mesh and one GPU walk cycle. */
export default function Crowd({ tier }: { tier: GridTier }) {
  const count = tier === 'high' ? 120 : tier === 'mid' ? 64 : 18
  const { mesh, material } = useMemo(() => {
    const pieces: THREE.BufferGeometry[] = []
    const piece = (geometry: THREE.BufferGeometry, position: THREE.Vector3Tuple, part: number) => {
      geometry.translate(...position)
      geometry.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(part), 1))
      pieces.push(geometry)
    }
    piece(new THREE.BoxGeometry(0.47, 0.81, 0.3), [0, 1.04, 0], 0)
    piece(new THREE.SphereGeometry(0.12, 7, 5), [0, 1.57, 0], 0)
    piece(new THREE.BoxGeometry(0.15, 0.62, 0.18), [-0.13, 0.34, 0], 1)
    piece(new THREE.BoxGeometry(0.15, 0.62, 0.18), [0.13, 0.34, 0], 2)
    piece(new THREE.BoxGeometry(0.12, 0.64, 0.15), [-0.3, 1.04, 0], 2)
    piece(new THREE.BoxGeometry(0.12, 0.48, 0.15), [0.27, 1.18, 0.08], 0)
    piece(new THREE.ConeGeometry(0.73, 0.3, 10), [0.08, 1.99, 0.05], 3)
    piece(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 5), [0.08, 1.56, 0.05], 4)
    const geometry = mergeGeometries(pieces)!
    pieces.forEach(part => part.dispose())
    const rng = mulberry32(8221)
    const routes = new Float32Array(count * 4)
    const styles = new Float32Array(count * 4)
    const colors = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const crosswalk = i % 5 === 0
      const side = i % 2 ? 1 : -1
      routes.set([crosswalk ? 1 : 0, crosswalk ? CROSS_STREETS[i % CROSS_STREETS.length] : side * (10.65 + rng() * 0.4), i % 3 ? 1 : -1, rng() * 270], i * 4)
      styles.set([0.86 + rng() * 0.26, 0.55 + rng() * 0.45, rng(), rng() * 6.28], i * 4)
      const tint = new THREE.Color(STATIONS[1 + i % 4].accent)
      colors.set(tint.toArray(), i * 3)
    }
    geometry.setAttribute('aRoute', new THREE.InstancedBufferAttribute(routes, 4))
    geometry.setAttribute('aStyle', new THREE.InstancedBufferAttribute(styles, 4))
    geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3))
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: WORLD_TIME, uVisitor: { value: new THREE.Vector3() }, uBg: { value: SCENE_BG } },
      vertexShader: /* glsl */ `
        attribute float aPart; attribute vec4 aRoute; attribute vec4 aStyle; attribute vec3 aColor;
        uniform float uTime; uniform vec3 uVisitor;
        varying vec3 vNormal; varying vec3 vColor; varying float vDistance; varying float vUmbrella;
        void main() {
          float t = uTime * aStyle.y + aRoute.w;
          float walk = sin(t * 6.0 + aStyle.w);
          vec3 p = position;
          if (aPart > 0.5 && aPart < 2.5) p.z += walk * (aPart < 1.5 ? 0.14 : -0.14) * (1.0 - smoothstep(0.5, 1.5, p.y));
          if (aPart > 2.5) p.x += sin(uTime * 0.6 + aStyle.w) * 0.025;
          p *= aStyle.x;
          vec3 center = vec3(aRoute.y, 0.22, 38.0 - mod(t, 270.0));
          float yaw = aRoute.z < 0.0 ? 3.14159265 : 0.0;
          if (aRoute.z < 0.0) center.z = -232.0 + mod(t, 270.0);
          if (aRoute.x > 0.5) {
            float cycle = mod(uTime + aRoute.w, 38.0);
            float crossing = min(cycle, 22.0);
            center = vec3(-11.0 + crossing, 0.04, aRoute.y + (aStyle.z - 0.5) * 2.0);
            yaw = -1.5707963;
          }
          vec2 separation = center.xz - uVisitor.xz;
          float proximity = 1.0 - smoothstep(0.5, 2.0, length(separation));
          center.xz += normalize(separation + vec2(0.001)) * proximity * 0.8;
          mat2 turn = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw));
          p.xz = turn * p.xz;
          vec3 n = normal; n.xz = turn * n.xz;
          vNormal = n; vUmbrella = step(2.5, aPart) * (1.0 - step(3.5, aPart));
          vColor = aColor * (0.45 + 0.4 * aStyle.z);
          vec4 view = viewMatrix * vec4(center + p, 1.0);
          vDistance = -view.z; gl_Position = projectionMatrix * view;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uBg; varying vec3 vNormal; varying vec3 vColor; varying float vDistance; varying float vUmbrella;
        void main() {
          float key = 0.3 + 0.7 * max(dot(normalize(vNormal), normalize(vec3(0.4, 1.0, 0.3))), 0.0);
          vec3 coat = mix(vec3(0.016, 0.022, 0.03), vColor * 0.16, 0.28);
          vec3 color = mix(coat, vColor * 0.26 + vec3(0.015), vUmbrella) * key;
          color += pow(max(vNormal.y, 0.0), 8.0) * vec3(0.06, 0.085, 0.11);
          color = mix(color, uBg, smoothstep(35.0, 150.0, vDistance));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.frustumCulled = false
    mesh.userData.noCollision = true
    return { mesh, material }
  }, [count])
  useFrame(({ camera }) => { material.uniforms.uVisitor.value.copy(camera.position) })
  useEffect(() => () => { mesh.geometry.dispose(); material.dispose() }, [mesh, material])
  return <primitive object={mesh} />
}
