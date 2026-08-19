import { useEffect } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { GRID_ENVIRONMENT_URL } from '../gridAssets'
import { SCENE_BG } from './sceneColor'
import { STATIONS } from '../gridConfig'

/**
 * The PBR foundation: a real high-dynamic-range city capture provides
 * physically plausible specular response, while authored local lights keep
 * the station colors legible inside the rainy canyon.
 */
export default function EnvLight() {
  const { scene } = useThree()
  const environment = useLoader(HDRLoader, GRID_ENVIRONMENT_URL)

  useEffect(() => {
    const previousEnvironment = scene.environment
    const previousEnvironmentIntensity = scene.environmentIntensity
    const previousEnvironmentRotation = scene.environmentRotation.clone()
    const fog = new THREE.FogExp2(0x020409, 0.009)
    fog.color = SCENE_BG
    scene.fog = fog

    environment.mapping = THREE.EquirectangularReflectionMapping
    scene.environment = environment
    scene.environmentIntensity = 0.68
    scene.environmentRotation.set(0, Math.PI * 0.62, 0)

    return () => {
      scene.environment = previousEnvironment
      scene.environmentIntensity = previousEnvironmentIntensity
      scene.environmentRotation.copy(previousEnvironmentRotation)
      scene.fog = null
    }
  }, [environment, scene])

  return (
    <>
      <directionalLight
        position={[48, 92, 26]}
        intensity={1.25}
        color="#94abda"
      />
      <hemisphereLight args={['#5275a5', '#090607', 0.42]} />
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
