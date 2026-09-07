import { SKILL_BANDS } from '../../gridConfig'
import type { DistrictChunkProps } from '../DistrictStreamer'
export default function RelayChunk(_props: DistrictChunkProps) { return <group name="relay-chunk">{SKILL_BANDS.map(s => <mesh key={s.group.id} position={[s.x, 0.12, s.z]} userData={{ noCollision: true }}><cylinderGeometry args={[4, 4, 0.2, 24]} /><meshStandardMaterial color={s.group.accent} emissive={s.group.accent} emissiveIntensity={0.65} /></mesh>)}</group> }
