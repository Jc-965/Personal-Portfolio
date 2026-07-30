import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import Billboard from './Billboards'
import { makeSignTexture, makeTerminalTexture, type SignSpec } from './signTexture'
import { makePanelMaterial } from './panelMaterial'
import { SCENE_BG, SCENE_PROGRESS } from './sceneColor'
import type { GridInteraction } from './interaction'
import {
  content,
  stationT,
  JUMBOTRON,
  TRANSIT,
  transitStopZ,
  PROJECT_SITES,
  BEYOND_SHOPS,
  RELAY_TOWER,
  SKY_DECK,
  PLAZA_GATES,
} from '../gridConfig'

/**
 * Signature structures, one cluster per district. Generic skyline towers are
 * instanced in Towers.tsx; everything here is bespoke: panel-lit facades,
 * neon edge lines (bloom does the glowing), canvas signage, CRT billboards,
 * kinetic set pieces (tram, holo rings) — and the interactive pieces: project
 * towers and transit stops are click targets synced with the HUD.
 */

const darkBodyVertex = /* glsl */ `
  varying float vViewDist;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const darkBodyFragment = /* glsl */ `
  uniform vec3 uBg;
  uniform vec3 uTint;
  varying float vViewDist;
  void main() {
    vec3 color = vec3(0.02, 0.032, 0.062) + uTint * 0.05;
    color = mix(color, uBg, smoothstep(70.0, 210.0, vViewDist));
    // Near dissolve: a pylon grazing the lens must melt away, not blot the frame.
    color = mix(uBg, color, smoothstep(2.0, 9.0, vViewDist));
    gl_FragColor = vec4(color, 1.0);
  }
`

function makeDarkBodyMaterial(accent: string) {
  return new THREE.ShaderMaterial({
    vertexShader: darkBodyVertex,
    fragmentShader: darkBodyFragment,
    uniforms: {
      uBg: { value: SCENE_BG },
      uTint: { value: new THREE.Color(accent) },
    },
  })
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
      : makeDarkBodyMaterial(accent)
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
    bodyMaterial.dispose()
    lineMaterial.dispose()
  }, [geometry, edges, bodyMaterial, lineMaterial])

  const positionKey = position.join(',')
  const worldPos = useMemo(() => new THREE.Vector3(...position), [positionKey])
  useFrame(state => {
    if (lit && bodyMaterial instanceof THREE.ShaderMaterial) {
      bodyMaterial.uniforms.uTime.value = state.clock.elapsedTime
    }
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
}: {
  spec: SignSpec
  position: [number, number, number]
  rotationY?: number
  height: number
  dimStation?: number
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

  const worldPos = useMemo(() => new THREE.Vector3(...position), [position])
  useFrame(state => {
    // Signs are unlit sprites that ignore fog — fade them by distance so a
    // district's signage never photobombs another station's frame.
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
      geometry={geometry}
      material={material}
      position={position}
      rotation-y={rotationY}
      renderOrder={5}
    />
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

function Jumbotron() {
  const { tower, screen } = JUMBOTRON
  const identity = useMemo(
    () =>
      makeSignTexture({
        width: 1024,
        accent: '#00ffff',
        background: '#03080f',
        // Two lines only — the headline lives in the HUD; squeezing it onto
        // the sign made all three lines illegible.
        lines: [
          { text: '> JESSE CHEN', size: 118 },
          { text: 'CARNEGIE MELLON // SCS', size: 52, color: '#7efcff' },
        ],
      }),
    [],
  )
  useEffect(() => () => identity.texture.dispose(), [identity])

  return (
    <group>
      {/* Dark, sparsely lit body — the screen is the star; the tower is its plinth. */}
      <NeonBox
        position={[tower.x, tower.height / 2, tower.z]}
        size={[tower.width, tower.height, tower.depth]}
        accent="#00ffff"
        lit
        windowDensity={0.35}
        seed={3}
      />
      {/* Fully resolved from the home station (~67 units out) — the identity
          screen must be readable the moment the visitor arrives. */}
      <Billboard
        position={[screen.x, screen.y, screen.z]}
        width={screen.width}
        height={screen.height}
        accent="#00ffff"
        image={identity.texture}
        focusDistance={68}
      />
      <Beacon position={[tower.x, tower.height + 1, tower.z]} accent="#00ffff" />
      <TickerSign
        text="··· WELCOME TO THE GRID ··· SCROLL TO TRAVEL · 6 STATIONS · CLICK TOWERS AND TRANSIT STOPS ··· JESSE CHEN // CMU SCS "
        position={[tower.x, 2.4, tower.z + JUMBOTRON.tower.depth / 2 + 0.06]}
        width={JUMBOTRON.tower.width - 1}
        height={0.75}
        accent="#00ffff"
      />
      <GlowPad position={[tower.x, 0, tower.z + 4]} accent="#00ffff" radius={10} />
    </group>
  )
}

/** Neon gateway arches over the plaza — the threshold into the Grid. */
function PlazaGates() {
  return (
    <group>
      {PLAZA_GATES.map(gate => (
        <group key={gate.z}>
          <NeonBox
            position={[-gate.halfWidth, gate.height / 2, gate.z]}
            size={[0.5, gate.height, 0.5]}
            accent="#00ffff"
            edgeOpacity={0.55}
          />
          <NeonBox
            position={[gate.halfWidth, gate.height / 2, gate.z]}
            size={[0.5, gate.height, 0.5]}
            accent="#00ffff"
            edgeOpacity={0.55}
          />
          <NeonBox
            position={[0, gate.height, gate.z]}
            size={[gate.halfWidth * 2 + 0.5, 0.5, 0.5]}
            accent="#00ffff"
            edgeOpacity={0.75}
          />
        </group>
      ))}
    </group>
  )
}

/** A light-tram gliding the elevated line, parking mid-line while the
 * visitor dwells at the journey station so it's always in the rest frame. */
function Tram({ interaction }: { interaction: GridInteraction }) {
  const ref = useRef<THREE.Group>(null)
  const stops = content.experiences.length
  const zStart = transitStopZ(0)
  const zEnd = transitStopZ(stops - 1)
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

  useFrame(state => {
    bodyMaterial.uniforms.uTime.value = state.clock.elapsedTime
    if (!ref.current) return
    // Ease-paused traversal: a full run each ~26s, slowing into each stop.
    const cycle = (state.clock.elapsedTime % 26) / 26
    const swing = cycle < 0.5 ? cycle * 2 : (1 - cycle) * 2
    const staged = (Math.sin((swing * stops - 0.5) * Math.PI / stops * 2) * 0.06) + swing
    const loopZ = zStart + (zEnd - zStart) * THREE.MathUtils.clamp(staged, 0, 1)
    // Ease into the mid-line stop while the rail rests at Journey.
    const atJourney = 1 - Math.min(1, Math.abs(interaction.progressRef.current - stationT(1)) / 0.08)
    const z = THREE.MathUtils.lerp(loopZ, transitStopZ(2), THREE.MathUtils.smoothstep(atJourney, 0.4, 1))
    ref.current.position.set(TRANSIT.x, TRANSIT.beamY + 0.85, z)
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
      const a = new THREE.Vector3(TRANSIT.x, TRANSIT.beamY + 1.9, transitStopZ(i))
      const b = new THREE.Vector3(TRANSIT.x, TRANSIT.beamY + 1.9, transitStopZ(i + 1))
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

function TransitLine({ interaction }: { interaction: GridInteraction }) {
  const stops = content.experiences
  const beamLength = Math.abs(TRANSIT.zStep) * (stops.length - 1) + 8
  const beamZ = (transitStopZ(0) + transitStopZ(stops.length - 1)) / 2
  const { onTooltip, onSelectRole, selection } = interaction

  return (
    <group>
      <CatenaryCable />
      <NeonBox
        position={[TRANSIT.x, TRANSIT.beamY, beamZ]}
        size={[1.2, 0.5, beamLength]}
        accent="#ffb347"
        edgeOpacity={0.6}
      />
      {stops.map((exp, i) => {
        const z = transitStopZ(i)
        const selected = selection.role === i
        const showTooltip = (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
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
            onPointerOut={() => onTooltip?.(null)}
          >
            <NeonBox
              position={[TRANSIT.x, TRANSIT.beamY - 0.7, z]}
              size={[3, 0.4, 3.4]}
              accent={exp.accent}
            />
            {/* Pylon to the street. */}
            <NeonBox
              position={[TRANSIT.x, (TRANSIT.beamY - 0.9) / 2, z]}
              size={[0.5, TRANSIT.beamY - 0.9, 0.5]}
              accent={exp.accent}
              edgeOpacity={0.35}
            />
            <Sign
              spec={{
                accent: exp.accent,
                width: 640,
                lines: [
                  { text: exp.company.toUpperCase(), size: 58 },
                  { text: exp.role, size: 32, color: '#9fb6c9' },
                ],
              }}
              position={[TRANSIT.x + 0.2, TRANSIT.beamY + 2.3, z]}
              rotationY={Math.PI / 2}
              height={2.2}
            />
            {/* Platform canopy, catenary post, and hanging lightbox make
                stops read as transit stations, not furniture. */}
            <NeonBox
              position={[TRANSIT.x, TRANSIT.beamY + 1.3, z]}
              size={[3.4, 0.14, 3.8]}
              accent={exp.accent}
              edgeOpacity={0.5}
            />
            <NeonBox
              position={[TRANSIT.x, TRANSIT.beamY + 1.65, z]}
              size={[0.14, 0.6, 0.14]}
              accent={exp.accent}
              edgeOpacity={0.4}
            />
            <mesh position={[TRANSIT.x, TRANSIT.beamY + 0.95, z + 1.9]}>
              <planeGeometry args={[1.7, 0.5]} />
              <meshBasicMaterial color={exp.accent} transparent opacity={0.8} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[TRANSIT.x - 1.5, TRANSIT.beamY - 0.48, z]}>
              <boxGeometry args={[0.1, 0.1, 3.4]} />
              <meshBasicMaterial color={exp.accent} />
            </mesh>
            <Beacon position={[TRANSIT.x, TRANSIT.beamY + 0.6, z]} accent={exp.accent} size={0.35} />
            {selected && (
              <HoloRing
                position={[TRANSIT.x, TRANSIT.beamY + 1.2, z]}
                accent={exp.accent}
                radius={2.4}
                active
              />
            )}
          </group>
        )
      })}
      <Tram interaction={interaction} />
    </group>
  )
}

function ProjectTowers({ interaction }: { interaction: GridInteraction }) {
  const { onTooltip, onSelectProject, selection } = interaction
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
        const screenY = site.height * 0.45
        const selected = selection.project === i
        const showTooltip = (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
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
            onPointerOut={() => onTooltip?.(null)}
          >
            <NeonBox
              position={[site.x, site.height / 2, site.z]}
              size={[8, site.height, 8]}
              accent={project.accent}
              lit
              windowDensity={0.7}
              seed={11 + i}
            />
            {/* Wordmark riding above the roofline. */}
            <Sign
              spec={{
                accent: project.accent,
                width: 768,
                lines: [{ text: project.name.toUpperCase(), size: 110, color: '#eaffff' }],
              }}
              position={[site.x - 4.3, site.height + 2.4, site.z]}
              rotationY={-Math.PI / 2}
              height={2.6}
            />
            <Billboard
              position={[site.x - 4.15, screenY, site.z]}
              rotationY={-Math.PI / 2}
              width={10}
              height={6.25}
              accent={project.accent}
              image={site.image ?? terminalCards.get(project.id)?.texture ?? null}
              cycleImages={project.images?.map(image => image.src)}
              cycleActive={selected}
            />
            <HoloRing
              position={[site.x, site.height + 5.5, site.z]}
              accent={project.accent}
              active={selected}
            />
            {selected && (
              <HoloRing
                position={[site.x, 2.2, site.z]}
                accent={project.accent}
                radius={6.8}
                active
              />
            )}
            <Beacon position={[site.x, site.height + 0.8, site.z]} accent={project.accent} size={0.4} />
            <GlowPad position={[site.x - 4, 0, site.z]} accent={project.accent} radius={8} />
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
          {/* Sign mounted on the facade above the door, angled to the
              approaching camera so the three never stack in projection. */}
          <Sign
            spec={{
              accent: item.accent,
              width: 640,
              lines: [
                { text: item.title.toUpperCase(), size: 50 },
                { text: item.subtitle, size: 30, color: '#9fb6c9' },
              ],
            }}
            position={[x + 2.6, 9.8, z + 3.1]}
            rotationY={0.42}
            height={1.9}
          />
          <GlowPad position={[x + 3, 0, z]} accent={item.accent} radius={6} />
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
                // Name only: sublabels were illegible at rest distance, and
                // the HUD already counts the tools.
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

function SkyDeck() {
  const d = SKY_DECK
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
      <GlowPad position={[d.x, 0, d.z]} accent="#7efcff" radius={6} />
    </group>
  )
}

export default function Structures({ interaction }: { interaction: GridInteraction }) {
  return (
    <group>
      <Jumbotron />
      <PlazaGates />
      <TransitLine interaction={interaction} />
      <ProjectTowers interaction={interaction} />
      <BeyondShops />
      <RelayTower />
      <SkyDeck />
    </group>
  )
}
