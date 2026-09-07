import { VENUES } from '../../gridConfig'
import type { DistrictChunkProps } from '../DistrictStreamer'
export default function ProjectChunk(_props: DistrictChunkProps) { return <group name="project-chunk">{VENUES.map(v => <mesh key={v.project.id} position={[v.door[0], 2.4, v.door[2]]} userData={{ noCollision: true }}><boxGeometry args={[0.2, 4.8, 4]} /><meshStandardMaterial color={v.project.accent} emissive={v.project.accent} emissiveIntensity={0.8} transparent opacity={0.45} /></mesh>)}</group> }
