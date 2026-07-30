import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * CRT screens: project screenshots (or a generated terminal card) on planes.
 * A per-frame focus uniform — driven by camera distance — resolves each
 * screen from scanline noise into the real image as the visitor approaches,
 * the 3D counterpart of the site's text "decrypt" motif.
 */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vViewDir;
  varying vec3 vViewNormal;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mv.xyz);
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform vec3 uAccent;
  uniform float uTime;
  uniform float uFocus;
  varying vec2 vUv;
  varying vec3 vViewDir;
  varying vec3 vViewNormal;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    float focus = clamp(uFocus, 0.0, 1.0);

    // Unresolved screens sample at a coarse grid; focus sharpens to native.
    float res = mix(26.0, 720.0, focus * focus);
    vec2 uv = (floor(vUv * res) + 0.5) / res;

    vec3 color;
    if (uHasMap > 0.5) {
      float shift = (1.0 - focus) * 0.006;
      color = vec3(
        texture2D(uMap, uv + vec2(shift, 0.0)).r,
        texture2D(uMap, uv).g,
        texture2D(uMap, uv - vec2(shift, 0.0)).b
      );
      // Screenshots are mostly light-UI pages; damp them below the bloom
      // threshold, hard-cap luminance, and tint toward the night palette so
      // screens sit IN the city instead of blowing out white.
      color = min(color * 0.48 + vec3(0.0, 0.02, 0.035), vec3(0.5, 0.54, 0.58));
      // Powered-down screens collapse to DARK static — sparks over near-black,
      // never confetti over white.
      vec3 dead = vec3(0.045, 0.06, 0.085)
        + uAccent * step(0.93, hash(floor(vUv * 42.0) + floor(uTime * 3.0))) * 0.35;
      color = mix(dead, color, smoothstep(0.12, 0.45, focus));
    } else {
      // No screenshot: animated signal bars in the project's accent.
      float bar = step(0.5, fract(uv.y * 14.0 + uTime * 0.4 + hash(vec2(floor(uv.y * 14.0)))));
      color = uAccent * mix(0.12, 0.4, bar) * (0.6 + 0.4 * hash(floor(uv * 40.0) + floor(uTime * 3.0)));
    }

    // Scanlines and flicker fade out as the screen resolves.
    float scan = 0.85 + 0.15 * sin(vUv.y * 480.0 + uTime * 7.0);
    color *= mix(scan, 1.0, focus * 0.7);
    color *= 0.92 + 0.08 * sin(uTime * 11.0 + vUv.y * 3.0) * (1.0 - focus);

    // Screen bezel glow.
    float edge = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0;
    color += uAccent * smoothstep(0.94, 1.0, edge) * 0.7;

    // Grazing screens dim like real displays — no white slivers in flyovers.
    float facing = abs(dot(vViewDir, vViewNormal));
    color *= mix(0.12, 1.0, smoothstep(0.08, 0.45, facing));

    gl_FragColor = vec4(color, 1.0);
  }
`

export interface BillboardProps {
  position: [number, number, number]
  rotationY?: number
  width: number
  height: number
  accent: string
  /** Screenshot URL (site-relative), a prebuilt texture, or null for the signal-bars fallback. */
  image: string | THREE.Texture | null
  /** Distance at which the screen is fully resolved. */
  focusDistance?: number
  /** Extra screenshots to rotate through while `cycleActive` (selected project). */
  cycleImages?: string[]
  cycleActive?: boolean
}

const CYCLE_INTERVAL_S = 4

export default function Billboard({
  position,
  rotationY = 0,
  width,
  height,
  accent,
  image,
  focusDistance = 26,
  cycleImages,
  cycleActive = false,
}: BillboardProps) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uMap: { value: null },
          uHasMap: { value: 0 },
          uAccent: { value: new THREE.Color(accent) },
          uTime: { value: 0 },
          uFocus: { value: 0 },
        },
      }),
    [accent],
  )
  const geometry = useMemo(() => new THREE.PlaneGeometry(width, height), [width, height])

  useEffect(() => {
    let disposed = false
    let owned: THREE.Texture | null = null
    if (typeof image === 'string') {
      new THREE.TextureLoader().load(image, texture => {
        if (disposed) {
          texture.dispose()
          return
        }
        texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = 8
        owned = texture
        material.uniforms.uMap.value = texture
        material.uniforms.uHasMap.value = 1
      })
      // Load failures just leave the signal-bars fallback on screen.
    } else if (image) {
      material.uniforms.uMap.value = image
      material.uniforms.uHasMap.value = 1
    }
    return () => {
      disposed = true
      owned?.dispose()
    }
  }, [image, material])

  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])

  const worldPos = useMemo(() => new THREE.Vector3(...position), [position])
  const cycleRef = useRef({ index: 0, nextAt: CYCLE_INTERVAL_S })
  const textureCache = useRef(new Map<string, THREE.Texture>())

  useEffect(() => {
    const cache = textureCache.current
    return () => {
      for (const texture of cache.values()) texture.dispose()
      cache.clear()
    }
  }, [])

  useFrame(state => {
    const time = state.clock.elapsedTime
    material.uniforms.uTime.value = time
    const dist = state.camera.position.distanceTo(worldPos)
    let focus = 1 - THREE.MathUtils.clamp((dist - focusDistance) / 45, 0, 1)
    // Screens power down to static during the high flyover — a white page
    // floating in a night flyover reads as a glitch, not a monitor.
    focus *= 1 - THREE.MathUtils.smoothstep(state.camera.position.y, 15, 23)
    material.uniforms.uFocus.value = focus

    // Selected-project screens rotate through every screenshot; the swap
    // rides a scanline "signal blip" because focus dips are already styled.
    if (cycleActive && cycleImages && cycleImages.length > 1 && time >= cycleRef.current.nextAt) {
      cycleRef.current.nextAt = time + CYCLE_INTERVAL_S
      cycleRef.current.index = (cycleRef.current.index + 1) % cycleImages.length
      const url = cycleImages[cycleRef.current.index]
      const cached = textureCache.current.get(url)
      if (cached) {
        material.uniforms.uMap.value = cached
        material.uniforms.uHasMap.value = 1
      } else {
        new THREE.TextureLoader().load(url, texture => {
          texture.colorSpace = THREE.SRGBColorSpace
          texture.anisotropy = 8
          textureCache.current.set(url, texture)
          material.uniforms.uMap.value = texture
          material.uniforms.uHasMap.value = 1
        })
      }
    }
  })

  return <mesh geometry={geometry} material={material} position={position} rotation-y={rotationY} />
}
