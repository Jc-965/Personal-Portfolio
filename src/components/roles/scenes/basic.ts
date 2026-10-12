/**
 * The placeholder island every role starts with: a grassy island with trees, rocks, a lamp, and a small monument
 * in the role's accent colour. It also shows the framing every scene keeps. On the home page the island sits in
 * its slot, turns toward the pointer, and lifts on hover. On the journey page the camera comes down to it over the
 * arrival, holds close through the work, and pulls back for the close, with the island left of the copy on wide
 * stages and above it on phones.
 */
import * as THREE from 'three'
import { frame, island, materials, props, ramp, smoother, sunlight } from '../kit'
import type { IslandFactory, IslandFrame, IslandOutput } from '../types'

/** World point the camera looks at, a little below the grass so the hanging rock stays in frame. */
const TARGET = new THREE.Vector3(0, -0.35, 0)

/** The camera's distance, yaw, and pitch for a frame, shared by the scenes built on this framing. */
export function islandView(f: IslandFrame) {
  const a = f.local('arrival')
  const w = f.local('work')
  const c = f.local(f.mode === 'journey' ? 'impact' : '')
  if (f.mode === 'home') {
    return { distance: 8 - 0.4 * f.hover, yaw: 0.55 + f.tiltX * 0.28, pitch: 0.42 - f.tiltY * 0.1, focusX: 0.5, focusY: 0.5 }
  }
  const dive = smoother(ramp(a, 0, 0.8))
  const close = smoother(ramp(w, 0, 0.3)) * (1 - smoother(ramp(c, 0.1, 0.6)))
  const distance = (f.narrow ? 19 : 17) - (f.narrow ? 4.5 : 5.5) * dive - 2 * close + 1.6 * smoother(ramp(c, 0.2, 0.8)) + 0.6 * f.push
  const yaw = 0.55 + 0.9 * dive + 0.6 * w + 0.35 * c + f.tiltX * 0.18 + f.dragYaw
  const pitch = 0.62 - 0.22 * dive + 0.06 * close - f.tiltY * 0.08
  return { distance, yaw, pitch, focusX: f.narrow ? 0.5 : 0.36, focusY: f.narrow ? 0.7 : 0.52 }
}

const createScene: IslandFactory = (ctx) => {
  const scene = new THREE.Scene()
  scene.environment = ctx.environment
  scene.environmentIntensity = 0.35
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80)
  const lights = sunlight(scene)
  const mats = materials()
  const kit = props(mats, 11)
  const accent = ctx.facts.accent
  const base = island(mats, { seed: ctx.story.id.length * 97 + 13, grass: '#7cbf6a', dirt: '#9a6b43', rock: '#8d8378' })
  const world = new THREE.Group()
  world.add(base.group)
  scene.add(world)

  const monument = kit.box(0.5, 0.9, 0.5, accent, { emissive: accent, emissiveIntensity: 0.25, roughness: 0.5 })
  monument.position.set(0.2, 0, -0.1)
  world.add(monument)
  for (let i = 0; i < 9; i++) {
    const angle = (i / 9) * Math.PI * 2 + kit.random() * 0.4
    const r = 1.1 + kit.random() * 0.6
    const tree = kit.tree(i % 3 ? '#3f8a4f' : '#4f9a52')
    tree.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r)
    world.add(tree)
  }
  for (let i = 0; i < 4; i++) {
    const rock = kit.rock()
    rock.position.set((kit.random() - 0.5) * 2.4, 0, (kit.random() - 0.5) * 2.4)
    world.add(rock)
  }
  const lamp = kit.lamp()
  lamp.position.set(-0.5, 0, 0.6)
  world.add(lamp)
  world.add(kit.path([new THREE.Vector2(-1.6, 1.2), new THREE.Vector2(-0.5, 0.6), new THREE.Vector2(0.2, 0.3)], 0.22, '#d9c7a0'))

  const projected = new THREE.Vector3()
  return {
    scene,
    camera,
    update(f): IslandOutput {
      const view = islandView(f)
      world.position.y = 0.12 * f.hover
      for (const { light, base: intensity } of lights) light.intensity = intensity * (1 + 0.2 * f.push)
      frame(camera, TARGET, view.distance, view.yaw, view.pitch, f.aspect, view.focusX, view.focusY)
      projected.copy(TARGET).project(camera)
      return {
        anchors: new Map(),
        panels: [],
        bounds: [new THREE.Vector3(0, -2.2, 0)],
        focusY: projected.y * 0.5 + 0.5,
        busy: false,
        ready: true,
      }
    },
    dispose() {
      base.geometries.forEach((g) => g.dispose())
      kit.dispose()
      mats.dispose()
    },
  }
}

export default createScene
