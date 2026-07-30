import { EffectComposer, Bloom, Noise, Vignette, Scanline, ToneMapping } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'

/**
 * The neon look is mostly bloom: emissive windows, edge lines, and signage
 * blow out into glow. Scanline + noise sit at CRT-whisper levels — the 3D
 * heir of the site's `.vintage-overlay`. Skipped entirely on the low tier.
 */
export default function GridEffects({ enabled }: { enabled: boolean }) {
  if (!enabled) return null
  return (
    <EffectComposer>
      <Bloom intensity={1.0} luminanceThreshold={0.48} luminanceSmoothing={0.3} mipmapBlur />
      <Scanline blendFunction={BlendFunction.OVERLAY} density={1.1} opacity={0.06} />
      <Noise premultiply opacity={0.05} />
      <Vignette eskil={false} offset={0.18} darkness={0.72} />
      {/* Filmic curve: rolls highlights off gently — screens and neon stop
          clipping to flat white on real GPUs. */}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
