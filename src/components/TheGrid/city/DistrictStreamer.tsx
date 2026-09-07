import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { GridQuality } from '../gridPerformance'
import type { GridInteraction } from './interaction'
import type { GridSession } from '../navigation/session'

export interface DistrictChunkProps { quality: GridQuality; interaction: GridInteraction; session: GridSession }

const loaders = [
  () => import('./districts/ArrivalChunk'), () => import('./districts/JourneyChunk'), () => import('./districts/ProjectChunk'),
  () => import('./districts/MarketChunk'), () => import('./districts/RelayChunk'),
]
const chunks = loaders.map(load => lazy(load))
const centers: Array<[number, number]> = [[0, 30], [0, -60], [0, -120], [-46, -145], [8, -222]]

export default function DistrictStreamer(props: DistrictChunkProps) {
  const [visible, setVisible] = useState(() => centers.map(() => false))
  const current = useRef(visible), lastCheck = useRef(0)
  useEffect(() => {
    const idle = window.requestIdleCallback?.(() => { loaders.forEach(load => void load()) }, { timeout: 1800 })
    return () => { if (idle) window.cancelIdleCallback?.(idle) }
  }, [])
  useFrame(({ camera, clock }) => {
    if (clock.elapsedTime - lastCheck.current < 0.35) return
    lastCheck.current = clock.elapsedTime
    const next = centers.map(([x, z], i) => Math.hypot(camera.position.x - x, camera.position.z - z) < (current.current[i] ? 105 : 88))
    if (next.some((value, i) => value !== current.current[i])) { current.current = next; setVisible(next) }
  })
  return <Suspense fallback={null}>{chunks.map((Chunk, index) => visible[index] ? <Chunk key={index} {...props} /> : null)}</Suspense>
}
