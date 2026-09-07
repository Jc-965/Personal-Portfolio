import { PLATFORMS } from '../../gridConfig'
import type { DistrictChunkProps } from '../DistrictStreamer'
export default function JourneyChunk(_props: DistrictChunkProps) { return <group name="journey-chunk">{PLATFORMS.map(p => <mesh key={p.experience.id} position={[p.x, p.y + 2.3, p.z]} userData={{ noCollision: true }}><boxGeometry args={[5.6, 1.1, 0.16]} /><meshStandardMaterial color={p.experience.accent} emissive={p.experience.accent} emissiveIntensity={1.4} /></mesh>)}</group> }
