/**
 * Shader materials for the teardown's unlit planes: the app screens, which
 * develop cell by cell from colored glyphs into the sharp capture, and the
 * code layer. Both write premultiplied colour into the linear product target
 * and are never lit or tone-mapped, so a developed screen keeps the capture's
 * exact colours. GLSL_COMMON is shared with the composite pass.
 */
import * as THREE from 'three'
import { CODE } from './rig'

/** The chapter's glyph ramp, dark to bright. Index 0 is the empty cell. */
export const CHAPTER_RAMP = ' .·:;-=+*xoO#%@█'

/** GLSL float literal, so integers never land in float arithmetic as ints. */
export const glslFloat = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${n}`)

/**
 * Helpers shared by every chapter shader. `lightness` approximates the sRGB
 * curve on a linear colour, so ramp steps follow perceived brightness instead
 * of crowding every dark UI tone into the empty glyph. `glyphMask` reads an
 * atlas built by buildGlyphAtlas and uploaded without a vertical flip.
 */
export const GLSL_COMMON = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float roundRect(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float lightness(vec3 c) { return sqrt(max(dot(c, vec3(.2126, .7152, .0722)), 0.0)); }
vec3 lifted(vec3 c, float amount) { return mix(c, c / max(max(c.r, max(c.g, c.b)), 1e-3), amount); }
float glyphIndex(float level, float glyphs) { return floor(clamp(level, 0.0, 1.0) * (glyphs - 1.0) + .5); }
float glyphMask(sampler2D atlas, float glyphs, float index, vec2 local) {
  return index < .5 ? 0.0 : textureLod(atlas, vec2((index + local.x) / glyphs, 1.0 - local.y), 0.0).a;
}
`

const PLANE_VERTEX = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const SCREEN_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uAtlas;
uniform float uGlyphs;
uniform vec2 uCell;
uniform float uDevelop;
uniform float uOpacity;
uniform vec2 uHalf;
uniform float uRadius;
uniform vec2 uTexSize;
uniform float uSeed;
in vec2 vUv;
out vec4 fragColor;
${GLSL_COMMON}
void main() {
  // Every derivative is taken before the discard, while all four pixels of the quad are still running.
  float sd = roundRect((vUv * 2.0 - 1.0) * uHalf, uHalf, uRadius);
  float mask = clamp(.5 - sd / max(fwidth(sd), 1e-6), 0.0, 1.0);
  vec2 grid = gl_FragCoord.xy / uCell;
  vec2 cell = floor(grid);
  vec2 local = fract(grid);
  vec2 dx = dFdx(vUv);
  vec2 dy = dFdy(vUv);
  vec2 centerUv = vUv - dx * (local.x - .5) * uCell.x - dy * (local.y - .5) * uCell.y;
  float lodCell = log2(max(1.0, max(length(dx * uTexSize), length(dy * uTexSize)) * uCell.y));
  vec4 developed = texture(uMap, vUv);
  if (mask <= 0.0) discard;

  vec3 cellColor = textureLod(uMap, centerUv, lodCell).rgb;
  float glyphAlpha = glyphMask(uAtlas, uGlyphs, glyphIndex(pow(lightness(cellColor), .8), uGlyphs), local);
  vec3 glyph = lifted(cellColor, .55) * 1.25;
  float roll = hash12(cell + uSeed);
  float resolved = smoothstep(roll - .04, roll + .04, uDevelop * 1.08 - .04);
  vec3 color = mix(glyph * glyphAlpha, developed.rgb, resolved);
  float alpha = mix(glyphAlpha, 1.0, resolved);
  fragColor = vec4(color, alpha) * (mask * uOpacity);
}
`

const CODE_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
uniform float uOpacity;
in vec2 vUv;
out vec4 fragColor;
${GLSL_COMMON}
const vec2 HALF = vec2(${glslFloat(CODE.hx)}, ${glslFloat(CODE.hy)});
void main() {
  float sd = roundRect((vUv * 2.0 - 1.0) * HALF, HALF, ${glslFloat(CODE.radius)});
  float mask = clamp(.5 - sd / max(fwidth(sd), 1e-6), 0.0, 1.0);
  vec4 code = texture(uMap, vUv);
  if (mask <= 0.0) discard;
  // Above 1.0 the amber reaches the composite's highlight shoulder and its glow, so it reads as emitted light.
  fragColor = vec4(code.rgb * 1.4, 1.0) * (mask * uOpacity);
}
`

/**
 * Output is premultiplied, so the blend adds colour as written and lets the
 * product target accumulate coverage in alpha for the composite.
 */
const PREMULTIPLIED: THREE.ShaderMaterialParameters = {
  glslVersion: THREE.GLSL3,
  transparent: true,
  toneMapped: false,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneMinusSrcAlphaFactor,
  blendSrcAlpha: THREE.OneFactor,
  blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
}

/**
 * A screen or card plane. `uCell` is the glyph cell in device pixels and must
 * match the composite's, so glyphs on the screen and in the room share one
 * grid. `uHalf` and `uRadius` are the plane's world half-extents and corner
 * radius, `uTexSize` the map's size in texels.
 */
export function createScreenMaterial(map: THREE.Texture, atlas: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    ...PREMULTIPLIED,
    uniforms: {
      uMap: { value: map },
      uAtlas: { value: atlas },
      uGlyphs: { value: Array.from(CHAPTER_RAMP).length },
      uCell: { value: new THREE.Vector2(6, 13) },
      uDevelop: { value: 0 },
      uOpacity: { value: 0 },
      uHalf: { value: new THREE.Vector2(1, 1) },
      uRadius: { value: 0 },
      uTexSize: { value: new THREE.Vector2(1, 1) },
      uSeed: { value: 0 },
    },
    vertexShader: PLANE_VERTEX,
    fragmentShader: SCREEN_FRAGMENT,
  })
}

/** The code layer: the code texture, unlit, with its corners rounded to CODE.radius. */
export function createCodeMaterial(map: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    ...PREMULTIPLIED,
    uniforms: { uMap: { value: map }, uOpacity: { value: 0 } },
    vertexShader: PLANE_VERTEX,
    fragmentShader: CODE_FRAGMENT,
  })
}
