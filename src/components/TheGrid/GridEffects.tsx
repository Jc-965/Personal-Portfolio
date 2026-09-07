import { EffectComposer, Bloom, ChromaticAberration, DepthOfField, Noise, Vignette, ToneMapping } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import { UnsignedByteType } from 'three'

/** Composer disables renderer tone mapping. Apply ACES once after byte-range bloom. */
export default function GridEffects({ enabled, msaa = 0, photo = false }: { enabled: boolean; msaa?: number; photo?: boolean }) {
  if (!enabled) return null
  return (
    // Half-float composer targets render as a partial black frame on some
    // WebGL implementations. An 8-bit target is both reliable and cheaper —
    // and 8-bit multisampled renderbuffers are the best-supported MSAA path,
    // so the tiered `msaa` samples are safe to apply here.
    <EffectComposer frameBufferType={UnsignedByteType} multisampling={msaa}>
      <Bloom intensity={1.0} luminanceThreshold={0.85} luminanceSmoothing={0.12} mipmapBlur />
      {/* A whisper of lens dispersion — real glass, not real geometry. */}
      <ChromaticAberration offset={[0.00045, 0.0003]} />
      <Noise premultiply opacity={0.05} />
      <Vignette eskil={false} offset={0.18} darkness={0.72} />
      {/* The composer only accepts elements as children, so an empty fragment stands in when photo mode is off. */}
      {photo ? <DepthOfField focusDistance={0.018} focalLength={0.028} bokehScale={1.35} /> : <></>}
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} exposure={photo ? 1.12 : 1} />
    </EffectComposer>
  )
}
