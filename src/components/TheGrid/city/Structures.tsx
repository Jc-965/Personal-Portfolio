import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import Billboard from './Billboards'
import { makeSignTexture, makeTerminalTexture, type SignSpec } from './signTexture'
import { makePanelMaterial, makeDarkPbrMaterial } from './panelMaterial'
import { SCENE_PROGRESS } from './sceneColor'
import { STREETLIGHTS, LAMP_HEIGHT, LAMP_ARM } from './streetlights'
import type { GridInteraction } from './interaction'
import {
  content,
  stationT,
  JUMBOTRON,
  ENTRY_GATE,
  GANTRY,
  gantryZ,
  MARQUEE,
  marqueeCenter,
  PROJECT_SITES,
  BEYOND_SHOPS,
  RELAY_TOWER,
  SKY_DECK,
} from '../gridConfig'

/**
 * Signature structures, one cluster per district, all staged to be read from
 * the centerline of the street. Roles are overhead sign gantries the visitor
 * rides under (the career as a series of station bridges, tram parked at the
 * selected one); projects are giant wall marquees angled up-street. All words
 * live IN the world — the DOM keeps only a screen-reader document.
 */

/** Break a sentence into sign-sized lines. */
function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    if (line && line.length + word.length + 1 > maxChars) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines
}

function NeonBox({
  position,
  size,
  accent,
  edgeOpacity = 0.9,
  lit = false,
  windowDensity = 0.8,
  seed = 1,
  dimStation,
}: {
  position: [number, number, number]
  size: [number, number, number]
  accent: string
  edgeOpacity?: number
  /** Panel-lit facade instead of a flat dark body. */
  lit?: boolean
  windowDensity?: number
  seed?: number
  /** Dim edges when the rail is far from this station (adjacent-district fix). */
  dimStation?: number
}) {
  // Keyed on contents, not array identity — selection re-renders must never
  // rebuild geometry.
  const sizeKey = size.join(',')
  const { geometry, edges, bodyMaterial, lineMaterial } = useMemo(() => {
    const geometry = new THREE.BoxGeometry(...size)
    const edges = new THREE.EdgesGeometry(geometry)
    const bodyMaterial = lit
      ? makePanelMaterial(accent, size, seed, windowDensity)
      : makeDarkPbrMaterial(accent)
    const lineMaterial = new THREE.LineBasicMaterial({
      color: accent,
      transparent: true,
      opacity: edgeOpacity,
    })
    return { geometry, edges, bodyMaterial, lineMaterial }
  }, [sizeKey, accent, edgeOpacity, lit, windowDensity, seed])

  useEffect(() => () => {
    geometry.dispose()
    edges.dispose()
    for (const texture of (bodyMaterial.userData.ownedTextures ?? []) as THREE.Texture[]) texture.dispose()
    bodyMaterial.dispose()
    lineMaterial.dispose()
  }, [geometry, edges, bodyMaterial, lineMaterial])

  const positionKey = position.join(',')
  const worldPos = useMemo(() => new THREE.Vector3(...position), [positionKey])
  useFrame(state => {
    // Emissive edges ignore fog; fade them by distance so far districts
    // recede instead of photobombing the active station's frame.
    const dist = state.camera.position.distanceTo(worldPos)
    let factor = THREE.MathUtils.clamp(1.7 - dist / 70, 0.12, 1)
    if (dimStation !== undefined) {
      const prox = 1 - Math.min(1, Math.abs(SCENE_PROGRESS.value - stationT(dimStation)) / 0.16)
      factor *= 0.3 + 0.7 * prox
    }
    lineMaterial.opacity = edgeOpacity * factor
  })

  return (
    <group position={position}>
      <mesh geometry={geometry} material={bodyMaterial} />
      <lineSegments geometry={edges} material={lineMaterial} />
    </group>
  )
}

function Sign({
  spec,
  position,
  rotationY = 0,
  height,
  dimStation,
  onClick,
  onPointerOver,
  onPointerMove,
  onPointerOut,
}: {
  spec: SignSpec
  position: [number, number, number]
  rotationY?: number
  height: number
  dimStation?: number
  onClick?: (event: ThreeEvent<MouseEvent>) => void
  onPointerOver?: (event: ThreeEvent<PointerEvent>) => void
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void
  onPointerOut?: (event: ThreeEvent<PointerEvent>) => void
}) {
  // Content-keyed: parent re-renders with equivalent specs must not redraw
  // the canvas or re-upload the texture.
  const specKey = JSON.stringify(spec)
  const sign = useMemo(() => makeSignTexture(spec), [specKey])
  const material = useMemo(
    () =>
      // Front-side only: from behind, a mirrored glowing sheet reads as a
      // glitch, and the rail approaches every sign from its front.
      new THREE.MeshBasicMaterial({
        map: sign.texture,
        transparent: true,
        depthWrite: false,
      }),
    [sign],
  )
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(height * sign.aspect, height),
    [height, sign.aspect],
  )

  useEffect(() => () => {
    sign.texture.dispose()
    material.dispose()
    geometry.dispose()
  }, [sign, material, geometry])

  // Measured from the mesh, not the position prop — signs nested in rotated
  // marquee groups have local coords that say nothing about camera range.
  const meshRef = useRef<THREE.Mesh>(null)
  const worldPos = useMemo(() => new THREE.Vector3(), [])
  useFrame(state => {
    if (!meshRef.current) return
    // Signs are unlit sprites that ignore fog — fade them by distance so a
    // district's signage never photobombs another station's frame.
    meshRef.current.getWorldPosition(worldPos)
    const dist = state.camera.position.distanceTo(worldPos)
    let opacity = THREE.MathUtils.clamp(1.65 - dist / 55, 0, 1)
    if (dimStation !== undefined) {
      const prox = 1 - Math.min(1, Math.abs(SCENE_PROGRESS.value - stationT(dimStation)) / 0.16)
      opacity *= 0.28 + 0.72 * prox
    }
    material.opacity = opacity
  })

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={position}
      rotation-y={rotationY}
      renderOrder={5}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerMove={onPointerMove}
      onPointerOut={onPointerOut}
    />
  )
}

/** Sign laid flat into the street — names inlaid like giant road markings,
 * read while flying toward them (glyph tops point down-avenue). */
function FloorSign({
  spec,
  position,
  height,
  opacity = 0.85,
}: {
  spec: SignSpec
  position: [number, number, number]
  height: number
  opacity?: number
}) {
  const specKey = JSON.stringify(spec)
  const sign = useMemo(() => makeSignTexture(spec), [specKey])
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: sign.texture,
        transparent: true,
        depthWrite: false,
        opacity,
      }),
    [sign, opacity],
  )
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(height * sign.aspect, height),
    [height, sign.aspect],
  )
  useEffect(() => () => {
    sign.texture.dispose()
    material.dispose()
    geometry.dispose()
  }, [sign, material, geometry])
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation-x={-Math.PI / 2}
      renderOrder={3}
    />
  )
}

/** Instanced sodium streetlights along both kerbs — silhouette poles whose
 * warm lamp heads bloom into the classic wet-night halos. Placement (and
 * rail clearance) lives in streetlights.ts. */
function Streetlights() {
  const { poles, heads, cones, poleMaterial, headMaterial, coneMaterial } = useMemo(() => {
    const count = STREETLIGHTS.length
    const boxGeometry = new THREE.BoxGeometry(1, 1, 1)
    const poleMaterial = new THREE.MeshBasicMaterial({ color: '#0b1220' })
    const headMaterial = new THREE.MeshBasicMaterial({ color: '#ffd9a0' })
    const poles = new THREE.InstancedMesh(boxGeometry, poleMaterial, count * 2)
    const heads = new THREE.InstancedMesh(boxGeometry, headMaterial, count)
    const matrix = new THREE.Matrix4()

    // One merged geometry of crossed gradient wedges — every lamp gets a
    // visible cone of light in the rain for a single extra draw call.
    const conePositions: number[] = []
    const coneUvs: number[] = []
    const coneIndex: number[] = []
    let vi = 0

    STREETLIGHTS.forEach((s, i) => {
      matrix.makeScale(0.16, LAMP_HEIGHT, 0.16)
      matrix.setPosition(s.x, LAMP_HEIGHT / 2, s.z)
      poles.setMatrixAt(i * 2, matrix)
      // Arm reaching back over the street.
      matrix.makeScale(LAMP_ARM, 0.1, 0.12)
      matrix.setPosition(s.x - (s.side * LAMP_ARM) / 2, LAMP_HEIGHT - 0.05, s.z)
      poles.setMatrixAt(i * 2 + 1, matrix)
      matrix.makeScale(0.6, 0.14, 0.26)
      matrix.setPosition(s.x - s.side * (LAMP_ARM - 0.25), LAMP_HEIGHT - 0.16, s.z)
      heads.setMatrixAt(i, matrix)

      const hx = s.x - s.side * (LAMP_ARM - 0.25)
      const topY = LAMP_HEIGHT - 0.22
      for (const [qx, qz] of [
        [1, 0],
        [0, 1],
      ] as const) {
        const wTop = 0.26
        const wBot = 1.7
        conePositions.push(
          hx - qx * wTop, topY, s.z - qz * wTop,
          hx + qx * wTop, topY, s.z + qz * wTop,
          hx + qx * wBot, 0.05, s.z + qz * wBot,
          hx - qx * wBot, 0.05, s.z - qz * wBot,
        )
        coneUvs.push(0, 1, 1, 1, 1, 0, 0, 0)
        coneIndex.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3)
        vi += 4
      }
    })
    poles.instanceMatrix.needsUpdate = true
    heads.instanceMatrix.needsUpdate = true

    const coneGeometry = new THREE.BufferGeometry()
    coneGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(conePositions), 3))
    coneGeometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(coneUvs), 2))
    coneGeometry.setIndex(coneIndex)
    const coneMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          float across = pow(max(0.0, 1.0 - abs(vUv.x - 0.5) * 2.0), 1.6);
          float along = mix(0.12, 1.0, vUv.y * vUv.y);
          gl_FragColor = vec4(vec3(1.0, 0.78, 0.5), across * along * 0.075);
        }
      `,
    })
    const cones = new THREE.Mesh(coneGeometry, coneMaterial)
    cones.frustumCulled = false
    cones.renderOrder = 4
    return { poles, heads, cones, poleMaterial, headMaterial, coneMaterial }
  }, [])

  useEffect(() => () => {
    poles.geometry.dispose()
    poleMaterial.dispose()
    headMaterial.dispose()
    cones.geometry.dispose()
    coneMaterial.dispose()
  }, [poles, poleMaterial, headMaterial, cones, coneMaterial])

  return (
    <group>
      <primitive object={poles} />
      <primitive object={heads} />
      <primitive object={cones} />
    </group>
  )
}

function Beacon({
  position,
  accent,
  size = 0.5,
}: {
  position: [number, number, number]
  accent: string
  size?: number
}) {
  const geometry = useMemo(() => new THREE.BoxGeometry(size, size, size), [size])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: accent }), [accent])
  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])
  return <mesh geometry={geometry} material={material} position={position} />
}

/** Soft additive pool of light on the street under a signature structure. */
function GlowPad({
  position,
  accent,
  radius = 7,
}: {
  position: [number, number, number]
  accent: string
  radius?: number
}) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float d = length(vUv - 0.5) * 2.0;
            float glow = pow(max(0.0, 1.0 - d), 2.2);
            gl_FragColor = vec4(uColor, glow * 0.32);
          }
        `,
        uniforms: { uColor: { value: new THREE.Color(accent) } },
      }),
    [accent],
  )
  const geometry = useMemo(() => new THREE.PlaneGeometry(radius * 2, radius * 2), [radius])
  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[position[0], 0.06, position[2]]}
      rotation-x={-Math.PI / 2}
      renderOrder={2}
    />
  )
}

/** Slowly rotating holographic ring; brightens and spins up when active. */
function HoloRing({
  position,
  accent,
  radius = 5.4,
  active = false,
}: {
  position: [number, number, number]
  accent: string
  radius?: number
  active?: boolean
}) {
  const ref = useRef<THREE.Mesh>(null)
  const geometry = useMemo(() => new THREE.TorusGeometry(radius, 0.07, 8, 64), [radius])
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [accent],
  )
  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])
  useFrame((state, delta) => {
    if (!ref.current) return
    ref.current.rotation.z += delta * (active ? 1.1 : 0.25)
    ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.7 + position[2]) * 0.4
    const targetOpacity = active ? 0.95 : 0.45
    material.opacity += (targetOpacity - material.opacity) * Math.min(1, delta * 6)
  })
  return (
    <mesh
      ref={ref}
      geometry={geometry}
      material={material}
      position={position}
      rotation-x={Math.PI / 2}
    />
  )
}

/** Scrolling news-ticker strip — canvas texture on repeat, offset by time. */
function TickerSign({
  text,
  position,
  width,
  height = 0.8,
  accent,
  rotationY = 0,
}: {
  text: string
  position: [number, number, number]
  width: number
  height?: number
  accent: string
  rotationY?: number
}) {
  const { texture, material, geometry } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 2048
    canvas.height = 118
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#03070d'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.font = '700 76px "JetBrains Mono", ui-monospace, monospace'
      ctx.textBaseline = 'middle'
      ctx.shadowColor = accent
      ctx.shadowBlur = 16
      ctx.fillStyle = accent
      ctx.fillText(text, 12, canvas.height / 2)
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = THREE.RepeatWrapping
    texture.anisotropy = 8
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
    const geometry = new THREE.PlaneGeometry(width, height)
    return { texture, material, geometry }
  }, [text, width, height, accent])

  useEffect(() => () => {
    texture.dispose()
    material.dispose()
    geometry.dispose()
  }, [texture, material, geometry])

  useFrame((_, delta) => {
    texture.offset.x += delta * 0.045
  })

  return (
    <mesh geometry={geometry} material={material} position={position} rotation-y={rotationY} renderOrder={5} />
  )
}

/** The threshold: a sign gantry spanning the street at the north end. */
function EntryGateway() {
  const g = ENTRY_GATE
  return (
    <group>
      {[-1, 1].map(side => (
        <NeonBox
          key={side}
          position={[side * g.pylonX, g.height / 2, g.z]}
          size={[0.7, g.height, 0.7]}
          accent="#00ffff"
          edgeOpacity={0.5}
        />
      ))}
      <NeonBox position={[0, g.height, g.z]} size={[g.pylonX * 2 + 2, 0.7, 1.1]} accent="#00ffff" edgeOpacity={0.7} />
      <NeonBox position={[0, g.height - 1.6, g.z]} size={[g.pylonX * 2 - 1, 0.4, 0.7]} accent="#00ffff" edgeOpacity={0.45} />
      <Sign
        spec={{
          accent: '#00ffff',
          width: 760,
          lines: [{ text: 'THE GRID', size: 110 }],
        }}
        position={[0, g.height + 1.9, g.z + 0.4]}
        height={1.9}
      />
      <TickerSign
        text="··· WELCOME TO THE GRID ··· SCROLL TO TRAVEL · 6 STOPS ··· CLICK THE GANTRIES AND MARQUEES ··· JESSE CHEN // CMU SCS "
        position={[0, g.height - 2.6, g.z + 0.36]}
        width={g.pylonX * 2 - 2}
        height={0.72}
        accent="#00ffff"
      />
      <GlowPad position={[-g.pylonX, 0, g.z]} accent="#00ffff" radius={5} />
      <GlowPad position={[g.pylonX, 0, g.z]} accent="#00ffff" radius={5} />
    </group>
  )
}

/** Vertical billboard tower terminating the arrival vista — the identity
 * screen rides high on its street face, stacked ads beneath. */
function BillboardTower() {
  const { tower, screen } = JUMBOTRON
  const identity = useMemo(
    () =>
      makeSignTexture({
        width: 280,
        accent: '#00ffff',
        background: '#03080f',
        lines: [
          { text: '> JESSE', size: 64 },
          { text: 'CHEN', size: 64 },
          { text: 'CARNEGIE MELLON', size: 30, color: '#7efcff' },
          { text: '// SCS', size: 30, color: '#7efcff' },
        ],
      }),
    [],
  )
  useEffect(() => () => identity.texture.dispose(), [identity])
  const frontZ = tower.z + tower.depth / 2 + 0.08

  return (
    <group>
      <NeonBox
        position={[tower.x, tower.height / 2, tower.z]}
        size={[tower.width, tower.height, tower.depth]}
        accent="#00ffff"
        lit
        windowDensity={0.3}
        seed={3}
      />
      {/* Fully resolved from the home station — the identity screen must be
          readable the moment the visitor arrives. */}
      <Billboard
        position={[screen.x, screen.y, frontZ]}
        width={screen.width}
        height={screen.height}
        accent="#00ffff"
        image={identity.texture}
        focusDistance={85}
      />
      <Sign
        spec={{
          accent: '#ff2d78',
          width: 512,
          background: 'rgba(6, 4, 10, 0.9)',
          lines: [{ text: '電脳都市', size: 82, color: '#ff9ec4' }],
        }}
        position={[screen.x, 17.5, frontZ]}
        height={2.6}
      />
      <Sign
        spec={{
          accent: '#ffcc00',
          width: 512,
          background: 'rgba(8, 6, 3, 0.9)',
          lines: [{ text: '未来へ接続中', size: 62, color: '#ffe9b0' }],
        }}
        position={[screen.x, 13.8, frontZ]}
        height={1.9}
      />
      <TickerSign
        text="··· JESSE CHEN // CMU SCS ··· BUILDING TECHNOLOGY THAT SOLVES REAL PROBLEMS ··· "
        position={[screen.x, 10.4, frontZ]}
        width={tower.width - 1.4}
        height={0.7}
        accent="#00ffff"
      />
      <Beacon position={[tower.x, tower.height + 1, tower.z]} accent="#00ffff" />
      <GlowPad position={[tower.x + 4, 0, tower.z + 6]} accent="#00ffff" radius={9} />
    </group>
  )
}

/** The tram on the monorail above the centerline. While the visitor dwells
 * at Journey it becomes the selection cursor, gliding to the picked stop. */
function Tram({ interaction }: { interaction: GridInteraction }) {
  const ref = useRef<THREE.Group>(null)
  const parkZ = useRef(gantryZ(2))
  const stops = content.experiences.length
  const zStart = gantryZ(0) + 9
  const zEnd = gantryZ(stops - 1) - 9
  const bodyGeometry = useMemo(() => new THREE.BoxGeometry(1.5, 0.7, 3.2), [])
  const bodyMaterial = useMemo(() => makePanelMaterial('#ffb347', [1.5, 0.7, 3.2], 9, 1), [])
  const edges = useMemo(() => new THREE.EdgesGeometry(bodyGeometry), [bodyGeometry])
  const edgeMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color: '#ffd9a0', transparent: true, opacity: 0.9 }),
    [],
  )
  useEffect(() => () => {
    bodyGeometry.dispose()
    bodyMaterial.dispose()
    edges.dispose()
    edgeMaterial.dispose()
  }, [bodyGeometry, bodyMaterial, edges, edgeMaterial])

  useFrame((state, delta) => {
    if (!ref.current) return
    // Ease-paused traversal: a full run each ~26s, slowing into each stop.
    const cycle = (state.clock.elapsedTime % 26) / 26
    const swing = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2
    const staged = (Math.sin((swing * stops - 0.5) * Math.PI / stops * 2) * 0.06) + swing
    const loopZ = zStart + (zEnd - zStart) * THREE.MathUtils.clamp(staged, 0, 1)
    // Parked at the selected stop while the rail rests at Journey, gliding —
    // not teleporting — between picks.
    const targetPark = gantryZ(interaction.selection.role ?? 2)
    parkZ.current += (targetPark - parkZ.current) * Math.min(1, delta * 2.2)
    const atJourney = 1 - Math.min(1, Math.abs(interaction.progressRef.current - stationT(1)) / 0.08)
    const z = THREE.MathUtils.lerp(loopZ, parkZ.current, THREE.MathUtils.smoothstep(atJourney, 0.4, 1))
    ref.current.position.set(0, GANTRY.railY + 0.65, z)
  })

  return (
    <group ref={ref}>
      <mesh geometry={bodyGeometry} material={bodyMaterial} />
      <lineSegments geometry={edges} material={edgeMaterial} />
    </group>
  )
}

function CatenaryCable() {
  const { line, material } = useMemo(() => {
    const stops = content.experiences.length
    const points: THREE.Vector3[] = []
    for (let i = 0; i < stops - 1; i++) {
      const a = new THREE.Vector3(0, GANTRY.railY + 1.5, gantryZ(i))
      const b = new THREE.Vector3(0, GANTRY.railY + 1.5, gantryZ(i + 1))
      const mid = a.clone().lerp(b, 0.5)
      mid.y -= 0.55 // sag
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b)
      points.push(...curve.getPoints(14))
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.4 })
    const line = new THREE.Line(geometry, material)
    line.frustumCulled = false
    return { line, material }
  }, [])
  useEffect(() => () => {
    line.geometry.dispose()
    material.dispose()
  }, [line, material])
  return <primitive object={line} />
}

/** Role gantries: one overhead sign bridge per experience — the visitor
 * rides down the middle of their own career timeline, every company
 * readable head-on as its bridge approaches. */
function RoleGantries({ interaction }: { interaction: GridInteraction }) {
  const stops = content.experiences
  const { onTooltip, onSelectRole, selection } = interaction
  const [hoveredStop, setHoveredStop] = useState<number | null>(null)
  const beamZ = (gantryZ(0) + gantryZ(stops.length - 1)) / 2
  const beamLength = Math.abs(GANTRY.zStep) * (stops.length - 1) + 18

  return (
    <group>
      {/* Monorail beam on the centerline, high above the traffic. */}
      <NeonBox
        position={[0, GANTRY.railY, beamZ]}
        size={[0.9, 0.5, beamLength]}
        accent="#ffb347"
        edgeOpacity={0.4}
      />
      <CatenaryCable />
      {stops.map((exp, i) => {
        const z = gantryZ(i)
        const selected = selection.role === i
        const showTooltip = (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          setHoveredStop(i)
          onTooltip?.({
            x: e.nativeEvent.clientX,
            y: e.nativeEvent.clientY,
            text: `${exp.company} · ${exp.role} — click to inspect`,
            color: exp.accent,
          })
        }
        return (
          <group
            key={exp.id}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              onSelectRole(selected ? null : i)
            }}
            onPointerOver={showTooltip}
            onPointerMove={showTooltip}
            onPointerOut={() => {
              setHoveredStop(current => (current === i ? null : current))
              onTooltip?.(null)
            }}
          >
            {/* Pylons on both sidewalks carrying the sign bridge. */}
            {[-1, 1].map(side => (
              <NeonBox
                key={side}
                position={[side * GANTRY.pylonX, GANTRY.deckY / 2, z]}
                size={[0.7, GANTRY.deckY, 0.7]}
                accent={exp.accent}
                edgeOpacity={0.3}
              />
            ))}
            <NeonBox
              position={[0, GANTRY.deckY + 0.3, z]}
              size={[GANTRY.pylonX * 2 + 1.8, 0.6, 2.4]}
              accent={exp.accent}
              edgeOpacity={0.5}
            />
            {/* Underdeck light bar — the warm splash on the road below. */}
            <mesh position={[0, GANTRY.deckY - 0.03, z + 1.0]}>
              <boxGeometry args={[GANTRY.pylonX * 2 - 1.5, 0.09, 0.32]} />
              <meshBasicMaterial color={exp.accent} />
            </mesh>
            {/* The station sign: company · role · period, facing up-street. */}
            <Sign
              spec={{
                accent: exp.accent,
                width: 880,
                background: 'rgba(3, 8, 15, 0.55)',
                lines: [
                  { text: exp.company.toUpperCase(), size: 72 },
                  { text: exp.role, size: 38, color: '#cfe3f0' },
                  { text: exp.period, size: 28, color: '#8fa7ba' },
                ],
              }}
              position={[0, GANTRY.deckY + 2.5, z + 1.28]}
              height={3.1}
            />
            {/* Strut up to the monorail. */}
            <NeonBox
              position={[0, GANTRY.deckY + 0.6 + (GANTRY.railY - GANTRY.deckY - 0.85) / 2, z]}
              size={[0.3, GANTRY.railY - GANTRY.deckY - 0.85, 0.3]}
              accent={exp.accent}
              edgeOpacity={0.3}
            />
            {/* Sidewalk kiosk at the stop — street furniture with a pulse. */}
            <NeonBox
              position={[10.9, 1.3, z + 2.4]}
              size={[1.6, 2.6, 1.4]}
              accent={exp.accent}
              lit
              windowDensity={1}
              seed={7 + i}
            />
            <Beacon position={[0, GANTRY.deckY + 0.85, z]} accent={exp.accent} size={0.3} />
            {(selected || hoveredStop === i) && (
              <HoloRing
                position={[0, GANTRY.deckY + 0.9, z]}
                accent={exp.accent}
                radius={3}
                active={selected}
              />
            )}
            {/* The selected stop unfolds its full record as a street-side
                hologram, angled at the focus camera. */}
            {selected && (
              <Sign
                spec={{
                  accent: exp.accent,
                  width: 760,
                  background: 'rgba(3, 9, 16, 0.78)',
                  lines: [
                    { text: exp.role.toUpperCase(), size: 42 },
                    { text: `${exp.period} · ${exp.location} · ${exp.status}`, size: 27, color: '#9fb6c9' },
                    ...wrapText(exp.summary, 42).map(line => ({
                      text: line,
                      size: 26,
                      color: '#cfe3f0',
                    })),
                    { text: exp.stack.join(' · '), size: 24, color: exp.accent },
                  ],
                }}
                position={[3.2, 6.5, z + 4.2]}
                rotationY={-0.42}
                height={3.1}
              />
            )}
            <GlowPad position={[0, 0, z]} accent={exp.accent} radius={6} />
          </group>
        )
      })}
      <Tram interaction={interaction} />
    </group>
  )
}

/** Wall marquees: each project is a giant screen hinged off the street wall,
 * angled up-street so it reads on approach — theater fronts for software. */
function ProjectMarquees({ interaction }: { interaction: GridInteraction }) {
  const { onTooltip, onSelectProject, selection } = interaction
  const [hovered, setHovered] = useState<number | null>(null)
  const terminalCards = useMemo(
    () =>
      new Map(
        PROJECT_SITES.filter(site => !site.image).map(site => [
          site.project.id,
          makeTerminalTexture(
            site.project.name,
            ['$ git clone ' + site.project.id, '$ npm run build', '> deploy: live'],
            site.project.accent,
          ),
        ]),
      ),
    [],
  )
  useEffect(
    () => () => {
      for (const card of terminalCards.values()) card.texture.dispose()
    },
    [terminalCards],
  )

  return (
    <group>
      {PROJECT_SITES.map((site, i) => {
        const { project } = site
        const selected = selection.project === i
        const center = marqueeCenter(site)
        const showTooltip = (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          setHovered(i)
          onTooltip?.({
            x: e.nativeEvent.clientX,
            y: e.nativeEvent.clientY,
            text: `${project.name} — ${selected ? 'selected' : 'click to inspect'}`,
            color: project.accent,
          })
        }
        return (
          <group
            key={project.id}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              onSelectProject(i)
            }}
            onPointerOver={showTooltip}
            onPointerMove={showTooltip}
            onPointerOut={() => {
              setHovered(current => (current === i ? null : current))
              onTooltip?.(null)
            }}
          >
            {/* Mounting column on the wall face. */}
            <NeonBox
              position={[site.side * 12.3, site.screenY, site.z]}
              size={[0.6, 10, 0.6]}
              accent={project.accent}
              edgeOpacity={0.35}
            />
            {/* The marquee assembly, hinged off the wall. */}
            <group position={[center.x, site.screenY, center.z]} rotation-y={center.rotationY}>
              <Billboard
                position={[0, 0, 0]}
                width={MARQUEE.width}
                height={MARQUEE.height}
                accent={project.accent}
                image={site.image ?? terminalCards.get(project.id)?.texture ?? null}
                focusDistance={30}
                cycleImages={project.images?.map(image => image.src)}
                cycleActive={selected}
                active={selected}
                onClick={e => {
                  e.stopPropagation()
                  onSelectProject(i)
                  window.open(`/projects/${project.id}/`, '_blank', 'noopener')
                }}
                onPointerOver={e => {
                  e.stopPropagation()
                  onTooltip?.({
                    x: e.nativeEvent.clientX,
                    y: e.nativeEvent.clientY,
                    text: `${project.name} — open case study ↗`,
                    color: project.accent,
                  })
                }}
                onPointerMove={e => {
                  e.stopPropagation()
                  onTooltip?.({
                    x: e.nativeEvent.clientX,
                    y: e.nativeEvent.clientY,
                    text: `${project.name} — open case study ↗`,
                    color: project.accent,
                  })
                }}
                onPointerOut={() => onTooltip?.(null)}
              />
              {/* Name marquee riding the screen top. */}
              <Sign
                spec={{
                  accent: project.accent,
                  width: 900,
                  lines: [
                    { text: project.name.toUpperCase(), size: 96, color: '#eaffff' },
                    { text: project.tag, size: 34, color: '#9fb6c9' },
                  ],
                }}
                position={[0, 4.35, 0.05]}
                height={2.9}
              />
              {/* Stat cards under the screen. */}
              {project.stats.slice(0, 3).map((stat, statIndex) => (
                <Sign
                  key={stat.label}
                  spec={{
                    accent: project.accent,
                    width: 400,
                    background: 'rgba(3, 9, 16, 0.72)',
                    lines: [
                      { text: stat.value, size: 56 },
                      { text: stat.label, size: 26, color: '#9fb6c9' },
                    ],
                  }}
                  position={[(statIndex - 1) * 3.3, -4.35, 0.05]}
                  height={1.55}
                />
              ))}
              <TickerSign
                text={`··· ${project.tech.join(' · ')} ··· ${project.lead} `}
                position={[0, -5.65, 0.05]}
                width={MARQUEE.width}
                height={0.62}
                accent={project.accent}
              />
              {(selected || hovered === i) && (
                <HoloRing position={[0, 5.9, 0]} accent={project.accent} radius={2.6} active={selected} />
              )}
            </group>
            {/* Street inlay: the project number and name painted on the road. */}
            <FloorSign
              spec={{
                accent: project.accent,
                width: 1024,
                lines: [{ text: `0${i + 1} // ${project.name.toUpperCase()}`, size: 96 }],
              }}
              position={[site.side * 4.6, 0.09, site.z + 2]}
              height={2.1}
            />
            <GlowPad position={[site.side * 8.2, 0, site.z - 4]} accent={project.accent} radius={8} />
          </group>
        )
      })}
    </group>
  )
}

function BeyondShops() {
  return (
    <group>
      {BEYOND_SHOPS.map(({ item, x, z }, i) => (
        <group key={item.id}>
          <NeonBox
            position={[x, 3.5, z]}
            size={[6, 7, 6]}
            accent={item.accent}
            lit
            windowDensity={0.9}
            seed={23 + i}
          />
          {/* Storefront kit: angled awning, inset doorway with warm glow,
              display window — so these read as shops, not containers. */}
          <mesh position={[x + 3.35, 4.6, z]} rotation-z={-0.35}>
            <boxGeometry args={[1.1, 0.08, 5.4]} />
            <meshBasicMaterial color={item.accent} />
          </mesh>
          <mesh position={[x + 3.02, 1.4, z - 1.5]} rotation-y={Math.PI / 2}>
            <planeGeometry args={[1.2, 2.8]} />
            <meshBasicMaterial color="#ffd9a0" transparent opacity={0.85} />
          </mesh>
          <mesh position={[x + 3.02, 2.2, z + 1.2]} rotation-y={Math.PI / 2}>
            <planeGeometry args={[2.4, 1.6]} />
            <meshBasicMaterial color={item.accent} transparent opacity={0.5} />
          </mesh>
          {/* Sign mounted on the facade above the door, angled up-street with
              the headline stat — the shop tells its story from the kerb. */}
          <Sign
            spec={{
              accent: item.accent,
              width: 680,
              lines: [
                { text: item.title.toUpperCase(), size: 50 },
                { text: item.subtitle, size: 30, color: '#9fb6c9' },
                {
                  text: item.stats.map(s => `${s.value} ${s.label.toLowerCase()}`).join(' · '),
                  size: 26,
                  color: '#cfe3f0',
                },
              ],
            }}
            position={[x + 2.6, 9.9, z + 3.1]}
            rotationY={0.42}
            height={2.3}
          />
          <GlowPad position={[x + 3, 0, z]} accent={item.accent} radius={6} />
          {/* Paper-lantern string sagging across the storefront. */}
          {[0, 1, 2, 3, 4].map(j => {
            const t = j / 4
            const sag = Math.sin(t * Math.PI) * 0.7
            return (
              <mesh key={j} position={[x + 3.35, 6.6 - sag, z - 2.4 + t * 4.8]}>
                <sphereGeometry args={[0.16, 8, 8]} />
                <meshBasicMaterial color={j % 2 === 0 ? '#ffb36b' : item.accent} />
              </mesh>
            )
          })}
        </group>
      ))}
    </group>
  )
}

function RelayTower() {
  const t = RELAY_TOWER
  return (
    <group>
      <NeonBox
        position={[t.x, t.height / 2, t.z]}
        size={[t.width, t.height, t.width]}
        accent="#ffcc00"
        edgeOpacity={0.5}
        lit
        windowDensity={0.4}
        seed={31}
        dimStation={4}
      />
      {content.toolkit.map((group, i) => {
        const y = t.bandStartY + i * t.bandStepY
        return (
          <group key={group.id}>
            {/* Glowing band wrapping the tower at this group's floor. */}
            <NeonBox
              position={[t.x, y, t.z]}
              size={[t.width + 0.6, 0.35, t.width + 0.6]}
              accent={group.accent}
              dimStation={4}
            />
            <Sign
              spec={{
                accent: group.accent,
                width: 640,
                lines: [{ text: group.name.toUpperCase(), size: 64 }],
              }}
              position={[t.x, y + 1.6, t.z + t.width / 2 + 1.1]}
              height={2}
              dimStation={4}
            />
          </group>
        )
      })}
      <Beacon position={[t.x, t.height + 1, t.z]} accent="#ffcc00" size={0.6} />
      <GlowPad position={[t.x, 0, t.z]} accent="#ffcc00" radius={9} />
    </group>
  )
}

function SkyDeck({ interaction }: { interaction: GridInteraction }) {
  const d = SKY_DECK
  const { onTooltip, onPlaceStar } = interaction
  const posts = useMemo(() => {
    const list: Array<[number, number, number]> = []
    const half = d.size / 2 - 0.4
    for (let i = -1; i <= 1; i++) {
      list.push([d.x + i * half, d.y + 0.8, d.z - half])
      if (i !== 0) {
        list.push([d.x + i * half, d.y + 0.8, d.z])
        list.push([d.x + i * half, d.y + 0.8, d.z + half])
      }
    }
    return list
  }, [d])

  const contacts = [
    { id: 'email', label: 'EMAIL', href: `mailto:${content.profile.email}`, x: -6 },
    { id: 'github', label: 'GITHUB', href: content.profile.github, x: 0 },
    { id: 'linkedin', label: 'LINKEDIN', href: content.profile.linkedin, x: 6 },
  ]

  return (
    <group>
      {/* Slender mast — the deck should read as an observation perch, not a
          monolith parked in the avenue. */}
      <NeonBox position={[d.x, d.y / 2, d.z]} size={[1.1, d.y, 1.1]} accent="#7efcff" edgeOpacity={0.35} />
      <NeonBox position={[d.x, d.y, d.z]} size={[d.size, 0.5, d.size]} accent="#7efcff" />
      <TickerSign
        text="··· NOW ARRIVING // 05 SKY — THE CONSTELLATION ··· LOOK UP · HOVER A STAR · DRAG YOURS ··· THE GRID // JESSE CHEN "
        position={[d.x, d.y - 0.65, d.z + d.size / 2 + 0.05]}
        width={d.size}
        height={0.7}
        accent="#7efcff"
      />
      <HoloRing position={[d.x, d.y - 3.2, d.z]} accent="#7efcff" radius={4} />
      {posts.map((p, i) => (
        <NeonBox key={i} position={p} size={[0.12, 1.4, 0.12]} accent="#7efcff" edgeOpacity={0.5} />
      ))}
      {/* The send-off, in the world: place your star, or reach out. */}
      <Sign
        spec={{
          accent: '#7efcff',
          width: 720,
          background: 'rgba(3, 10, 18, 0.78)',
          lines: [{ text: '✦ PLACE YOUR STAR', size: 64 }],
        }}
        position={[d.x, d.y + 12.5, d.z - 18]}
        height={1.9}
        onClick={e => {
          e.stopPropagation()
          onPlaceStar?.()
        }}
        onPointerOver={e => {
          e.stopPropagation()
          onTooltip?.({
            x: e.nativeEvent.clientX,
            y: e.nativeEvent.clientY,
            text: 'leave the Grid and sign the constellation',
            color: '#7efcff',
          })
        }}
        onPointerOut={() => onTooltip?.(null)}
      />
      {contacts.map(contact => (
        <Sign
          key={contact.id}
          spec={{
            accent: '#7efcff',
            width: 440,
            background: 'rgba(3, 10, 18, 0.65)',
            lines: [{ text: contact.label, size: 44, color: '#eaffff' }],
          }}
          position={[d.x + contact.x, d.y + 9, d.z - 18]}
          height={1.15}
          onClick={e => {
            e.stopPropagation()
            if (contact.href.startsWith('mailto:')) window.location.href = contact.href
            else window.open(contact.href, '_blank', 'noopener')
          }}
          onPointerOver={e => {
            e.stopPropagation()
            onTooltip?.({
              x: e.nativeEvent.clientX,
              y: e.nativeEvent.clientY,
              text: `${contact.label.toLowerCase()} ↗`,
              color: '#7efcff',
            })
          }}
          onPointerOut={() => onTooltip?.(null)}
        />
      ))}
      <GlowPad position={[d.x, 0, d.z]} accent="#7efcff" radius={6} />
    </group>
  )
}

export default function Structures({ interaction }: { interaction: GridInteraction }) {
  return (
    <group>
      <EntryGateway />
      <BillboardTower />
      <Streetlights />
      <RoleGantries interaction={interaction} />
      <ProjectMarquees interaction={interaction} />
      <BeyondShops />
      <RelayTower />
      <SkyDeck interaction={interaction} />
    </group>
  )
}
