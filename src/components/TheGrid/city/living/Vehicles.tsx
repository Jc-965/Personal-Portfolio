import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { WORLD_TIME } from '../../navigation/session'
import { mulberry32 } from '../rand'
import { SCENE_BG } from '../sceneColor'
import type { GridTier } from '../../gridPerformance'

const motion = /* glsl */ `
  attribute vec4 aRoute; attribute vec4 aStyle; uniform float uTime;
  vec3 vehiclePosition() {
    float span = 340.0;
    float z = -265.0 + mod(aRoute.w + uTime * aStyle.x, span);
    if (aRoute.z < 0.0) z = 75.0 - mod(aRoute.w + uTime * aStyle.x, span);
    return vec3(aRoute.x, aRoute.y, z);
  }
  vec3 vehicleLocal(vec3 p) {
    p.z *= aStyle.y; p.y *= aStyle.z;
    p.z *= aRoute.z;
    return p;
  }
`

/** Cars, taxis, buses, hovercraft and drones move entirely in vertex shaders. */
export default function Vehicles({ tier }: { tier: GridTier }) {
  const count = tier === 'high' ? 46 : tier === 'mid' ? 30 : 12
  const bundle = useMemo(() => {
    const geometries: THREE.BufferGeometry[] = []
    const part = (size: THREE.Vector3Tuple, center: THREE.Vector3Tuple, kind: number) => {
      const geo = new THREE.BoxGeometry(...size)
      geo.translate(...center)
      geo.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(kind), 1))
      geometries.push(geo)
    }
    part([1.7, 0.48, 4.1], [0, 0.54, 0], 0)
    part([1.49, 0.6, 2.4], [0, 1.04, 0.1], 1)
    for (const x of [-0.82, 0.82]) for (const z of [-1.25, 1.25]) part([0.18, 0.5, 0.5], [x, 0.28, z], 2)
    for (const x of [-0.58, 0.58]) {
      part([0.37, 0.13, 0.035], [x, 0.65, -2.07], 3)
      part([0.31, 0.12, 0.035], [x, 0.63, 2.07], 4)
    }
    part([0.5, 0.16, 0.26], [0, 1.42, 0], 5)
    part([0.02, 0.025, 0.61], [-0.24, 1.35, -0.9], 6)
    for (const x of [-0.72, 0.72]) for (const z of [-1.15, 1.15]) part([0.65, 0.025, 0.08], [x, 1.42, z], 7)
    const geometry = mergeGeometries(geometries)!
    geometries.forEach(geo => geo.dispose())
    const rng = mulberry32(42010)
    const routes = new Float32Array(count * 4)
    const styles = new Float32Array(count * 4)
    for (let i = 0; i < count; i++) {
      const aerial = i % 6 === 0
      const bus = i % 13 === 0 && !aerial
      const drone = aerial && i % 12 === 0
      const lane = [-4.5, -2.2, 2.2, 4.5][i % 4]
      routes.set([aerial ? (i % 2 ? -1 : 1) * (14 + rng() * 14) : lane,
        aerial ? 18 + rng() * 12 : 0, lane > 0 ? 1 : -1, rng() * 340], i * 4)
      styles.set([aerial ? 4 + rng() * 3 : 5 + rng() * 4, drone ? 0.24 : bus ? 2.3 : 1,
        drone ? 0.32 : bus ? 1.6 : 1, bus ? 2 : aerial ? 3 : i % 4 === 1 ? 1 : 0], i * 4)
    }
    const addAttributes = (geo: THREE.BufferGeometry) => {
      geo.setAttribute('aRoute', new THREE.InstancedBufferAttribute(routes, 4))
      geo.setAttribute('aStyle', new THREE.InstancedBufferAttribute(styles, 4))
    }
    addAttributes(geometry)
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: WORLD_TIME, uBg: { value: SCENE_BG } },
      vertexShader: /* glsl */ `
        ${motion}
        attribute float aPart; varying vec3 vNormal; varying vec3 vLocal; varying float vPart; varying float vKind; varying float vDistance;
        void main() {
          vec3 p = position;
          bool drone = aStyle.w > 2.5 && aStyle.y < 0.5;
          if (drone) p.x *= 0.42;
          if (aPart > 6.5) {
            if (!drone) p = vec3(0.0);
            else {
              vec2 hub = vec2(sign(p.x) * 0.3024, sign(p.z) * 1.15);
              float spin = uTime * 10.0;
              p.xz = hub + mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * (p.xz - hub);
            }
          }
          if (aStyle.w > 2.5 && aPart > 1.5 && aPart < 2.5) p = vec3(0.0);
          if (aPart > 4.5 && aPart < 5.5 && aStyle.w != 1.0) p.y -= 0.35;
          if (aPart > 5.5 && aPart < 6.5) { p.x += sin(uTime * 3.2 + aRoute.w) * 0.19; }
          if (aStyle.w > 2.5) p.y += sin(uTime * 0.5 + aRoute.w) * 0.14;
          vLocal = p; vNormal = normal; vPart = aPart; vKind = aStyle.w;
          vec4 view = viewMatrix * vec4(vehiclePosition() + vehicleLocal(p), 1.0);
          vDistance = -view.z; gl_Position = projectionMatrix * view;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uBg; varying vec3 vNormal; varying vec3 vLocal; varying float vPart; varying float vKind; varying float vDistance;
        void main() {
          vec3 body = vKind == 1.0 ? vec3(0.31, 0.16, 0.012) : vKind == 2.0 ? vec3(0.025, 0.16, 0.2) : vec3(0.028, 0.04, 0.07);
          float light = 0.45 + 0.55 * max(dot(normalize(vNormal), normalize(vec3(0.3, 1.0, 0.4))), 0.0);
          vec3 color = body * light;
          if (vPart > 0.5 && vPart < 1.5) {
            color = vec3(0.008, 0.018, 0.033) + max(vNormal.y, 0.0) * vec3(0.025, 0.04, 0.07);
            if (vKind == 2.0) color += step(0.16, fract(vLocal.z * 4.0)) * vec3(0.18, 0.21, 0.17);
          }
          if (vPart > 1.5 && vPart < 2.5) color = vec3(0.005);
          if (vPart > 2.5 && vPart < 3.5) color = vec3(3.4, 3.0, 2.2);
          if (vPart > 3.5 && vPart < 4.5) color = vec3(2.6, 0.012, 0.004);
          if (vPart > 4.5 && vPart < 5.5) color = vKind == 1.0 ? vec3(2.0, 1.5, 0.3) : body;
          if (vPart > 5.5) color = vec3(0.01);
          color = mix(color, uBg, smoothstep(45.0, 175.0, vDistance));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.frustumCulled = false
    const frontCard = new THREE.PlaneGeometry(5, 11)
    frontCard.setAttribute('aTail', new THREE.Float32BufferAttribute(new Float32Array(4), 1))
    const rearCard = new THREE.PlaneGeometry(3, 3)
    rearCard.setAttribute('aTail', new THREE.Float32BufferAttribute(new Float32Array(4).fill(1), 1))
    const cardGeometry = mergeGeometries([frontCard, rearCard])!
    frontCard.dispose(); rearCard.dispose()
    addAttributes(cardGeometry)
    const cardMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: WORLD_TIME }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${motion}
        attribute float aTail; varying vec2 vUv; varying float vFade; varying float vTail;
        void main() {
          vUv = uv; vTail = aTail;
          vec3 p = vec3(position.x, 0.055, aTail > 0.5 ? position.y + 2.9 * aStyle.y : position.y - 5.5);
          vec3 origin = vehiclePosition();
          p.z *= aRoute.z; p.z -= aRoute.z * aStyle.y;
          vFade = aRoute.y > 1.0 ? 0.0 : 1.0;
          gl_Position = projectionMatrix * viewMatrix * vec4(vec3(origin.x, 0.0, origin.z) + p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying float vFade; varying float vTail;
        void main() {
          float cone = 1.0 - smoothstep(0.03, 0.42, abs(vUv.x - 0.5) / max(vUv.y, 0.15));
          float fade = smoothstep(0.0, 0.2, vUv.y) * (1.0 - smoothstep(0.65, 1.0, vUv.y));
          vec3 color = vTail > 0.5 ? vec3(0.85, 0.015, 0.005) : vec3(0.65, 0.59, 0.41);
          gl_FragColor = vec4(color, cone * fade * 0.12 * vFade);
        }
      `,
    })
    const cards = new THREE.InstancedMesh(cardGeometry, cardMaterial, count)
    cards.frustumCulled = false
    const sprayGeometry = new THREE.PlaneGeometry(3.2, 0.8)
    addAttributes(sprayGeometry)
    const sprayMaterial = new THREE.ShaderMaterial({
      uniforms: { uTime: WORLD_TIME }, transparent: true, depthWrite: false,
      vertexShader: /* glsl */ `
        ${motion}
        varying vec2 vUv; varying float vFade;
        void main() {
          vUv = uv;
          vec3 origin = vehiclePosition();
          vec3 p = vec3(position.x, position.y + 0.43, 2.6 * aStyle.y * aRoute.z);
          p.x *= 1.0 + sin(uTime * 2.0 + aRoute.w) * 0.12;
          vFade = aRoute.y > 1.0 ? 0.0 : 1.0 - smoothstep(18.0, 60.0, distance(origin, cameraPosition));
          gl_Position = projectionMatrix * viewMatrix * vec4(origin + p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv; varying float vFade;
        void main() {
          float grain = fract(sin(dot(floor(vUv * 90.0 + vec2(uTime * 7.0, uTime * 4.0)), vec2(12.9898, 78.233))) * 43758.5453);
          float edges = (1.0 - smoothstep(0.05, 0.5, abs(vUv.x - 0.5))) * (1.0 - smoothstep(0.2, 1.0, vUv.y));
          gl_FragColor = vec4(vec3(0.32, 0.42, 0.46), edges * grain * vFade * 0.2);
        }
      `,
    })
    const spray = new THREE.InstancedMesh(sprayGeometry, sprayMaterial, count)
    spray.frustumCulled = false
    return { mesh, material, cards, cardMaterial, spray, sprayMaterial }
  }, [count])
  useEffect(() => () => {
    bundle.mesh.geometry.dispose(); bundle.material.dispose()
    bundle.cards.geometry.dispose(); bundle.cardMaterial.dispose()
    bundle.spray.geometry.dispose(); bundle.sprayMaterial.dispose()
  }, [bundle])
  return <group userData={{ noCollision: true }}><primitive object={bundle.mesh} /><primitive object={bundle.cards} /><primitive object={bundle.spray} /></group>
}

export function Trains() {
  const { mesh, material } = useMemo(() => {
    const geometry = new THREE.BoxGeometry(2.6, 2.3, 10.5)
    geometry.setAttribute('aCar', new THREE.InstancedBufferAttribute(new Float32Array([0, 1, 2]), 1))
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: WORLD_TIME, uBg: { value: SCENE_BG }, uVisitor: { value: new THREE.Vector3() } },
      vertexShader: /* glsl */ `
        attribute float aCar; uniform float uTime; varying vec3 vLocal; varying vec3 vNormal; varying float vDistance; varying vec3 vWorld;
        void main() {
          float phase = mod(uTime, 82.0);
          float z = 74.0 - phase * 4.4 + aCar * 11.3;
          vec3 world = vec3(0.0, 8.65, z) + position;
          vWorld = world; vLocal = position; vNormal = normal;
          vec4 view = viewMatrix * vec4(world, 1.0); vDistance = -view.z; gl_Position = projectionMatrix * view;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uBg; uniform vec3 uVisitor; varying vec3 vLocal; varying vec3 vNormal; varying float vDistance; varying vec3 vWorld;
        void main() {
          if (uVisitor.y > 6.0 && distance(uVisitor, vWorld) < 8.0) discard;
          vec3 color = vec3(0.035, 0.05, 0.075);
          float windowBand = smoothstep(-0.1, 0.05, vLocal.y) * (1.0 - smoothstep(0.72, 0.8, vLocal.y));
          float windows = step(0.15, fract(vLocal.z * 0.6)) * windowBand;
          color += windows * vec3(0.8, 0.61, 0.38);
          color += (1.0 - smoothstep(0.03, 0.12, abs(vLocal.y + 0.65))) * vec3(0.05, 0.8, 1.4);
          color = mix(color, uBg, smoothstep(50.0, 185.0, vDistance));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, 3)
    mesh.frustumCulled = false
    return { mesh, material }
  }, [])
  useFrame(({ camera }) => { material.uniforms.uVisitor.value.copy(camera.position) })
  useEffect(() => () => { mesh.geometry.dispose(); material.dispose() }, [mesh, material])
  return <primitive object={mesh} />
}
