import * as THREE from 'three'
import { SCENE_BG } from './sceneColor'

/**
 * Facade shader for signature structures: dark paneled body, seam lines,
 * sparse accent-lit windows, grounded gradient — so bespoke buildings read
 * as architecture instead of flat black slabs. One material per structure
 * (uniform-driven), sharing the skyline's visual language.
 */

const vertexShader = /* glsl */ `
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying float vViewDist;
  void main() {
    vLocal = position;
    vNormal = normal;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewDist = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uBg;
  uniform vec3 uAccent;
  uniform vec3 uDims;
  uniform float uSeed;
  uniform float uWindowDensity; // 0 = pure panels, 1 = fully windowed
  varying vec3 vLocal;
  varying vec3 vNormal;
  varying float vViewDist;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed * 17.0) * 43758.5453);
  }

  void main() {
    vec3 base = vec3(0.016, 0.026, 0.052);
    vec3 color = base;

    if (abs(vNormal.y) > 0.5) {
      float rim = smoothstep(0.42, 0.5, max(abs(vLocal.x / uDims.x), abs(vLocal.z / uDims.z)));
      color = base * 2.4 + uAccent * (rim * 0.4 + 0.07);
    } else {
      float u = (abs(vNormal.x) > 0.5 ? vLocal.z / uDims.z : vLocal.x / uDims.x) + 0.5;
      float v = vLocal.y / uDims.y + 0.5;
      float cols = max(3.0, floor((abs(vNormal.x) > 0.5 ? uDims.z : uDims.x) * 1.1));
      float rows = max(4.0, floor(uDims.y * 0.9));
      vec2 cell = vec2(floor(u * cols), floor(v * rows));
      vec2 inCell = fract(vec2(u * cols, v * rows));

      // Panel seams: thin dark grout between plates.
      float seam = smoothstep(0.0, 0.05, inCell.x) * smoothstep(1.0, 0.95, inCell.x)
                 * smoothstep(0.0, 0.06, inCell.y) * smoothstep(1.0, 0.94, inCell.y);
      color = mix(base * 0.4, base, seam);

      // Sparse lit windows in the structure's own accent.
      float lit = step(1.0 - uWindowDensity * 0.28, hash(cell));
      float window = step(0.26, inCell.x) * step(inCell.x, 0.74)
                   * step(0.32, inCell.y) * step(inCell.y, 0.68);
      float glowPulse = 0.7 + 0.3 * sin(uTime * 0.5 + hash(cell + 5.0) * 20.0);
      color += uAccent * lit * window * glowPulse * 0.5;

      // Accent wash rising from the street.
      color += uAccent * 0.06 * (1.0 - smoothstep(0.0, 0.4, v));
      // Corner glow along the face's tangent axis only — using the normal
      // axis too would paint entire walls in accent.
      float tangent = abs(vNormal.x) > 0.5 ? abs(vLocal.z / uDims.z) : abs(vLocal.x / uDims.x);
      float edge = smoothstep(0.44, 0.5, tangent);
      color += uAccent * edge * 0.28;
    }

    float fade = smoothstep(70.0, 210.0, vViewDist);
    color = mix(color, uBg, fade);
    // Wide near-dissolve: a grazing facade melts to atmosphere, never a wall.
    color = mix(uBg, color, smoothstep(4.0, 18.0, vViewDist));
    gl_FragColor = vec4(color, 1.0);
  }
`

export function makePanelMaterial(accent: string, dims: [number, number, number], seed = 1, windowDensity = 0.8) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uBg: { value: SCENE_BG },
      uAccent: { value: new THREE.Color(accent) },
      uDims: { value: new THREE.Vector3(...dims) },
      uSeed: { value: seed },
      uWindowDensity: { value: windowDensity },
    },
  })
}
