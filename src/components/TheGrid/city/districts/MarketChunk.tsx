import { MARKET } from '../../gridConfig'
import type { DistrictChunkProps } from '../DistrictStreamer'
export default function MarketChunk(_props: DistrictChunkProps) { return <group name="market-chunk">{MARKET.map(s => <pointLight key={s.item.id} position={[s.x, 3, s.z]} color={s.item.accent} intensity={12} distance={10} />)}</group> }
