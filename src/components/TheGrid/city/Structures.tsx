import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import Billboard from './Billboards'
import { makeSignTexture, makeTerminalTexture, type SignSpec } from './signTexture'
import { makePanelMaterial } from './panelMaterial'
import type { GridInteraction } from './interaction'
import {
  content,
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

const BODY_COLOR = '#050a12'

function NeonBox({
  position,
  size,
  accent,
  edgeOpacity = 0.9,
  lit = false,
  windowDensity = 0.8,
  seed = 1,
}: {
  position: [number, number, number]
  size: [number, number, number]
  accent: string
  edgeOpacity?: number
  /** Panel-lit facade instead of a flat dark body. */
  lit?: boolean
  windowDensity?: number
  seed?: number
}) {
  // Keyed on contents, not array identity — selection re-renders must never
  // rebuild geometry.
  const sizeKey = size.join(',')
  const { geometry, edges, bodyMaterial, lineMaterial } = useMemo(() => {
    const geometry = new THREE.BoxGeometry(...size)
    const edges = new THREE.EdgesGeometry(geometry)
    const bodyMaterial = lit
      ? makePanelMaterial(accent, size, seed, windowDensity)
      : new THREE.MeshBasicMaterial({ color: BODY_COLOR })
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

  useFrame(state => {
    if (lit && bodyMaterial instanceof THREE.ShaderMaterial) {
      bodyMaterial.uniforms.uTime.value = state.clock.elapsedTime
    }
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
}: {
  spec: SignSpec
  position: [number, number, number]
  rotationY?: number
  height: number
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

function Jumbotron() {
  const { tower, screen } = JUMBOTRON
  const identity = useMemo(
    () =>
      makeSignTexture({
        width: 1024,
        accent: '#00ffff',
        background: '#03080f',
        lines: [
          { text: '> JESSE CHEN', size: 96 },
          { text: 'CARNEGIE MELLON // SCS', size: 44, color: '#7efcff' },
          { text: content.profile.headline.toUpperCase(), size: 34, color: '#9fb6c9' },
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
        windowDensity={0.18}
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

/** A light-tram gliding the elevated line, pausing at each stop. */
function Tram() {
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
    const z = zStart + (zEnd - zStart) * THREE.MathUtils.clamp(staged, 0, 1)
    ref.current.position.set(TRANSIT.x, TRANSIT.beamY + 0.85, z)
  })

  return (
    <group ref={ref}>
      <mesh geometry={bodyGeometry} material={bodyMaterial} />
      <lineSegments geometry={edges} material={edgeMaterial} />
    </group>
  )
}

function TransitLine({ interaction }: { interaction: GridInteraction }) {
  const stops = content.experiences
  const beamLength = Math.abs(TRANSIT.zStep) * (stops.length - 1) + 8
  const beamZ = (transitStopZ(0) + transitStopZ(stops.length - 1)) / 2
  const { onTooltip, onSelectRole, selection } = interaction

  return (
    <group>
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
                  { text: exp.company.toUpperCase(), size: 54 },
                  { text: exp.role, size: 30, color: '#9fb6c9' },
                  { text: exp.period, size: 26, color: exp.accent },
                ],
              }}
              position={[TRANSIT.x + 0.2, TRANSIT.beamY + 2.3, z]}
              rotationY={Math.PI / 2}
              height={2.2}
            />
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
      <Tram />
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
          {/* Awning light-strip over the storefront — solid emissive, so it
              reads as a lit tube rather than a dark bar. */}
          <mesh position={[x + 3.05, 5.4, z]}>
            <boxGeometry args={[0.15, 0.15, 5.2]} />
            <meshBasicMaterial color={item.accent} />
          </mesh>
          {/* Rooftop sign angled toward the approaching camera (+Z) so the
              three storefronts never stack edge-on in projection. */}
          <Sign
            spec={{
              accent: item.accent,
              width: 640,
              lines: [
                { text: item.title.toUpperCase(), size: 50 },
                { text: item.subtitle, size: 30, color: '#9fb6c9' },
              ],
            }}
            position={[x, 8.6, z + 3.2]}
            rotationY={0.35}
            height={2}
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
            />
            <Sign
              spec={{
                accent: group.accent,
                width: 640,
                lines: [
                  { text: group.name.toUpperCase(), size: 54 },
                  { text: `${group.items.length} TOOLS`, size: 28, color: group.accent },
                ],
              }}
              position={[t.x, y + 1.6, t.z + t.width / 2 + 0.3]}
              height={2}
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
