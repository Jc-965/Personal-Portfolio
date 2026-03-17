/* eslint-disable react/no-unknown-property */
import { useRef, type ComponentType } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, wrapEffect } from '@react-three/postprocessing'
import { Effect } from 'postprocessing'
import * as THREE from 'three'
import { sketchFragmentShader } from './shaders/sketchEffect'

class SketchEffectImpl extends Effect {
  public uniforms: Map<string, THREE.Uniform<any>>

  constructor() {
    const uniforms = new Map<string, THREE.Uniform<any>>([
      ['uTime', new THREE.Uniform(0)],
      ['uResolution', new THREE.Uniform(new THREE.Vector2(1, 1))],
      ['uScrollProgress', new THREE.Uniform(1.0)],
    ])
    super('SketchEffect', sketchFragmentShader, { uniforms })
    this.uniforms = uniforms
  }
}

const WrappedSketchEffect = wrapEffect(SketchEffectImpl) as unknown as ComponentType<any>

function SketchEffect() {
  const effectRef = useRef<SketchEffectImpl>(null)
  const { size, gl } = useThree()

  useFrame(({ clock }) => {
    if (!effectRef.current) return
    const u = effectRef.current.uniforms
    u.get('uTime')!.value = clock.getElapsedTime()

    const dpr = gl.getPixelRatio()
    const res = u.get('uResolution')!.value as THREE.Vector2
    const w = size.width * dpr
    const h = size.height * dpr
    if (res.x !== w || res.y !== h) res.set(w, h)

    // Always fully in sketch mode
    u.get('uScrollProgress')!.value = 1.0
  })

  return <WrappedSketchEffect ref={effectRef} />
}

export default function SketchPostProcessing() {
  return (
    <EffectComposer>
      <SketchEffect />
    </EffectComposer>
  )
}
