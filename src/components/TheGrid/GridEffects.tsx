import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette, Scanline, ToneMapping } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode } from 'postprocessing'
import { UnsignedByteType } from 'three'

/**
 * The neon look is mostly bloom: emissive windows, edge lines, and signage
 * blow out into glow. Scanline + noise sit at CRT-whisper levels — the 3D
 * heir of the site's `.vintage-overlay`. Skipped entirely on the low tier.
 */
export default function GridEffects({ enabled, msaa = 0 }: { enabled: boolean; msaa?: number }) {
  if (!enabled) return null
  return (
    // Half-float composer targets render as a partial black frame on some
    // WebGL implementations. An 8-bit target is both reliable and cheaper —
    // and 8-bit multisampled renderbuffers are the best-supported MSAA path,
    // so the tiered `msaa` samples are safe to apply here.
    <EffectComposer frameBufferType={UnsignedByteType} multisampling={msaa}>
      <Bloom intensity={1.0} luminanceThreshold={0.48} luminanceSmoothing={0.3} mipmapBlur />
      {/* A whisper of lens dispersion — real glass, not real geometry. */}
      <ChromaticAberration offset={[0.00045, 0.0003]} />
      <Scanline blendFunction={BlendFunction.OVERLAY} density={1.1} opacity={0.06} />
      <Noise premultiply opacity={0.05} />
      <Vignette eskil={false} offset={0.18} darkness={0.72} />
      {/* Filmic curve: rolls highlights off gently — screens and neon stop
          clipping to flat white on real GPUs. */}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}
