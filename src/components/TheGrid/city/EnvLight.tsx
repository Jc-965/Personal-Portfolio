import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { SCENE_BG } from './sceneColor'
import { STATIONS } from '../gridConfig'

/**
 * The PBR foundation. There is no HDR file to load — the city IS the
 * environment: once the scene exists, it's rendered into a PMREM cubemap and
 * set as `scene.environment`, so every standard material reflects the actual
 * neon skyline around it. Exponential fog (sharing the graded SCENE_BG color
 * instance) gives the air its rainy-night density; a faint cool directional
 * acts as moonlight through the clouds.
 */
export default function EnvLight() {
  const { gl, scene } = useThree()

  useEffect(() => {
    // Fog first so it participates in the environment capture.
    const fog = new THREE.FogExp2(0x020409, 0.0075)
    fog.color = SCENE_BG // shared instance — the district grade tints the air
    scene.fog = fog

    const pmrem = new THREE.PMREMGenerator(gl)
    let target: THREE.WebGLRenderTarget | null = null
    // One frame later, so all structures/signs have mounted into the capture.
    const frame = requestAnimationFrame(() => {
      target = pmrem.fromScene(scene, 0.04, 0.1, 600)
      scene.environment = target.texture
    })

    return () => {
      cancelAnimationFrame(frame)
      scene.environment = null
      scene.fog = null
      target?.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])

  return (
    <>
      <directionalLight position={[60, 120, 40]} intensity={0.35} color="#7f9fd8" />
      <ambientLight intensity={0.12} color="#38506e" />
      {/* One accent streetlight pooling over each station — what makes the
          PBR bodies read as wet metal under sodium-and-neon light. */}
      {STATIONS.map(station => (
        <pointLight
          key={station.id}
          position={[station.look[0], 16, station.look[2]]}
          color={station.accent}
          intensity={140}
          distance={60}
          decay={1.8}
        />
      ))}
    </>
  )
}
