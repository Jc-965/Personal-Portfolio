import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { content } from '../../gridConfig'
import { WORLD_TIME } from '../../navigation/session'

/** One generated atlas, six drifting panels, no per-sign texture uploads. */
export default function AdLife() {
  const { mesh, material, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    const rows = content.projects.length + 1
    canvas.width = 1024; canvas.height = 256 * rows
    const ctx = canvas.getContext('2d')!
    const records = [{ title: content.profile.name, subtitle: content.profile.eyebrow, accent: '#7efcff' },
      ...content.projects.map(project => ({ title: project.name, subtitle: project.tag, accent: project.accent }))]
    records.forEach((record, i) => {
      const y = i * 256
      ctx.fillStyle = '#06121d'; ctx.fillRect(0, y, 1024, 256)
      ctx.strokeStyle = record.accent; ctx.lineWidth = 2; ctx.strokeRect(12, y + 12, 1000, 232)
      ctx.fillStyle = record.accent; ctx.font = '700 65px monospace'; ctx.fillText(record.title.toUpperCase(), 50, y + 115, 920)
      ctx.fillStyle = '#bdd6e3'; ctx.font = '24px monospace'; ctx.fillText(record.subtitle, 50, y + 178, 920)
    })
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const geometry = new THREE.PlaneGeometry(5.2, 1.3)
    geometry.setAttribute('aSpot', new THREE.InstancedBufferAttribute(new Float32Array([
      -7, 13, 10, 8, 16, -40, -8, 14, -100, 8, 13, -142, -42, 6, -154, 12, 16, -220,
    ]), 3))
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array([0, 1, 2, 3, 4, 5]), 1))
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: WORLD_TIME, uAtlas: { value: texture }, uRows: { value: rows }, uVisitor: { value: new THREE.Vector3() } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        attribute vec3 aSpot; attribute float aSeed; uniform float uTime; uniform vec3 uVisitor;
        varying vec2 vUv; varying float vSeed; varying float vFade;
        void main() {
          vec3 center = aSpot + vec3(sin(uTime * 0.08 + aSeed) * 0.28, sin(uTime * 0.16 + aSeed) * 0.34, 0.0);
          vec3 p = position; float turn = sin(aSeed) * 0.15;
          p.xz = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * p.xz;
          vec3 world = center + p;
          vUv = uv; vSeed = aSeed; vFade = 1.0 - smoothstep(22.0, 65.0, distance(world, uVisitor));
          gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uRows; uniform sampler2D uAtlas;
        varying vec2 vUv; varying float vSeed; varying float vFade;
        void main() {
          float cycle = uTime / 16.0 + vSeed;
          float row = mod(floor(cycle), uRows);
          float phase = fract(cycle);
          float fade = smoothstep(0.0, 0.03, phase) * (1.0 - smoothstep(0.97, 1.0, phase));
          vec4 texel = texture2D(uAtlas, vec2(vUv.x, (vUv.y + row) / uRows));
          gl_FragColor = vec4(texel.rgb * 1.6, vFade * fade * 0.82);
        }
      `,
    })
    const mesh = new THREE.InstancedMesh(geometry, material, 6)
    mesh.frustumCulled = false
    return { mesh, material, texture }
  }, [])
  useFrame(({ camera }) => { material.uniforms.uVisitor.value.copy(camera.position) })
  useEffect(() => () => { mesh.geometry.dispose(); material.dispose(); texture.dispose() }, [mesh, material, texture])
  return <primitive object={mesh} />
}
