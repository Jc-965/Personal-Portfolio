import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { MeshStandardMaterial, Vector2 } from 'three'
import type { GridSurface } from '../gridAssets'
import { useSurfaceMaps } from './surfaceTextures'
import { applyWetLayer } from './wetLayer'

/** District meshes request their set only while mounted. Geometry owns UV scale. */
export default function SurfaceMaterial({ surface, wet = true, color = '#ffffff', seed = 0, repeat = [1, 1], opacity = 1 }: {
  surface: GridSurface; wet?: boolean; color?: string; seed?: number; repeat?: [number, number]; opacity?: number
}) {
  const maps = useSurfaceMaps(surface)
  const [repeatX, repeatY] = repeat
  const material = useMemo(() => {
    const material = new MeshStandardMaterial({ color, opacity, transparent: opacity < 1, depthWrite: opacity >= 1,
      metalness: ['paintedMetal', 'corrugatedMetal', 'rust'].includes(surface) ? 0.65 : 0,
      roughness: surface === 'velvet' ? 1 : 0.85,
    })
    applyWetLayer(material, wet)
    const repeatUniform = { value: new Vector2(1, 1) }
    const offsetUniform = { value: new Vector2() }
    material.userData.surfaceRepeat = repeatUniform
    material.userData.surfaceOffset = offsetUniform
    const compileWetLayer = material.onBeforeCompile
    material.onBeforeCompile = (shader, renderer) => {
      compileWetLayer(shader, renderer)
      shader.uniforms.uSurfaceRepeat = repeatUniform
      shader.uniforms.uSurfaceOffset = offsetUniform
      shader.vertexShader = 'uniform vec2 uSurfaceRepeat; uniform vec2 uSurfaceOffset;\n' + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `
        #include <uv_vertex>
        #ifdef USE_MAP
          vMapUv = vMapUv * uSurfaceRepeat + uSurfaceOffset;
        #endif
        #ifdef USE_NORMALMAP
          vNormalMapUv = vNormalMapUv * uSurfaceRepeat + uSurfaceOffset;
        #endif
        #ifdef USE_ROUGHNESSMAP
          vRoughnessMapUv = vRoughnessMapUv * uSurfaceRepeat + uSurfaceOffset;
        #endif
      `)
    }
    material.customProgramCacheKey = () => `grid-surface-v4-${wet}`
    return material
  }, [surface, wet, color, opacity])
  useEffect(() => {
    material.userData.surfaceRepeat.value.set(repeatX, repeatY)
    material.userData.surfaceOffset.value.set(seed * 0.73, seed * 0.39)
    material.userData.surfaceSeed.value = seed
  }, [material, seed, repeatX, repeatY])
  useEffect(() => {
    material.map = maps?.albedo ?? null
    material.normalMap = maps?.normal ?? null
    material.roughnessMap = maps?.roughness ?? null
    material.needsUpdate = true
  }, [material, maps])
  useEffect(() => () => material.dispose(), [material])
  useFrame(state => {
    if (material.userData.surfaceTime) material.userData.surfaceTime.value = state.clock.elapsedTime
  })
  return <primitive attach="material" object={material} />
}
