import { MAX_WOUNDS } from './decodeMath'

/**
 * Draws an image as a glyph field that resolves into the real picture cell by
 * cell. Each cell rolls a fixed threshold; once `uProgress` passes it (softened
 * by `uBand`) the cell shows the image. Wounds lower the progress locally.
 */
export const DECODE_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uImage;
uniform sampler2D uAtlas;
uniform vec2 uSize;
uniform vec2 uCell;
uniform vec2 uScale;
uniform vec2 uOffset;
uniform float uGlyphs;
uniform float uProgress;
uniform float uBand;
uniform vec3 uTint;
uniform vec4 uWounds[${MAX_WOUNDS}];
float cellHash(vec2 c) {
  vec3 q = fract(vec3(c.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec2 imageUv(vec2 at) {
  vec2 uv = at / uSize;
  uv.y = 1.0 - uv.y;
  return uv * uScale + uOffset;
}
void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 cell = floor(frag / uCell);
  vec2 centre = (cell + .5) * uCell;
  float p = uProgress;
  for (int i = 0; i < ${MAX_WOUNDS}; i++) {
    vec4 w = uWounds[i];
    if (w.w <= .001) continue;
    float d = distance(centre, w.xy) / max(w.z, 1.0);
    p -= exp(-d * d * 2.0) * w.w;
  }
  p = clamp(p, 0.0, 1.0);
  float roll = cellHash(cell);
  float resolved = smoothstep(roll - uBand * .5, roll + uBand * .5, p);
  vec3 image = texture(uImage, imageUv(frag)).rgb;
  vec3 avg = textureLod(uImage, imageUv(centre), log2(max(uCell.x, 1.0))).rgb;
  float luma = dot(avg, vec3(.299, .587, .114));
  float index = floor(pow(luma, .85) * (uGlyphs - 1.0) + .5);
  vec2 local = fract(frag / uCell);
  float alpha = index < .5 ? 0.0 : texture(uAtlas, vec2((index + local.x) / uGlyphs, 1.0 - local.y)).a;
  // Barely resolved surfaces stay dim, so a screenshot materialises instead of arriving as bright noise.
  vec3 glyph = uTint * (.55 + .45 * luma) * alpha * (.35 + .65 * p);
  fragColor = vec4(mix(glyph, image, resolved), 1.0);
}`
