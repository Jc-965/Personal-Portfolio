import { lazy, Suspense, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import CityWorld from './city/CityWorld'
import { gradeSceneBg } from './city/sceneColor'
import { BG_COLOR, LANDMARKS } from './gridConfig'
import { collectCollisionWorld } from './navigation/sceneCollision'
import { moveCapsule, type CollisionWorld } from './navigation/collision'
import { advanceWorldTime, nearestLandmark, type GridSession } from './navigation/session'
import type { GridQuality } from './gridPerformance'
import type { GridSelection, GridSkyController, SkyState, SkyTooltip } from './city/interaction'

const GridEffects = lazy(() => import('./GridEffects'))
export interface GridSceneProps {
  progressRef: MutableRefObject<number>; reducedMotion: boolean; quality: GridQuality; session: GridSession
  onSky?: (state: SkyState) => void; onSkyController?: (controller: GridSkyController | null) => void
  onTooltip?: (tooltip: SkyTooltip | null) => void; dragActiveRef?: MutableRefObject<boolean>
  selection: GridSelection; onSelectProject: (index: number) => void
  onSelectRole: (index: number | null, options?: { inspect?: boolean }) => void
  onClearFocus?: () => void; onPlaceStar?: () => void
}
const isUi = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('input,textarea,select,button,a,[contenteditable="true"],.grid-hud__panel'))

function FirstPersonRig({ session, reducedMotion, progressRef }: { session: GridSession; reducedMotion: boolean; progressRef: MutableRefObject<number> }) {
  const { camera, scene, gl, raycaster, pointer } = useThree()
  const world = useRef<CollisionWorld | null>(null)
  const smoothYaw = useRef(session.yaw), smoothPitch = useRef(session.pitch), lastUi = useRef(0)
  const lastCollision = useRef(0)
  const look = useMemo(() => new THREE.Vector3(), [])
  useEffect(() => {
    const perspective = camera as THREE.PerspectiveCamera
    perspective.fov = 62; perspective.updateProjectionMatrix()
    const frame = requestAnimationFrame(() => { world.current = collectCollisionWorld(scene) })
    const canvas = gl.domElement
    const gesture = { down: false, moved: false, x: 0, y: 0 }
    const touchGesture = { x: 0, y: 0, moved: false }
    if (import.meta.env.DEV) {
      const debug = window as typeof window & { __gridCamera?: THREE.Camera; __gridRenderer?: THREE.WebGLRenderer; __gridScene?: THREE.Scene; render_game_to_text?: () => string }
      debug.__gridCamera = camera; debug.__gridRenderer = gl; debug.__gridScene = scene
      debug.render_game_to_text = () => {
        const nearest = nearestLandmark(session.position, 999)
        return JSON.stringify({ coordinateConvention: '+x east, +y up, -z south', position: session.position, mode: session.getSnapshot().mode, nearest: nearest && { id: nearest.id, distance: Math.round(Math.hypot(nearest.position[0] - session.position.x, nearest.position[2] - session.position.z)) } })
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (isUi(event.target) || event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (['w','a','s','d','shift','arrowup','arrowdown'].includes(key)) { event.preventDefault(); session.keys.add(key) }
      if ((key === 'q' || key === 'arrowleft') && !event.repeat) session.turnAmount += Math.PI / 12
      if ((key === 'e' || key === 'arrowright') && !event.repeat) {
        if (key === 'e' && session.getSnapshot().nearest) session.interact()
        else session.turnAmount -= Math.PI / 12
      }
    }
    const onKeyUp = (event: KeyboardEvent) => session.keys.delete(event.key.toLowerCase())
    const clear = () => session.keys.clear()
    const onPointerMove = (event: PointerEvent) => {
      if (document.pointerLockElement === canvas) {
        session.yaw -= event.movementX * 0.0018; session.pitch = THREE.MathUtils.clamp(session.pitch - event.movementY * 0.00165, -1.18, 1.18); return
      }
      if (!gesture.down) return
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y
      if (Math.hypot(dx, dy) > 3) gesture.moved = true
      session.yaw -= dx * 0.004; session.pitch = THREE.MathUtils.clamp(session.pitch - dy * 0.0037, -1.18, 1.18)
      gesture.x = event.clientX; gesture.y = event.clientY
    }
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || isUi(event.target) || document.pointerLockElement === canvas) return
      gesture.down = true; gesture.moved = false; gesture.x = event.clientX; gesture.y = event.clientY; canvas.setPointerCapture(event.pointerId)
    }
    const onPointerUp = (event: PointerEvent) => { if (!gesture.down) return; gesture.down = false; if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); if (!gesture.moved && session.getSnapshot().mode !== 'photo') void canvas.requestPointerLock() }
    const onTouchStart = (event: TouchEvent) => { const touch = event.touches[0]; if (!touch) return; touchGesture.x = touch.clientX; touchGesture.y = touch.clientY; touchGesture.moved = false }
    const onTouchMove = (event: TouchEvent) => { const touch = event.touches[0]; if (touch && Math.hypot(touch.clientX - touchGesture.x, touch.clientY - touchGesture.y) > 10) touchGesture.moved = true }
    const onTouchEnd = (event: TouchEvent) => {
      if (event.changedTouches.length !== 1 || touchGesture.moved || session.getSnapshot().mode !== 'walk') return
      const touch = event.changedTouches[0]
      pointer.set((touch.clientX / innerWidth) * 2 - 1, -(touch.clientY / innerHeight) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObjects(scene.children, true).find(item => item.object.visible && item.object.type !== 'Points' && item.object.type !== 'Line')
      if (!hit?.face) return
      const normal = hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
      if (normal.y > 0.6) session.walkTarget = { x: hit.point.x, z: hit.point.z }
    }
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', clear)
    canvas.addEventListener('pointermove', onPointerMove); canvas.addEventListener('pointerdown', onPointerDown); canvas.addEventListener('pointerup', onPointerUp); canvas.addEventListener('touchstart', onTouchStart, { passive: true }); canvas.addEventListener('touchmove', onTouchMove, { passive: true }); canvas.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      cancelAnimationFrame(frame); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', clear)
      canvas.removeEventListener('pointermove', onPointerMove); canvas.removeEventListener('pointerdown', onPointerDown); canvas.removeEventListener('pointerup', onPointerUp); canvas.removeEventListener('touchstart', onTouchStart); canvas.removeEventListener('touchmove', onTouchMove); canvas.removeEventListener('touchend', onTouchEnd)
      if (import.meta.env.DEV) delete (window as typeof window & { render_game_to_text?: () => string }).render_game_to_text
    }
  }, [camera, gl, pointer, raycaster, scene, session])

  useFrame((state, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1), snapshot = session.getSnapshot()
    advanceWorldTime(delta, snapshot.mode === 'photo' || reducedMotion); session.seconds += delta
    if (state.clock.elapsedTime - lastCollision.current > 1.5) { lastCollision.current = state.clock.elapsedTime; world.current = collectCollisionWorld(scene) }
    if (session.pendingTravel && performance.now() - session.pendingTravelAt >= 250) {
      const target = session.pendingTravel
      session.position = { x: target.position[0], y: target.position[1], z: target.position[2] }
      session.yaw = Math.atan2(target.look[0] - target.position[0], -(target.look[2] - target.position[2]))
      session.pitch = Math.atan2(target.look[1] - target.position[1] - 1.7, Math.hypot(target.look[0] - target.position[0], target.look[2] - target.position[2]))
      progressRef.current = target.id === 'sky' ? 1 : Math.min(0.77, target.district / 6)
      session.pendingTravel = null; smoothYaw.current = session.yaw; smoothPitch.current = session.pitch; window.setTimeout(() => session.update({ transition: false }), 250)
    }
    if (snapshot.mode === 'tour') {
      const stops = LANDMARKS.filter(item => item.kind === 'platform')
      const index = Math.max(0, Math.min(stops.length - 1, Math.floor(session.tourProgress)))
      session.tourScroll += delta
      if (session.tourScroll >= 5) {
        const next = (index + 1) % stops.length, targetZ = stops[next].position[2]
        const distance = targetZ - session.position.z
        session.position = { x: 0, y: 7, z: session.position.z + Math.sign(distance) * Math.min(Math.abs(distance), 3 * delta) }
        if (Math.abs(distance) < 0.04) { session.tourProgress = next; session.tourScroll = 0; session.update({ district: 1, selected: stops[next].id }) }
      } else session.position = { x: 0, y: 7, z: stops[index].position[2] }
      progressRef.current = index / Math.max(1, stops.length - 1)
    } else if (snapshot.mode === 'walk' && world.current) {
      session.yaw += session.turnAmount; session.turnAmount = 0
      let forward = Number(session.keys.has('w') || session.keys.has('arrowup')) - Number(session.keys.has('s') || session.keys.has('arrowdown'))
      let strafe = Number(session.keys.has('d')) - Number(session.keys.has('a'))
      forward -= session.joystick.y; strafe += session.joystick.x
      if (session.walkTarget) {
        const dx = session.walkTarget.x - session.position.x, dz = session.walkTarget.z - session.position.z
        if (Math.hypot(dx, dz) < 0.35) session.walkTarget = null
        else { session.yaw = Math.atan2(dx, -dz); forward = 1 }
      }
      const magnitude = Math.hypot(forward, strafe)
      if (magnitude > 0.01) {
        const speed = (session.keys.has('shift') ? 3.5 : 1.6) * delta / Math.max(1, magnitude)
        session.position = moveCapsule(session.position,
          (Math.sin(session.yaw) * forward + Math.cos(session.yaw) * strafe) * speed,
          (-Math.cos(session.yaw) * forward + Math.sin(session.yaw) * strafe) * speed, world.current)
        session.lastInput = performance.now()
      }
    }
    if (snapshot.mode !== 'tour') progressRef.current = session.position.y > 30 ? 1 : Math.min(0.77, snapshot.district / 6)
    const nearest = nearestLandmark(session.position)
    if (state.clock.elapsedTime - lastUi.current > 0.16) {
      lastUi.current = state.clock.elapsedTime
      if (nearest) { const projected = new THREE.Vector3(nearest.position[0], nearest.position[1] + 2.2, nearest.position[2]).project(camera); session.screenAnchor = { x: (projected.x * .5 + .5) * innerWidth, y: (-projected.y * .5 + .5) * innerHeight, visible: projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < .9 && Math.abs(projected.y) < .85 } } else session.screenAnchor.visible = false
      session.update({ nearest: nearest?.id ?? null, district: nearest?.district ?? snapshot.district })
    }
    const ease = 1 - Math.exp(-delta * 14)
    smoothYaw.current += (session.yaw - smoothYaw.current) * ease; smoothPitch.current += (session.pitch - smoothPitch.current) * ease
    if (snapshot.mode === 'photo') {
      const origin = look.set(session.position.x, session.position.y + 1.7, session.position.z)
      const orbitYaw = reducedMotion ? session.yaw : smoothYaw.current
      const desired = new THREE.Vector3(session.position.x + Math.sin(orbitYaw) * 1.1, session.position.y + 1.85, session.position.z + Math.cos(orbitYaw) * 1.1)
      const direction = desired.clone().sub(origin), orbitDistance = direction.length()
      raycaster.set(origin, direction.normalize()); raycaster.far = orbitDistance
      const obstruction = raycaster.intersectObjects(scene.children, true).find(hit => !hit.object.userData.noCollision && hit.distance > 0.15)
      raycaster.far = Infinity
      camera.position.copy(obstruction ? origin.clone().addScaledVector(direction, Math.max(0.12, obstruction.distance - 0.12)) : desired)
      look.set(session.position.x, session.position.y + 1.7, session.position.z); camera.lookAt(look); gl.toneMappingExposure = 1.04
    } else {
      camera.position.set(session.position.x, session.position.y + 1.7, session.position.z)
      look.set(camera.position.x + Math.sin(smoothYaw.current) * Math.cos(smoothPitch.current) * 10, camera.position.y + Math.sin(smoothPitch.current) * 10, camera.position.z - Math.cos(smoothYaw.current) * Math.cos(smoothPitch.current) * 10)
      camera.lookAt(look); gl.toneMappingExposure = 0.92
    }
    gl.setClearColor(gradeSceneBg(Math.min(1, snapshot.district / 5)))
  })
  return null
}

function PhotoCapture({ session, postEnabled }: { session: GridSession; postEnabled: boolean }) {
  const { gl, scene, camera } = useThree()
  useFrame(() => {
    if (!postEnabled) gl.render(scene, camera)
    if (!session.captureRequested) return
    session.captureRequested = false
    const link = document.createElement('a'); link.download = `the-grid-${Date.now()}.png`; link.href = gl.domElement.toDataURL('image/png'); link.click()
    session.update({ photoNotice: 'Photo saved' })
  }, 2)
  return null
}

export default function GridScene(props: GridSceneProps) {
  const interaction = useMemo(() => ({ progressRef: props.progressRef, dragActiveRef: props.dragActiveRef, onSky: props.onSky, onSkyController: props.onSkyController, onTooltip: props.onTooltip, selection: props.selection, onSelectProject: props.onSelectProject, onSelectRole: props.onSelectRole, onPlaceStar: props.onPlaceStar }), [props])
  return <Canvas dpr={[1, props.quality.maxDpr]} shadows={props.quality.shadows ?? props.quality.tier !== 'low'} gl={{ antialias: props.quality.antialias, powerPreference: 'high-performance', alpha: false }} camera={{ fov: 62, near: 0.1, far: 800, position: [0, 1.7, 34] }} raycaster={{ params: { Mesh: {}, LOD: {}, Sprite: {}, Points: { threshold: 5 }, Line: { threshold: 1 } } }} onCreated={({ gl }) => { gl.setClearColor(new THREE.Color(BG_COLOR)); gl.outputColorSpace = THREE.SRGBColorSpace; gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 0.92 }} onPointerMissed={event => { if (event.type === 'click') props.onClearFocus?.() }}>
    <Suspense fallback={null}><FirstPersonRig session={props.session} reducedMotion={props.reducedMotion} progressRef={props.progressRef} /><CityWorld quality={props.quality} interaction={interaction} session={props.session} /><PhotoCapture session={props.session} postEnabled={props.quality.postEnabled} /></Suspense>
    {props.quality.postEnabled && <Suspense fallback={null}><GridEffects enabled msaa={props.quality.msaa} photo={props.session.getSnapshot().mode === 'photo'} /></Suspense>}
  </Canvas>
}
