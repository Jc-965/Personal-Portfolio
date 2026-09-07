import { LANDMARKS, type GridLandmark } from '../gridConfig'
import type { WalkerPosition } from './collision'

export type GridMode = 'walk' | 'tour' | 'photo' | 'landmark' | 'arrival' | 'elevator'
export type GridDialog = 'map' | 'contact' | 'project' | 'role' | 'market' | 'skill' | 'help' | null
export interface GridSnapshot {
  mode: GridMode; district: number; nearest: string | null; dialog: GridDialog
  selected: string | null; audio: boolean; transition: boolean; comfort: boolean
  photoNotice: string; revision: number
}
export const WORLD_TIME = { value: 0, delta: 0, frozen: false }
export const NAVIGATION_LANDMARKS = LANDMARKS

export function advanceWorldTime(delta: number, frozen: boolean) {
  const safeDelta = frozen || !Number.isFinite(delta) ? 0 : Math.max(0, Math.min(delta, 0.1))
  WORLD_TIME.delta = safeDelta
  WORLD_TIME.frozen = frozen
  WORLD_TIME.value += safeDelta
}

export function nearestLandmark(position: WalkerPosition, radius = 4): GridLandmark | null {
  let nearest: GridLandmark | null = null
  let best = radius * radius
  for (const landmark of LANDMARKS) {
    const dx = landmark.position[0] - position.x
    const dy = landmark.position[1] - position.y
    const dz = landmark.position[2] - position.z
    const distance = dx * dx + dy * dy + dz * dz
    if (distance <= best) {
      best = distance
      nearest = landmark
    }
  }
  return nearest
}

/** One session owns travel and interaction state; React subscribes only to UI changes. */
export class GridSession {
  position: WalkerPosition = { x: 0, y: 0, z: 34 }
  yaw = 0
  pitch = 0.12
  seconds = 0
  keys = new Set<string>()
  joystick = { x: 0, y: 0 }
  walkTarget: { x: number; z: number } | null = null
  pendingTravel: GridLandmark | null = null
  pendingTravelAt = 0
  screenAnchor = { x: 0, y: 0, visible: false }
  captureRequested = false
  activeSkill: number | null = null
  tourProgress = 0
  tourScroll = 0
  turnAmount = 0
  lastInput = 0
  reducedMotion: boolean
  private modeBeforePhoto: GridMode = 'walk'
  private listeners = new Set<() => void>()
  private snapshot: GridSnapshot
  constructor(reducedMotion = false) {
    this.reducedMotion = reducedMotion
    this.snapshot = { mode: reducedMotion ? 'landmark' : 'walk', district: 0, nearest: null, dialog: null, selected: null, audio: false, transition: false, comfort: false, photoNotice: '', revision: 0 }
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  update(patch: Partial<GridSnapshot>) {
    if (Object.entries(patch).every(([key, value]) => this.snapshot[key as keyof GridSnapshot] === value)) return
    this.snapshot = { ...this.snapshot, ...patch, revision: this.snapshot.revision + 1 }
    this.listeners.forEach(listener => listener())
  }
  travel = (id: string) => {
    const landmark = LANDMARKS.find(item => item.id === id)
    if (!landmark) return
    this.pendingTravel = landmark
    this.pendingTravelAt = typeof performance === 'undefined' ? 0 : performance.now()
    this.keys.clear()
    this.walkTarget = null
    this.update({ transition: true, dialog: null, selected: id, district: landmark.district })
  }
  navigate = (index: number) => { const target = LANDMARKS.filter(item => item.kind === 'district')[index]; if (target) this.travel(target.id) }
  interact = (id = this.snapshot.nearest) => {
    const landmark = LANDMARKS.find(item => item.id === id)
    if (!landmark) return
    this.keys.clear()
    const selected = landmark.id
    if (landmark.kind === 'venue') { this.travel(`interior:${selected.split(':')[1]}`); return }
    if (landmark.kind === 'elevator') { this.travel('sky'); return }
    const dialogs: Partial<Record<GridLandmark['kind'], GridDialog>> = { map: 'map', contact: 'contact', interior: 'project', platform: 'role', market: 'market', skill: 'skill' }
    this.update({ selected, dialog: dialogs[landmark.kind] ?? null })
  }
  toggleTour = () => {
    if (this.reducedMotion) { this.update({ dialog: 'map' }); return }
    this.keys.clear()
    if (this.snapshot.mode === 'tour') {
      const stops = LANDMARKS.filter(item => item.kind === 'platform')
      const nearest = stops[Math.max(0, Math.min(stops.length - 1, Math.round(this.tourProgress)))]
      if (nearest) this.pendingTravel = nearest
      this.update({ mode: 'walk', dialog: null, transition: true })
      return
    }
    const stops = LANDMARKS.filter(item => item.kind === 'platform')
    let nearestIndex = 0, distance = Infinity
    stops.forEach((stop, index) => { const next = Math.abs(stop.position[2] - this.position.z); if (next < distance) { distance = next; nearestIndex = index } })
    this.tourProgress = nearestIndex; this.tourScroll = 0
    this.position = { x: 0, y: 7, z: stops[nearestIndex]?.position[2] ?? this.position.z }
    this.update({ mode: 'tour', dialog: null, transition: true })
  }
  togglePhoto = () => {
    this.keys.clear()
    if (this.snapshot.mode === 'photo') {
      this.update({ mode: this.reducedMotion ? 'landmark' : this.modeBeforePhoto, dialog: null, photoNotice: '' })
      return
    }
    this.modeBeforePhoto = this.snapshot.mode
    this.update({ mode: 'photo', dialog: null, photoNotice: '' })
  }
  toggleAudio = () => { this.update({ audio: !this.snapshot.audio }) }
}
