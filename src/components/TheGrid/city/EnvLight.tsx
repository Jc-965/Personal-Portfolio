import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
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
  const { scene, gl } = useThree()
  const moon = useRef<THREE.DirectionalLight>(null)
  const spots = useRef<(THREE.SpotLight | null)[]>([])
  const targets = useMemo(() => Array.from({ length: 3 }, () => new THREE.Object3D()), [])
  useFrame(({ camera }) => {
    if (moon.current) {
      moon.current.position.set(camera.position.x + 48, 92, camera.position.z + 26)
      moon.current.target.position.set(camera.position.x, 0, camera.position.z)
      moon.current.target.updateMatrixWorld()
    }
    const nearest = [...STATIONS].sort((a, b) => Math.abs(a.look[2] - camera.position.z) - Math.abs(b.look[2] - camera.position.z)).slice(0, 3)
    nearest.forEach((station, i) => {
      const light = spots.current[i]
      if (!light) return
      light.position.set(station.look[0], 16, station.look[2])
      light.color.set(station.accent)
      targets[i].position.set(station.look[0], 0, station.look[2])
      targets[i].updateMatrixWorld()
    })
  })
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
        ref={moon}
        castShadow={gl.shadowMap.enabled}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-near={1}
        shadow-camera-far={180}
        shadow-normalBias={0.12}
        position={[48, 92, 26]}
        intensity={1.25}
        color="#94abda"
      />
      <hemisphereLight args={['#5275a5', '#090607', 0.42]} />
      {targets.map((target, i) => (
        <group key={i}>
          <primitive object={target} />
          <spotLight ref={light => { spots.current[i] = light }} target={target}
            castShadow={gl.shadowMap.enabled} intensity={420} distance={65} angle={0.9} penumbra={0.6}
            shadow-mapSize={[512, 512]} shadow-camera-near={0.5}
            shadow-camera-far={65} shadow-normalBias={0.08} />
        </group>
      ))}
    </>
  )
}
