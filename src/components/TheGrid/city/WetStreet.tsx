import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Reflector } from 'three/examples/jsm/objects/Reflector.js'
import { SCENE_BG } from './sceneColor'

/**
 * Rained-on asphalt with REAL planar reflections: a three.js Reflector
 * renders the city mirrored into a texture every frame, and this shader
 * composites it under procedural puddles, expanding rain-ripple rings that
 * distort the reflection, the avenue grid, and the data pulses. This is the
 * single biggest "cyberpunk in the rain" ingredient — every neon sign gets
 * doubled in the street. Tier-gated: low-end GPUs keep the flat Ground.
 */

const wetStreetShader = {
  name: 'WetStreetShader',
  uniforms: {
    color: { value: null as unknown },
    tDiffuse: { value: null as unknown },
    textureMatrix: { value: null as unknown },
    uTime: { value: 0 },
    uBg: { value: SCENE_BG },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUvRefl;
    varying vec3 vWorld;
    varying float vViewDist;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      vWorld = world.xyz;
      vUvRefl = textureMatrix * vec4(position, 1.0);
      vec4 mv = viewMatrix * world;
      vViewDist = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec3 uBg;
    varying vec4 vUvRefl;
    varying vec3 vWorld;
    varying float vViewDist;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
        f.y
      );
    }

    // Expanding rain-impact rings, one cell grid, phase-offset per cell.
    vec2 ripple(vec2 p) {
      vec2 cell = floor(p);
      vec2 f = fract(p) - 0.5;
      float ph = fract(uTime * 0.7 + hash(cell));
      float r = length(f);
      float ring = sin((r - ph * 0.55) * 34.0) * exp(-r * 5.0)
                 * (1.0 - smoothstep(0.0, 0.5, abs(r - ph * 0.45) * 6.0))
                 * (1.0 - ph);
      return normalize(f + 1e-4) * ring;
    }

    void main() {
      // Two ripple octaves distort the mirrored city.
      vec2 distort = ripple(vWorld.xz * 0.9) * 0.4 + ripple(vWorld.xz * 0.9 + 17.3) * 0.3;
      // Slow drifting micro-waves so even puddle-free asphalt shimmers.
      distort += vec2(
        vnoise(vWorld.xz * 0.6 + uTime * 0.12) - 0.5,
        vnoise(vWorld.xz * 0.6 - uTime * 0.1) - 0.5
      ) * 0.12;

      vec4 uvRefl = vUvRefl;
      uvRefl.xy += distort * 0.35 * uvRefl.w;
      vec3 reflection = texture2DProj(tDiffuse, uvRefl).rgb;

      float ax = abs(vWorld.x);

      // Puddle mask: pooled water reflects hard, damp asphalt only glows.
      float puddle = smoothstep(0.42, 0.62, vnoise(vWorld.xz * 0.07));
      float wet = mix(0.2, 0.9, puddle);
      // Water Fresnel: reflections strengthen toward grazing angles, so the
      // distant road turns to mirror while the asphalt underfoot stays
      // asphalt — the thing that makes wet streets read as WATER.
      float upDot = clamp(dot(normalize(cameraPosition - vWorld), vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
      wet *= 0.3 + 0.95 * pow(1.0 - upDot, 2.0);
      // Sidewalks drain — mostly damp concrete, faint sheen only.
      float walk = step(9.7, ax) * (1.0 - step(12.35, ax));
      wet *= 1.0 - walk * 0.62;

      vec3 asphalt = vec3(0.02, 0.03, 0.05) * (0.75 + 0.5 * vnoise(vWorld.xz * 1.7));
      vec3 pave = vec3(0.05, 0.055, 0.062) * (0.8 + 0.4 * vnoise(vWorld.xz * 2.3));
      float joint = 1.0 - smoothstep(0.02, 0.09, abs(fract(vWorld.z / 2.4) - 0.5) * 2.4);
      pave *= 1.0 - 0.35 * joint;
      vec3 color = mix(asphalt, pave, walk) + reflection * wet;

      // Painted road markings, worn and doubled by the water film.
      float marks = 0.0;
      marks += (1.0 - smoothstep(0.07, 0.2, ax)) * step(fract(vWorld.z / 6.0), 0.5) * 0.9;
      marks += (1.0 - smoothstep(0.05, 0.15, abs(ax - 4.9))) * step(fract(vWorld.z / 9.0), 0.62) * 0.5;
      marks += (1.0 - smoothstep(0.1, 0.3, abs(ax - 9.6))) * 0.8;
      float cw = step(abs(vWorld.z - 34.0), 1.7)
               + step(abs(vWorld.z + 44.0), 1.7)
               + step(abs(vWorld.z + 90.0), 1.7)
               + step(abs(vWorld.z + 154.0), 1.7);
      marks += min(cw, 1.0) * step(ax, 8.8) * step(0.45, fract(vWorld.x / 1.35)) * 0.55;
      marks *= (0.55 + 0.45 * vnoise(vWorld.xz * 3.1)) * (1.0 - walk);
      color += vec3(0.5, 0.52, 0.5) * marks * 0.3;

      float fade = smoothstep(50.0, 175.0, vViewDist);
      color = mix(color, uBg, fade);
      gl_FragColor = vec4(color, 1.0);
    }
  `,
}

export default function WetStreet({ textureSize }: { textureSize: number }) {
  const reflector = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(700, 700)
    const mirror = new Reflector(geometry, {
      clipBias: 0.003,
      textureWidth: textureSize,
      textureHeight: textureSize,
      shader: wetStreetShader,
    })
    mirror.rotation.x = -Math.PI / 2
    mirror.position.set(0, 0.02, -90)
    return mirror
  }, [textureSize])

  useEffect(() => () => {
    reflector.geometry.dispose()
    reflector.dispose()
  }, [reflector])

  useFrame(state => {
    const material = reflector.material as THREE.ShaderMaterial
    material.uniforms.uTime.value = state.clock.elapsedTime
  })

  return <primitive object={reflector} />
}
