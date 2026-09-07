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
import StreetDetails from './StreetDetails'
import DistrictLayout from './DistrictLayout'
import DistrictStreamer from './DistrictStreamer'
import type { GridInteraction } from './interaction'
import type { GridQuality } from '../gridPerformance'
import type { GridSession } from '../navigation/session'

export default function CityWorld({
  quality,
  interaction,
  session,
}: {
  quality: GridQuality
  interaction: GridInteraction
  session: GridSession
}) {
  return (
    <group>
      <EnvLight />
      <SkyDome interaction={interaction} />
      <DistrictLayout />
      <DistrictStreamer quality={quality} interaction={interaction} session={session} />
      {quality.reflections ? <WetStreet textureSize={quality.reflectionSize} /> : <Ground />}
      <StreetDetails />
      <Rain count={quality.rainCount} />
      <Towers density={quality.towerDensity} />
      <NeonBanners />
      <Structures interaction={interaction} />
      <Traffic tier={quality.tier} />
      <Atmosphere tier={quality.tier} />
    </group>
  )
}
