import Ground from './Ground'
import WetStreet from './WetStreet'
import Rain from './Rain'
import EnvLight from './EnvLight'
import NeonBanners from './NeonBanners'
import Towers from './Towers'
import Structures from './Structures'
import Traffic from './Traffic'
import Atmosphere from './Atmosphere'
import SkyDome from './SkyDome'
import type { GridInteraction } from './interaction'
import type { GridQuality } from '../gridPerformance'

export default function CityWorld({
  quality,
  interaction,
}: {
  quality: GridQuality
  interaction: GridInteraction
}) {
  return (
    <group>
      <EnvLight />
      <SkyDome interaction={interaction} />
      {quality.reflections ? <WetStreet textureSize={quality.reflectionSize} /> : <Ground />}
      <Rain count={quality.rainCount} />
      <Towers density={quality.towerDensity} />
      <NeonBanners />
      <Structures interaction={interaction} />
      <Traffic tier={quality.tier} />
      <Atmosphere tier={quality.tier} />
    </group>
  )
}
