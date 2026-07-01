import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { terrainVertexShader } from './shaders/terrainVertex'
import { terrainFragmentShader } from './shaders/terrainFragment'
import type { BrushMode } from './useTerrainDeformation'

interface TerrainProps {
  mouseRef: React.RefObject<{ x: number; y: number; active: boolean }>
  scrollProgress: React.RefObject<number>
  meshRef?: React.RefObject<THREE.Mesh | null>
  brushEnabled?: boolean
  brushActiveRef?: React.RefObject<boolean>
  brushMode?: BrushMode
  brushStrength?: number
  deformation: {
    getTexture: () => THREE.DataTexture
    applyBrush: (u: number, v: number, mode: BrushMode, strengthMul?: number) => void
    update: () => void
  }
}

export default function Terrain({
  mouseRef,
  meshRef: externalMeshRef,
  brushEnabled = true,
  brushActiveRef,
  brushMode = 'raise',
  brushStrength = 0.3,
  deformation,
}: TerrainProps) {
  const internalMeshRef = useRef<THREE.Mesh>(null)
  const { raycaster, camera } = useThree()

  useEffect(() => {
    if (externalMeshRef && 'current' in externalMeshRef) {
      (externalMeshRef as React.MutableRefObject<THREE.Mesh | null>).current = internalMeshRef.current
    }
  })

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uDeformationMap: { value: deformation.getTexture() },
    uDeformStrength: { value: 5.0 },
  }), [deformation])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: terrainVertexShader,
    fragmentShader: terrainFragmentShader,
    uniforms,
    side: THREE.DoubleSide,
  }), [uniforms])

  useEffect(() => {
    return () => { material.dispose() }
  }, [material])

  const lastRaycast = useRef(0)
  const _mouseVec = useRef(new THREE.Vector2())

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime()
    deformation.update()

    const now = clock.getElapsedTime()
    if (
      brushEnabled &&
      (brushActiveRef?.current ?? true) &&
      mouseRef.current?.active &&
      now - lastRaycast.current > 0.016 &&
      internalMeshRef.current
    ) {
      lastRaycast.current = now
      _mouseVec.current.set(
        mouseRef.current.x * 2 - 1,
        -(mouseRef.current.y * 2 - 1)
      )
      raycaster.setFromCamera(_mouseVec.current, camera)
      const intersects = raycaster.intersectObject(internalMeshRef.current)
      if (intersects.length > 0 && intersects[0].uv) {
        deformation.applyBrush(intersects[0].uv.x, intersects[0].uv.y, brushMode, brushStrength)
      }
    }
  })

  return (
    <mesh ref={internalMeshRef} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[124, 124, 148, 148]} />
    </mesh>
  )
}
