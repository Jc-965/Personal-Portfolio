import { useRef, useEffect, type ComponentType, type Ref } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer, wrapEffect } from '@react-three/postprocessing'
import { Effect } from 'postprocessing'
import type { EffectComposer as EffectComposerImpl } from 'postprocessing'
import * as THREE from 'three'
import { sketchFragmentShader } from './shaders/sketchEffect'

class SketchEffectImpl extends Effect {
  public uniforms: Map<string, THREE.Uniform<unknown>>

  constructor() {
    const uniforms: Map<string, THREE.Uniform<unknown>> = new Map([
      ['uTime', new THREE.Uniform<unknown>(0)],
      ['uResolution', new THREE.Uniform<unknown>(new THREE.Vector2(1, 1))],
      ['uScrollProgress', new THREE.Uniform<unknown>(1.0)],
    ])
    super('SketchEffect', sketchFragmentShader, { uniforms })
    this.uniforms = uniforms
  }
}

const WrappedSketchEffect = wrapEffect(SketchEffectImpl) as unknown as ComponentType<{
  ref?: Ref<SketchEffectImpl>
}>

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

    u.get('uScrollProgress')!.value = 1.0
  })

  useEffect(() => {
    const effect = effectRef.current
    return () => { effect?.dispose() }
  }, [])

  return <WrappedSketchEffect ref={effectRef} />
}

export default function SketchPostProcessing() {
  const composerRef = useRef<EffectComposerImpl>(null)

  useEffect(() => {
    const composer = composerRef.current
    return () => { composer?.dispose() }
  }, [])

  return (
    <EffectComposer ref={composerRef}>
      <SketchEffect />
    </EffectComposer>
  )
}
