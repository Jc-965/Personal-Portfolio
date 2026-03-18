/* eslint-disable react/no-unknown-property */
import { useRef, useEffect, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Terrain from './Terrain'
import TerrainPopulation from './TerrainPopulation'
import SketchPostProcessing from './SketchPostProcessing'
import useIsPhone from '../../hooks/useIsPhone'
import { useGyroscope } from '../../context/GyroscopeContext'
import { useTerrainDeformation, type BrushMode } from './useTerrainDeformation'

function CursorEnforcer() {
  const { gl } = useThree()
  useFrame(() => {
    const canvas = gl.domElement
    if (canvas.style.cursor !== 'none') {
      canvas.style.setProperty('cursor', 'none', 'important')
    }
  })
  return null
}

function SceneCleanup() {
  const { gl, scene } = useThree()

  useEffect(() => {
    return () => {
      scene.traverse((obj: THREE.Object3D) => {
        if ((obj as THREE.Mesh).isMesh || (obj as THREE.InstancedMesh).isInstancedMesh) {
          const m = obj as THREE.Mesh
          m.geometry?.dispose()
          const mats = Array.isArray(m.material) ? m.material : [m.material]
          for (const mat of mats) {
            if (!mat) continue
            for (const val of Object.values(mat as unknown as Record<string, unknown>)) {
              if (val instanceof THREE.Texture) val.dispose()
            }
            ;(mat as THREE.Material).dispose()
          }
        }
      })
      gl.renderLists.dispose()
      gl.dispose()
    }
  }, [gl, scene])

  return null
}

const VIEWS = [
  { name: 'landscape', pos: [0, 10, 30], look: [0, 3, -14] },
  { name: 'forest', pos: [22, 7, 20], look: [-8, 3, -10] },
  { name: 'aerial', pos: [0, 32, 10], look: [0, 1, -8] },
  { name: 'wander', pos: [-24, 8, 22], look: [12, 3, -12] },
] as const

interface CameraControllerProps {
  mouseRef: React.MutableRefObject<{ x: number; y: number; active: boolean }>
  gyroRef: React.MutableRefObject<{ x: number; y: number }>
  keysRef: React.MutableRefObject<Set<string>>
  isMobile: boolean
  viewIndex: number
  zoom: number
}

function CameraController({ mouseRef, gyroRef, keysRef, isMobile, viewIndex, zoom }: CameraControllerProps) {
  const { camera } = useThree()
  const target = useRef(new THREE.Vector3())
  const current = useRef(new THREE.Vector3(...VIEWS[0].pos))
  const lookTarget = useRef(new THREE.Vector3())
  const currentLook = useRef(new THREE.Vector3(...VIEWS[0].look))
  const wasdOffset = useRef(new THREE.Vector3(0, 0, 0))
  const wasdLookOffset = useRef(new THREE.Vector3(0, 0, 0))
  const yawAngle = useRef(0)
  const _forward = useRef(new THREE.Vector3())
  const _right = useRef(new THREE.Vector3())
  const _up = useRef(new THREE.Vector3(0, 1, 0))
  const _move = useRef(new THREE.Vector3())

  useFrame(() => {
    const v = VIEWS[viewIndex % VIEWS.length]
    const keys = keysRef.current
    const moveSpeed = 0.4
    const rotSpeed = 0.02

    if (keys.size > 0) {
      const forward = _forward.current
      camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()
      _right.current.crossVectors(forward, _up.current).normalize()
      const right = _right.current
      const move = _move.current

      if (keys.has('w') || keys.has('arrowup')) {
        move.copy(forward).multiplyScalar(moveSpeed)
        wasdOffset.current.add(move)
        wasdLookOffset.current.add(move)
      }
      if (keys.has('s') || keys.has('arrowdown')) {
        move.copy(forward).multiplyScalar(-moveSpeed)
        wasdOffset.current.add(move)
        wasdLookOffset.current.add(move)
      }
      if (keys.has('a') || keys.has('arrowleft')) {
        move.copy(right).multiplyScalar(-moveSpeed)
        wasdOffset.current.add(move)
        wasdLookOffset.current.add(move)
      }
      if (keys.has('d') || keys.has('arrowright')) {
        move.copy(right).multiplyScalar(moveSpeed)
        wasdOffset.current.add(move)
        wasdLookOffset.current.add(move)
      }
      if (keys.has('q')) yawAngle.current -= rotSpeed
      if (keys.has('e')) yawAngle.current += rotSpeed
      if (keys.has('r')) wasdOffset.current.y += moveSpeed * 0.5
      if (keys.has('f')) wasdOffset.current.y -= moveSpeed * 0.5
    }

    let offsetX = 0
    let offsetZ = 0
    if (isMobile) {
      offsetX = gyroRef.current.x * 6
      offsetZ = -gyroRef.current.y * 4
    } else if (mouseRef.current) {
      offsetX = (mouseRef.current.x - 0.5) * 10
      offsetZ = (mouseRef.current.y - 0.5) * -6
    }

    const zf = 1 / zoom
    const cosY = Math.cos(yawAngle.current)
    const sinY = Math.sin(yawAngle.current)
    const baseX = v.pos[0] * zf + offsetX
    const baseZ = v.pos[2] * zf + offsetZ

    target.current.set(
      baseX * cosY - baseZ * sinY + wasdOffset.current.x,
      v.pos[1] * zf + wasdOffset.current.y,
      baseX * sinY + baseZ * cosY + wasdOffset.current.z
    )

    const lx = v.look[0], lz = v.look[2]
    lookTarget.current.set(
      lx * cosY - lz * sinY + wasdLookOffset.current.x,
      v.look[1],
      lx * sinY + lz * cosY + wasdLookOffset.current.z
    )

    current.current.lerp(target.current, 0.06)
    currentLook.current.lerp(lookTarget.current, 0.06)
    camera.position.copy(current.current)
    camera.lookAt(currentLook.current)
  })

  return null
}

// Animal interaction — raycasting for pick up / drop
interface AnimalInteractionProps {
  animalsRef: React.MutableRefObject<THREE.Group | null>
  terrainRef: React.MutableRefObject<THREE.Mesh | null>
  eventTargetRef: React.MutableRefObject<HTMLDivElement | null>
  mouseRef: React.MutableRefObject<{ x: number; y: number; active: boolean }>
  carriedRef: React.MutableRefObject<THREE.Mesh | null>
  onCursorChange: (state: 'default' | 'grab' | 'grabbing') => void
  onInteraction?: (kind: 'pick' | 'drop', x: number, y: number) => void
}

function AnimalInteraction({
  animalsRef,
  terrainRef,
  eventTargetRef,
  mouseRef,
  carriedRef,
  onCursorChange,
  onInteraction,
}: AnimalInteractionProps) {
  const { camera, raycaster } = useThree()
  const hoveredRef = useRef<THREE.Mesh | null>(null)
  const lastCheck = useRef(0)
  const mouseNDC = useRef(new THREE.Vector2())
  const terrainHitRef = useRef<THREE.Vector3 | null>(null)
  const _lerpTarget = useRef(new THREE.Vector3())
  const _carryPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0))
  const _planeHit = useRef(new THREE.Vector3())
  const carryHeight = useRef(0)
  const liftOffset = 3

  useFrame(({ clock }) => {
    const now = clock.getElapsedTime()
    if (now - lastCheck.current < 0.016) return
    lastCheck.current = now

    if (!mouseRef.current?.active || !animalsRef.current) return

    mouseNDC.current.set(
      mouseRef.current.x * 2 - 1,
      -(mouseRef.current.y * 2 - 1)
    )
    raycaster.setFromCamera(mouseNDC.current, camera)

    if (carriedRef.current && terrainRef.current) {
      _carryPlane.current.set(_carryPlane.current.normal, -carryHeight.current)
      const hit = raycaster.ray.intersectPlane(_carryPlane.current, _planeHit.current)
      if (hit) {
        _lerpTarget.current.set(hit.x, carryHeight.current, hit.z)
        carriedRef.current.position.lerp(_lerpTarget.current, 0.6)

        const terrainHits = raycaster.intersectObject(terrainRef.current)
        if (terrainHits.length > 0) {
          if (!terrainHitRef.current) terrainHitRef.current = new THREE.Vector3()
          terrainHitRef.current.copy(terrainHits[0].point)
        }
      }
      return
    }

    // Otherwise, check for animal hover
    const intersects = raycaster.intersectObjects(animalsRef.current.children, false)
    if (intersects.length > 0) {
      const mesh = intersects[0].object as THREE.Mesh
      if (hoveredRef.current !== mesh) {
        hoveredRef.current = mesh
        onCursorChange('grab')
      }
    } else if (hoveredRef.current) {
      hoveredRef.current = null
      onCursorChange('default')
    }
  })

  useEffect(() => {
    const target = eventTargetRef.current
    if (!target) return

    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('.sketch-brush-slider-wrap') || el.closest('.sketch-btn') || el.closest('.sketch-back-btn')) return
      e.preventDefault()
      if (carriedRef.current) {
        const hit = terrainHitRef.current
        if (hit) {
          const dropped = new THREE.Vector3(hit.x, hit.y + 0.35, hit.z)
          carriedRef.current.position.copy(dropped)
          carriedRef.current.userData.basePosition = dropped.clone()
        }
        carriedRef.current = null
        hoveredRef.current = null
        onCursorChange('default')
        onInteraction?.('drop', e.clientX, e.clientY)
      } else if (hoveredRef.current) {
        carriedRef.current = hoveredRef.current
        carryHeight.current = hoveredRef.current.position.y + liftOffset
        onCursorChange('grabbing')
        onInteraction?.('pick', e.clientX, e.clientY)
      }
    }

    target.addEventListener('pointerdown', onPointerDown)
    return () => target.removeEventListener('pointerdown', onPointerDown)
  }, [eventTargetRef, carriedRef, onCursorChange, onInteraction])

  return null
}

const BRUSH_MODES: BrushMode[] = ['raise', 'lower', 'flatten', 'smooth', 'noise']
const BRUSH_LABELS: Record<BrushMode, string> = {
  raise: 'raise',
  lower: 'dig',
  flatten: 'flatten',
  smooth: 'smooth',
  noise: 'roughen',
}

interface SketchbookCanvasProps {
  onCursorChange?: (state: 'default' | 'grab' | 'grabbing') => void
  onInteraction?: (kind: 'pick' | 'drop', x: number, y: number) => void
  scrollProgressRef?: React.MutableRefObject<number>
  isVisible?: boolean
  uiHidden?: boolean
  onToggleUI?: () => void
}

export default function SketchbookCanvas({ onCursorChange, onInteraction, uiHidden, onToggleUI }: SketchbookCanvasProps) {
  const emitCursorChange = onCursorChange ?? (() => {})
  const mouseRef = useRef({ x: 0.5, y: 0.5, active: false })
  const gyroRef = useRef({ x: 0, y: 0 })
  const keysRef = useRef(new Set<string>())
  const containerRef = useRef<HTMLDivElement>(null)
  const animalsRef = useRef<THREE.Group | null>(null)
  const terrainRef = useRef<THREE.Mesh | null>(null)
  const carriedRef = useRef<THREE.Mesh | null>(null)
  const isMobile = useIsPhone()
  const gyro = useGyroscope()
  const [viewIndex, setViewIndex] = useState(0)
  const [zoom, setZoom] = useState(0.55)
  const deformation = useTerrainDeformation()
  const [brushEnabled, setBrushEnabled] = useState(true)
  const [brushMode, setBrushMode] = useState<BrushMode>('raise')
  const [brushStrength, setBrushStrength] = useState(0.15)
  const progressRef = useRef(1)

  const cycleView = useCallback(() => setViewIndex(i => (i + 1) % VIEWS.length), [])
  const zoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, 2.5)), [])
  const zoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.15)), [])
  const cycleBrush = useCallback(() => {
    setBrushMode(m => {
      const idx = BRUSH_MODES.indexOf(m)
      return BRUSH_MODES[(idx + 1) % BRUSH_MODES.length]
    })
  }, [])

  // WASD key tracking
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (['w', 'a', 's', 'd', 'q', 'e', 'r', 'f', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault()
        keysRef.current.add(key)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase())
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      keysRef.current.clear()
    }
  }, [])

  // Scroll wheel zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setZoom(z => {
        const delta = e.deltaY < 0 ? 0.03 : -0.03
        return Math.max(0.15, Math.min(2.5, z + delta))
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    if (!gyro.permitted) return
    return gyro.subscribe((x, y) => {
      gyroRef.current.x = x
      gyroRef.current.y = y
    })
  }, [gyro, gyro.permitted])

  const uiInteracting = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onMove = (e: PointerEvent) => {
      if (uiInteracting.current) return
      const target = e.target as HTMLElement
      if (target.closest('.sketch-ui-layer') || target.closest('.sketch-brush-slider-wrap') || target.closest('.sketch-btn--hide-ui')) return
      const rect = el.getBoundingClientRect()
      mouseRef.current.x = (e.clientX - rect.left) / rect.width
      mouseRef.current.y = (e.clientY - rect.top) / rect.height
      mouseRef.current.active = true
    }
    const onLeave = () => {
      mouseRef.current.active = false
      if (!carriedRef.current) emitCursorChange('default')
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    }
  }, [emitCursorChange, carriedRef])

  const viewName = VIEWS[viewIndex % VIEWS.length].name

  return (
    <div ref={containerRef} className="sketchbook-canvas-wrapper">
      <Canvas
        dpr={[1, Math.min(window.devicePixelRatio, 1.5)]}
        gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
        camera={{ position: [0, 14, 40], fov: 50, near: 0.1, far: 300 }}
        frameloop="always"
        onCreated={({ gl }) => {
          gl.domElement.style.setProperty('cursor', 'none', 'important')
        }}
      >
        <SceneCleanup />
        <CursorEnforcer />
        <color attach="background" args={['#f4efe5']} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[15, 30, 10]} intensity={1.1} />
        <directionalLight position={[-10, 20, -8]} intensity={0.35} />
        <hemisphereLight args={['#c8dae8', '#8a7d6a', 0.4]} />

        <CameraController
          mouseRef={mouseRef} gyroRef={gyroRef} keysRef={keysRef}
          isMobile={isMobile} viewIndex={viewIndex} zoom={zoom}
        />
        <Terrain mouseRef={mouseRef} scrollProgress={progressRef} meshRef={terrainRef} brushEnabled={brushEnabled} brushMode={brushMode} brushStrength={brushStrength} deformation={deformation} />
        <TerrainPopulation isMobile={isMobile} animalsRef={animalsRef} carriedRef={carriedRef} getDeformOffset={deformation.getDeformOffset} />
        <AnimalInteraction
          animalsRef={animalsRef}
          terrainRef={terrainRef}
          eventTargetRef={containerRef}
          mouseRef={mouseRef}
          carriedRef={carriedRef}
          onCursorChange={emitCursorChange}
          onInteraction={onInteraction}
        />

        <fog attach="fog" args={['#f0ebe2', 80, 220]} />
        <SketchPostProcessing />
      </Canvas>

      <div className={`sketch-ui-layer ${uiHidden ? 'sketch-ui-layer--hidden' : ''}`}>
        <div className="sketch-controls">
          <button className="sketch-btn" onClick={cycleView}>{viewName}</button>
          <button className="sketch-btn sketch-btn--icon" onClick={zoomIn}>+</button>
          <button className="sketch-btn sketch-btn--icon" onClick={zoomOut}>&minus;</button>
        </div>

        <div className="sketch-wasd-hint">
          <span>wasd</span> move · <span>qe</span> rotate · <span>rf</span> up/down · <span>esc</span> exit
        </div>
      </div>

      {/* Always-visible bottom bar */}
      <div className="sketch-brush-controls">
        <div className={`sketch-brush-controls__hideable ${uiHidden ? 'sketch-brush-controls__hideable--hidden' : ''}`}>
          <button
            className={`sketch-btn sketch-btn--brush-toggle ${brushEnabled ? 'sketch-btn--active' : ''}`}
            onClick={() => setBrushEnabled(e => !e)}
            title={brushEnabled ? 'Disable terrain sculpting' : 'Enable terrain sculpting'}
          >
            {brushEnabled ? 'sculpt: on' : 'sculpt: off'}
          </button>
          {brushEnabled && (
            <button className="sketch-btn sketch-btn--brush-mode" onClick={cycleBrush}>
              {BRUSH_LABELS[brushMode]}
            </button>
          )}
        </div>

        <button
          className="sketch-btn sketch-btn--hide-ui"
          onClick={onToggleUI}
          title={uiHidden ? 'Show UI' : 'Hide UI'}
        >
          {uiHidden ? '[ ]' : 'x'}
        </button>

        <div className={`sketch-brush-controls__hideable ${uiHidden ? 'sketch-brush-controls__hideable--hidden' : ''}`}>
          {brushEnabled && (
            <div
              className="sketch-brush-slider-wrap"
              onPointerDown={e => { e.stopPropagation(); uiInteracting.current = true; mouseRef.current.active = false }}
              onPointerUp={() => { uiInteracting.current = false }}
              onLostPointerCapture={() => { uiInteracting.current = false }}
            >
              <input
                type="range"
                className="sketch-brush-slider"
                min={0.02}
                max={1}
                step={0.02}
                value={brushStrength}
                onChange={e => setBrushStrength(parseFloat(e.target.value))}
              />
              <span className="sketch-brush-slider-label">{Math.round(brushStrength * 100)}%</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
