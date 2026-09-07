import { ALLEY_X, CROSS_STREETS, PLATFORMS, WALK_BOUNDS, WALK_PLAZAS } from '../gridConfig'

const surface = { color: '#111923', metalness: 0.42, roughness: 0.48 }
const concrete = { color: '#29313a', metalness: 0.12, roughness: 0.76 }

function Box({ position, scale, color = concrete.color, collision = true }: {
  position: [number, number, number]
  scale: [number, number, number]
  color?: string
  collision?: boolean
}) {
  return (
    <mesh position={position} scale={scale} receiveShadow castShadow={collision} userData={{ noCollision: !collision }}>
      <boxGeometry />
      <meshStandardMaterial {...concrete} color={color} />
    </mesh>
  )
}

/** Physical navigation surfaces authored from gridConfig. Detailed dressing arrives with district interiors. */
export default function DistrictLayout() {
  return (
    <group name="district-layout">
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.04, -105]} receiveShadow userData={{ noCollision: true }}>
        <planeGeometry args={[WALK_BOUNDS.maxX - WALK_BOUNDS.minX, WALK_BOUNDS.maxZ - WALK_BOUNDS.minZ]} />
        <meshStandardMaterial {...surface} />
      </mesh>
      {CROSS_STREETS.map(z => <Box key={z} position={[0, 0.015, z]} scale={[300, 0.03, 14]} color="#080e15" collision={false} />)}
      {ALLEY_X.map(x => <Box key={x} position={[x, 0.02, -92]} scale={[8, 0.04, 215]} color="#090f17" collision={false} />)}
      {WALK_PLAZAS.map((plaza, index) => (
        <Box key={index} position={[(plaza.minX + plaza.maxX) / 2, 0.04, (plaza.minZ + plaza.maxZ) / 2]} scale={[plaza.maxX - plaza.minX, 0.08, plaza.maxZ - plaza.minZ]} collision={false} />
      ))}
      {PLATFORMS.map(platform => {
        const stairLength = platform.stair.maxZ - platform.stair.minZ
        return (
          <group key={platform.experience.id}>
            <Box position={[7.55, platform.y - 0.2, platform.z + 1.5]} scale={[8.1, 0.4, 13]} color="#202833" />
            {Array.from({ length: 32 }, (_, step) => {
              const depth = stairLength / 32
              const height = (32 - step) * (platform.y / 32)
              return <Box key={step} position={[10.4, height / 2, platform.stair.minZ + depth * (step + 0.5)]} scale={[2.4, height, depth]} collision={false} />
            })}
            <Box position={[3.65, platform.y + 0.55, platform.z + 1.5]} scale={[0.16, 1.1, 13]} color={platform.experience.accent} />
            <Box position={[11.45, platform.y + 0.55, platform.z + 1.5]} scale={[0.16, 1.1, 13]} color={platform.experience.accent} />
          </group>
        )
      })}
    </group>
  )
}
