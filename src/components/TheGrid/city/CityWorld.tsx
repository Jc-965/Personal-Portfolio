import Ground from './Ground'
import Towers from './Towers'
import Structures from './Structures'
import Traffic from './Traffic'
import Atmosphere from './Atmosphere'
import SkyDome from './SkyDome'
import type { GridInteraction } from './interaction'
import type { GridTier } from '../gridPerformance'

export default function CityWorld({
  towerDensity,
  tier,
  interaction,
}: {
  towerDensity: number
  tier: GridTier
  interaction: GridInteraction
}) {
  return (
    <group>
      <SkyDome interaction={interaction} />
      <Ground />
      <Towers density={towerDensity} />
      <Structures interaction={interaction} />
      <Traffic tier={tier} />
      <Atmosphere tier={tier} />
    </group>
  )
}
