import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { GridSession, WORLD_TIME } from '../navigation/session'
import { MARKET } from '../gridConfig'
import { mulberry32 } from '../city/rand'

interface AudioRig {
  context: AudioContext; master: GainNode
  rain: GainNode; train: GainNode; trainPanner: PannerNode
  reed: OscillatorNode[]; reedGain: GainNode
  dispose: () => void
}

function createAudioRig(): AudioRig {
  const context = new AudioContext()
  const master = context.createGain()
  master.gain.value = 0.45
  master.connect(context.destination)
  const nodes: AudioNode[] = [master]
  const sources: AudioScheduledSourceNode[] = []
  const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate)
  const samples = buffer.getChannelData(0)
  const random = mulberry32(2199)
  let pink = 0
  for (let i = 0; i < samples.length; i++) {
    pink = pink * 0.96 + (random() * 2 - 1) * 0.12
    samples[i] = pink
  }
  const at = (x: number, y: number, z: number) => {
    const panner = context.createPanner()
    panner.panningModel = 'HRTF'; panner.distanceModel = 'inverse'
    panner.refDistance = 8; panner.maxDistance = 160; panner.rolloffFactor = 1.3
    panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z
    panner.connect(master); nodes.push(panner)
    return panner
  }
  const noise = (frequency: number, volume: number, destination: AudioNode, type: BiquadFilterType = 'lowpass') => {
    const source = context.createBufferSource(); source.buffer = buffer; source.loop = true
    const filter = context.createBiquadFilter(); filter.type = type; filter.frequency.value = frequency
    const gain = context.createGain(); gain.gain.value = volume
    source.connect(filter); filter.connect(gain); gain.connect(destination); source.start()
    sources.push(source); nodes.push(filter, gain); return gain
  }
  const rain = noise(1600, 0.7, master, 'highpass')
  noise(300, 0.14, at(-3, 1, -95))
  const trainPanner = at(0, 8, 74)
  const train = noise(220, 0, trainPanner)
  const hum = context.createOscillator(); hum.type = 'sine'; hum.frequency.value = 60
  const humGain = context.createGain(); humGain.gain.value = 0.008
  hum.connect(humGain); humGain.connect(at(15, 4, -226)); hum.start()
  nodes.push(humGain); sources.push(hum)
  const jazz = MARKET.find(shop => shop.kind === 'jazz')
  const reedGain = context.createGain(); reedGain.gain.value = 0
  reedGain.connect(at(jazz?.x ?? -51, 1.8, jazz?.z ?? -155)); nodes.push(reedGain)
  const reed = [1, 3, 5].map(harmonic => {
    const oscillator = context.createOscillator(); oscillator.type = 'sine'; oscillator.frequency.value = 146.83 * harmonic
    const gain = context.createGain(); gain.gain.value = 0.075 / (harmonic * harmonic)
    oscillator.connect(gain); gain.connect(reedGain); oscillator.start()
    nodes.push(gain); sources.push(oscillator); return oscillator
  })
  return { context, master, rain, train, trainPanner, reed, reedGain,
    dispose: () => { sources.forEach(source => source.stop()); nodes.forEach(node => node.disconnect()); void context.close() },
  }
}

/** Subscription runs synchronously inside the opt-in gesture, satisfying autoplay. */
export default function SpatialAudio({ session }: { session: GridSession }) {
  const rig = useRef<AudioRig | null>(null)
  const lastNote = useRef(-1)
  useEffect(() => {
    let active = true
    const unsubscribe = session.subscribe(() => {
      const enabled = session.getSnapshot().audio
      if (enabled) {
        rig.current ??= createAudioRig()
        void rig.current.context.resume().catch(() => { if (active) session.update({ audio: false }) })
      } else if (rig.current) void rig.current.context.suspend()
    })
    return () => { active = false; unsubscribe(); rig.current?.dispose(); rig.current = null }
  }, [session])
  useFrame(({ camera }) => {
    const audio = rig.current
    if (!audio || !session.getSnapshot().audio) return
    const { context, master } = audio
    const now = context.currentTime
    master.gain.setTargetAtTime(WORLD_TIME.frozen ? 0 : 0.45, now, 0.2)
    const listener = context.listener
    listener.positionX.value = camera.position.x; listener.positionY.value = camera.position.y; listener.positionZ.value = camera.position.z
    const e = camera.matrixWorld.elements
    listener.forwardX.value = -e[8]; listener.forwardY.value = -e[9]; listener.forwardZ.value = -e[10]
    listener.upX.value = e[4]; listener.upY.value = e[5]; listener.upZ.value = e[6]
    audio.rain.gain.setTargetAtTime(0.55 + Math.sin(WORLD_TIME.value * 0.07) * 0.12, now, 0.8)
    const trainZ = 74 - (WORLD_TIME.value % 82) * 4.4
    audio.trainPanner.positionZ.value = trainZ
    audio.train.gain.setTargetAtTime(trainZ > -250 && trainZ < 45 ? 0.42 : 0, now, 1)
    const beat = Math.floor(WORLD_TIME.value / 3.2)
    if (beat !== lastNote.current) {
      lastNote.current = beat
      const notes = [146.83, 174.61, 220, 196, 174.61, 130.81, 146.83, 0]
      const note = notes[beat % notes.length]
      audio.reedGain.gain.setTargetAtTime(note ? 0.5 : 0, now, 0.45)
      if (note) audio.reed.forEach((oscillator, i) => oscillator.frequency.setTargetAtTime(note * (i * 2 + 1), now, 0.18))
    }
    // The weather flash is at 91s; acoustic arrival follows one second later.
    const thunder = WORLD_TIME.value > 60 && WORLD_TIME.value % 91 > 1 && WORLD_TIME.value % 91 < 4
    if (thunder) audio.train.gain.setTargetAtTime(0.7, now, 0.5)
  })
  return null
}
