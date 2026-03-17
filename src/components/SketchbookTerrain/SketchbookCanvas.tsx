/* eslint-disable react/no-unknown-property */
import { useRef, useEffect, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import Terrain from './Terrain'
import TerrainPopulation from './TerrainPopulation'
import SketchPostProcessing from './SketchPostProcessing'
import useIsPhone from '../../hooks/useIsPhone'
import { useGyroscope } from '../../context/GyroscopeContext'

const VIEWS = [
  { name: 'landscape', pos: [0, 14, 40], look: [0, 4, -10] },
  { name: 'valley', pos: [20, 8, 25], look: [-5, 3, -5] },
  { name: 'aerial', pos: [0, 40, 15], look: [0, 0, -5] },
  { name: 'wander', pos: [-18, 10, 30], look: [10, 5, -10] },
] as const

interface CameraControllerProps {
  mouseRef: React.RefObject<{ x: number; y: number; active: boolean }>
  gyroRef: React.RefObject<{ x: number; y: number }>
  keysRef: React.RefObject<Set<string>>
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

  useFrame(() => {
    const v = VIEWS[viewIndex % VIEWS.length]
    const keys = keysRef.current
    const moveSpeed = 0.4
    const rotSpeed = 0.02

    if (keys.size > 0) {
      const forward = new THREE.Vector3()
      camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()
      const right = new THREE.Vector3()
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

      if (keys.has('w') || keys.has('arrowup')) {
        wasdOffset.current.add(forward.clone().multiplyScalar(moveSpeed))
        wasdLookOffset.current.add(forward.clone().multiplyScalar(moveSpeed))
      }
      if (keys.has('s') || keys.has('arrowdown')) {
        wasdOffset.current.add(forward.clone().multiplyScalar(-moveSpeed))
        wasdLookOffset.current.add(forward.clone().multiplyScalar(-moveSpeed))
      }
      if (keys.has('a') || keys.has('arrowleft')) {
        wasdOffset.current.add(right.clone().multiplyScalar(-moveSpeed))
        wasdLookOffset.current.add(right.clone().multiplyScalar(-moveSpeed))
      }
      if (keys.has('d') || keys.has('arrowright')) {
        wasdOffset.current.add(right.clone().multiplyScalar(moveSpeed))
        wasdLookOffset.current.add(right.clone().multiplyScalar(moveSpeed))
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
  animalsRef: React.RefObject<THREE.Group | null>
  terrainRef: React.RefObject<THREE.Mesh | null>
  mouseRef: React.RefObject<{ x: number; y: number; active: boolean }>
  carriedRef: React.RefObject<THREE.Mesh | null>
  onCursorChange: (state: 'default' | 'grab' | 'grabbing') => void
}

function AnimalInteraction({ animalsRef, terrainRef, mouseRef, carriedRef, onCursorChange }: AnimalInteractionProps) {
  const { camera, raycaster } = useThree()
  const hoveredRef = useRef<THREE.Mesh | null>(null)
  const lastCheck = useRef(0)
  const mouseNDC = useRef(new THREE.Vector2())
  const carriedOriginalPos = useRef(new THREE.Vector3())
  const liftOffset = 3

  useFrame(({ clock }) => {
    const now = clock.getElapsedTime()
    if (now - lastCheck.current < 0.05) return // throttle to 20fps
    lastCheck.current = now

    if (!mouseRef.current?.active || !animalsRef.current) return

    mouseNDC.current.set(
      mouseRef.current.x * 2 - 1,
      -(mouseRef.current.y * 2 - 1)
    )
    raycaster.setFromCamera(mouseNDC.current, camera)

    // If carrying, move carried animal to terrain intersection
    if (carriedRef.current && terrainRef.current) {
      const hits = raycaster.intersectObject(terrainRef.current)
      if (hits.length > 0) {
        const p = hits[0].point
        carriedRef.current.position.lerp(
          new THREE.Vector3(p.x, p.y + liftOffset, p.z),
          0.15
        )
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

  // Click handling via pointer events on the canvas
  useEffect(() => {
    const onClick = () => {
      if (carriedRef.current) {
        // Drop animal
        carriedRef.current = null
        onCursorChange('default')
      } else if (hoveredRef.current) {
        // Pick up animal
        carriedRef.current = hoveredRef.current
        carriedOriginalPos.current.copy(hoveredRef.current.position)
        onCursorChange('grabbing')
      }
    }
    window.addEventListener('click', onClick)
    return () => window.removeEventListener('click', onClick)
  }, [carriedRef, onCursorChange])

  return null
}

interface SketchbookCanvasProps {
  onCursorChange: (state: 'default' | 'grab' | 'grabbing') => void
}

export default function SketchbookCanvas({ onCursorChange }: SketchbookCanvasProps) {
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
  const [zoom, setZoom] = useState(1)
  const progressRef = useRef(1) // always fully in sketch mode

  const cycleView = useCallback(() => setViewIndex(i => (i + 1) % VIEWS.length), [])
  const zoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, 2.5)), [])
  const zoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.4)), [])

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
        const delta = e.deltaY < 0 ? 0.08 : -0.08
        return Math.max(0.4, Math.min(2.5, z + delta))
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

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      mouseRef.current.x = (e.clientX - rect.left) / rect.width
      mouseRef.current.y = (e.clientY - rect.top) / rect.height
      mouseRef.current.active = true
    }
    const onLeave = () => { mouseRef.current.active = false }
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  const viewName = VIEWS[viewIndex % VIEWS.length].name

  return (
    <div ref={containerRef} className="sketchbook-canvas-wrapper">
      <Canvas
        dpr={[1, Math.min(window.devicePixelRatio, 1.5)]}
        gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
        camera={{ position: [0, 14, 40], fov: 50, near: 0.1, far: 300 }}
        frameloop="always"
      >
        <color attach="background" args={['#f5f0e8']} />
        <ambientLight intensity={0.65} />
        <directionalLight position={[15, 30, 10]} intensity={1.1} />
        <directionalLight position={[-10, 20, -8]} intensity={0.35} />
        <hemisphereLight args={['#c8dae8', '#8a7d6a', 0.4]} />

        <CameraController
          mouseRef={mouseRef} gyroRef={gyroRef} keysRef={keysRef}
          isMobile={isMobile} viewIndex={viewIndex} zoom={zoom}
        />
        <Terrain mouseRef={mouseRef} scrollProgress={progressRef} meshRef={terrainRef} />
        <TerrainPopulation isMobile={isMobile} animalsRef={animalsRef} carriedRef={carriedRef} />
        <AnimalInteraction
          animalsRef={animalsRef}
          terrainRef={terrainRef}
          mouseRef={mouseRef}
          carriedRef={carriedRef}
          onCursorChange={onCursorChange}
        />

        <fog attach="fog" args={['#e8e2d8', 80, 200]} />
        <SketchPostProcessing />
      </Canvas>

      {/* Controls */}
      <div className="sketch-controls">
        <button className="sketch-btn" onClick={cycleView}>{viewName}</button>
        <button className="sketch-btn sketch-btn--icon" onClick={zoomIn}>+</button>
        <button className="sketch-btn sketch-btn--icon" onClick={zoomOut}>&minus;</button>
      </div>

      {/* WASD hint */}
      <div className="sketch-wasd-hint">
        <span>wasd</span> move · <span>qe</span> rotate · <span>rf</span> up/down · <span>esc</span> exit
      </div>
    </div>
  )
}
