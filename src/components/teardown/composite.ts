/**
 * The chapter's final pass, one full-screen draw to the canvas. It owns the
 * room (a softened photograph under fine colored glyphs, with a cell-wise
 * dissolve between rooms), the product layer's glyph decode, shadow pool,
 * and glow, and the coach skeleton. Everything is computed in linear light
 * and written to the canvas as sRGB exactly once, here, so the renderer's
 * own output conversion stays off.
 *
 * `uProduct` is the product render target: linear, premultiplied by
 * coverage, the same size as the canvas, and mipmapped. Room textures are
 * sRGB with mipmaps and `flipY`, so texture v runs bottom to top and focus
 * points arrive with y already flipped to match.
 */
import * as THREE from 'three'
import { COACH_BONES } from './coach'
import { GLSL_COMMON, glslFloat, CHAPTER_RAMP } from './materials'
import { SCATTER_CELLS } from './rig'

const BONES = COACH_BONES.length

const VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAGMENT = /* glsl */ `
uniform sampler2D uBackA;
uniform sampler2D uBackB;
uniform vec2 uBackAspect;
uniform vec4 uFocus;
uniform float uBackMix;
uniform float uBackGain;
uniform float uGlyphOnly;
uniform float uDrift;
uniform vec2 uPointer;
uniform sampler2D uProduct;
uniform float uDecode;
uniform float uGather;
uniform sampler2D uAtlas;
uniform float uGlyphs;
uniform vec2 uCell;
uniform vec2 uRes;
uniform vec4 uBones[${BONES}];
uniform vec3 uHead;
uniform float uLimb;
uniform float uCoach;
out vec4 fragColor;
${GLSL_COMMON}
// The CSS stage colour #090705 in linear light. The room never falls below it, so the canvas edge never shows a seam.
const vec3 STAGE = vec3(.00273, .00213, .00152);
const vec3 IVORY = vec3(1.0, .9, .72);

// Identity up to .8 per channel, so unlit screen colours pass unchanged, then an asymptote at 1.0 for lit highlights.
vec3 shoulder(vec3 c) {
  vec3 x = max(c - .8, 0.0);
  return min(c, vec3(.8)) + x / (1.0 + x / .2);
}

// One room photograph as seen through the frame. s is the pixel and sc its cell centre, both 0 to 1 on the canvas.
// The photo is cover-fitted with 3% overscan for the parallax, pushed in by up to 5% over the chapter, and centred
// on its focus point wherever the frame crops it, so the subject stays in view on narrow screens.
vec3 room(sampler2D tex, float aspect, vec2 focus, vec2 s, vec2 sc, vec2 local, float glyphOnly) {
  float screenAspect = uRes.x / uRes.y;
  vec2 size = screenAspect > aspect ? vec2(1.0, aspect / screenAspect) : vec2(screenAspect / aspect, 1.0);
  size *= (1.0 - .05 * uDrift) * .97;
  vec2 centre = clamp(focus, size * .5 + .012, 1.0 - size * .5 - .012) + uPointer * vec2(.01, .007);
  float lodPixel = log2(max(size.y * float(textureSize(tex, 0).y) / uRes.y, 1e-3));
  vec3 base = textureLod(tex, centre + (s - .5) * size, 1.2 + max(lodPixel, 0.0)).rgb;
  vec3 cellColor = textureLod(tex, centre + (sc - .5) * size, max(lodPixel + log2(sqrt(uCell.x * uCell.y)), 0.0)).rgb;
  float alpha = glyphMask(uAtlas, uGlyphs, glyphIndex(pow(lightness(cellColor), .75), uGlyphs), local);
  vec3 glyph = lifted(cellColor, .4) * 1.35 * alpha;
  return mix(base * .62 + glyph * .9, glyph * .8, glyphOnly);
}

void main() {
  vec2 s = gl_FragCoord.xy / uRes;
  vec2 grid = gl_FragCoord.xy / uCell;
  vec2 cell = floor(grid);
  vec2 local = fract(grid);
  vec2 sc = (cell + .5) * uCell / uRes;
  // Blur levels are tuned for an 1800 px tall target, and this keeps them the same fraction of the frame at any size.
  float lodScale = log2(uRes.y / 1800.0);

  vec3 back = vec3(0.0);
  if (uBackGain > .002) {
    float roll = hash12(cell * 1.37);
    float swap = smoothstep(roll - .06, roll + .06, uBackMix * 1.12 - .06);
    // A cell mid-swap drops its photograph and shows only glyphs, so a room change reads as characters rewriting it.
    float rewriting = smoothstep(.1, .2, swap) * (1.0 - smoothstep(.8, .9, swap));
    float glyphOnly = max(uGlyphOnly, rewriting);
    if (swap < 1.0) back += room(uBackA, uBackAspect.x, uFocus.xy, s, sc, local, glyphOnly) * (1.0 - swap);
    if (swap > 0.0) back += room(uBackB, uBackAspect.y, uFocus.zw, s, sc, local, glyphOnly) * swap;
    // A gentle S-curve in perceptual space adds contrast without crushing the shadows.
    vec3 p = clamp(sqrt(back * uBackGain), 0.0, 1.0);
    p = mix(p, p * p * (3.0 - 2.0 * p), .3);
    back = p * p;
  }
  back *= 1.0 - .35 * smoothstep(.3, 1.0, length((s - .5) * 2.0) * .7071);
  back = max(back, STAGE);

  vec4 product = texelFetch(uProduct, ivec2(gl_FragCoord.xy), 0);
  if (uDecode < 1.0) {
    // Before the gather completes, each cell draws the product as seen from a hashed nearby cell, so it reads as loose characters.
    vec2 src = cell;
    if (uGather < .999) src = floor(cell + (hash22(cell) - .5) * 2.0 * ${glslFloat(SCATTER_CELLS)} * (1.0 - uGather));
    vec4 sampled = textureLod(uProduct, (src + .5) * uCell / uRes, log2(sqrt(uCell.x * uCell.y)));
    vec3 color = sampled.rgb / max(sampled.a, 1e-4);
    float alpha = glyphMask(uAtlas, uGlyphs, glyphIndex(pow(lightness(color), .75), uGlyphs), local) * sampled.a;
    vec4 glyph = vec4(lifted(color, .4) * 1.35 * alpha, alpha);
    float roll = hash12(cell + 7.31);
    float resolved = smoothstep(roll - .04, roll + .04, uDecode * 1.08 - .04);
    product = mix(glyph, product, resolved);
  }
  product.rgb = shoulder(product.rgb);

  // The shadow pool sits a little below the product, as if lit from above, and the glow only shows outside it.
  float shadow = textureLod(uProduct, s + vec2(0.0, .012), 5.5 + lodScale).a;
  vec3 glow = textureLod(uProduct, s, 4.0 + lodScale).rgb * .22 * uDecode;
  vec3 color = product.rgb + (back * (1.0 - .6 * shadow) + glow) * (1.0 - product.a);

  if (uCoach > .01) {
    vec2 p = (cell + .5) * uCell;
    float d = max(length(p - uHead.xy) - uHead.z, 0.0);
    for (int i = 0; i < ${BONES}; i++) {
      vec2 pa = p - uBones[i].xy;
      vec2 ba = uBones[i].zw - uBones[i].xy;
      d = min(d, length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0)));
    }
    float intensity = 1.0 - smoothstep(uLimb * .6, uLimb, d);
    color = mix(color, IVORY, glyphMask(uAtlas, uGlyphs, glyphIndex(intensity, uGlyphs), local) * uCoach);
  }

  color = clamp(color, 0.0, 1.0);
  vec3 srgb = mix(color * 12.92, 1.055 * pow(color, vec3(1.0 / 2.4)) - .055, step(.0031308, color));
  // Half a code value of noise breaks up banding in the dark room gradients and the vignette.
  fragColor = vec4(srgb + (hash12(gl_FragCoord.xy) - .5) / 255.0, 1.0);
}
`

export interface Composite {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  material: THREE.ShaderMaterial
  dispose(): void
}

/**
 * Uniforms in device pixels: `uCell`, `uRes`, `uBones` (x1, y1, x2, y2 per
 * bone, origin bottom left), `uHead` (centre and radius), and `uLimb` (limb
 * half-width). `uFocus` holds room A's focus then room B's, x from the left
 * and y from the bottom, 0 to 1.
 */
export function createComposite(): Composite {
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uBackA: { value: null },
      uBackB: { value: null },
      uBackAspect: { value: new THREE.Vector2(16 / 9, 16 / 9) },
      uFocus: { value: new THREE.Vector4(0.5, 0.5, 0.5, 0.5) },
      uBackMix: { value: 0 },
      uBackGain: { value: 0 },
      uGlyphOnly: { value: 0 },
      uDrift: { value: 0 },
      uPointer: { value: new THREE.Vector2() },
      uProduct: { value: null },
      uDecode: { value: 1 },
      uGather: { value: 1 },
      uAtlas: { value: null },
      uGlyphs: { value: Array.from(CHAPTER_RAMP).length },
      uCell: { value: new THREE.Vector2(6, 13) },
      uRes: { value: new THREE.Vector2(1, 1) },
      uBones: { value: new Float32Array(BONES * 4) },
      uHead: { value: new THREE.Vector3() },
      uLimb: { value: 1 },
      uCoach: { value: 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const quad = new THREE.Mesh(geometry, material)
  quad.frustumCulled = false
  const scene = new THREE.Scene()
  scene.add(quad)
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  return {
    scene,
    camera,
    material,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
