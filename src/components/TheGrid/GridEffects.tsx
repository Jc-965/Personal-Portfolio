import { EffectComposer, Bloom, Noise, Vignette, Scanline } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'

/**
 * The neon look is mostly bloom: emissive windows, edge lines, and signage
 * blow out into glow. Scanline + noise sit at CRT-whisper levels — the 3D
 * heir of the site's `.vintage-overlay`. Skipped entirely on the low tier.
 */
export default function GridEffects({ enabled }: { enabled: boolean }) {
  if (!enabled) return null
  return (
    <EffectComposer>
      <Bloom intensity={0.8} luminanceThreshold={0.48} luminanceSmoothing={0.3} mipmapBlur />
      <Scanline blendFunction={BlendFunction.OVERLAY} density={1.1} opacity={0.06} />
      <Noise premultiply opacity={0.05} />
      <Vignette eskil={false} offset={0.18} darkness={0.72} />
    </EffectComposer>
  )
}
