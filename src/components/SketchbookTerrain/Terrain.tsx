/* eslint-disable react/no-unknown-property */
import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { terrainVertexShader } from './shaders/terrainVertex'
import { terrainFragmentShader } from './shaders/terrainFragment'
import { useTerrainDeformation } from './useTerrainDeformation'

interface TerrainProps {
  mouseRef: React.RefObject<{ x: number; y: number; active: boolean }>
  scrollProgress: React.RefObject<number>
  meshRef?: React.RefObject<THREE.Mesh | null>
}

export default function Terrain({ mouseRef, scrollProgress, meshRef: externalMeshRef }: TerrainProps) {
  const internalMeshRef = useRef<THREE.Mesh>(null)
  const { raycaster, camera } = useThree()
  const deformation = useTerrainDeformation()

  // Forward ref to parent if provided
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

  const lastRaycast = useRef(0)

  useFrame(({ clock }) => {
    uniforms.uTime.value = clock.getElapsedTime()
    deformation.update()

    const now = clock.getElapsedTime()
    if (mouseRef.current?.active && now - lastRaycast.current > 0.016 && internalMeshRef.current) {
      lastRaycast.current = now
      const mouse = new THREE.Vector2(
        mouseRef.current.x * 2 - 1,
        -(mouseRef.current.y * 2 - 1)
      )
      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObject(internalMeshRef.current)
      if (intersects.length > 0 && intersects[0].uv) {
        deformation.applyBrush(intersects[0].uv.x, intersects[0].uv.y)
      }
    }
  })

  return (
    <mesh ref={internalMeshRef} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[90, 90, 180, 180]} />
    </mesh>
  )
}
