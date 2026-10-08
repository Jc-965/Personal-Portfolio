import { COACH_BONES, COACH_JOINTS } from './coach.ts'
import { FAR, FOCAL, PHONE } from './rig.ts'

/** GLSL float literal, so integers never land in float arithmetic as ints. */
const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${n}`)

const COMMON = `
const float FOCAL = ${f(FOCAL)};
const float FAR = ${f(FAR)};
const vec3 PHONE_B = vec3(${f(PHONE.hx)}, ${f(PHONE.hy)}, ${f(PHONE.hz)});
const float PHONE_R = ${f(PHONE.radius)};
const vec2 SCREEN_B = vec2(${f(PHONE.sx)}, ${f(PHONE.sy)});
const float SCREEN_R = ${f(PHONE.sRadius)};
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float roundRect(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
// The camera looks along +z. uShift moves the principal point (see rig.ts).
vec3 rayDir(vec2 uv, vec2 shift) { return normalize(vec3(uv.x - shift.x, uv.y - shift.y, FOCAL)); }
`

const BONES = COACH_BONES.map(([a, b]) => `ivec2(${a}, ${b})`).join(', ')
export const JOINT_COUNT = COACH_JOINTS.length

/**
 * Scene pass, one pixel per character cell. Attachment 0: light, depth tint,
 * material / 8, glass light. Attachment 1: hit distance / FAR packed into two
 * 8-bit channels (1 for a miss), read by the glyph pass for plane occlusion.
 * Materials: 0 backdrop or empty, 1 chassis, 2 internals, 3 skeleton.
 */
export const SCENE = `#version 300 es
precision highp float;
layout(location = 0) out vec4 outScene;
layout(location = 1) out vec4 outDepth;
uniform vec2 uGrid;
uniform float uAspect;
uniform vec3 uCamPos;
uniform vec2 uShift;
uniform vec3 uPhonePos;
uniform vec3 uPhoneRight;
uniform vec3 uPhoneUp;
uniform vec3 uPhoneNormal;
uniform vec4 uPhoneBound;
uniform float uInternals;
uniform vec3 uGlassCenter;
uniform vec3 uGlass;
uniform sampler2D uBackA;
uniform sampler2D uBackB;
uniform vec4 uBack;
uniform vec2 uBackAspect;
uniform float uBackLod;
uniform float uBackDrift;
uniform vec3 uJoints[${JOINT_COUNT}];
uniform vec4 uCoachBound;
uniform vec2 uCoach;
${COMMON}
const vec3 LIGHT = vec3(-0.4479, 0.6470, -0.6171);
const ivec2 BONES[${COACH_BONES.length}] = ivec2[${COACH_BONES.length}](${BONES});

float roundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float slab(vec3 p, vec2 b, float r, float z0, float z1) {
  vec2 w = vec2(roundRect(p.xy, b, r), max(z0 - p.z, p.z - z1));
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0));
}
float capsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
// The chassis is an open tray. The screen plane covers the opening, so its depth never fights the body's front face.
float chassis(vec3 q) {
  float outer = slab(q, PHONE_B.xy, PHONE_R, -PHONE_B.z, PHONE_B.z);
  float cavity = slab(q, PHONE_B.xy - .022, PHONE_R - .022, -PHONE_B.z - .05, PHONE_B.z - .016);
  float d = max(outer, -cavity);
  d = min(d, slab(q - vec3(-.17, .53, 0.0), vec2(.13), .05, PHONE_B.z - .01, PHONE_B.z + .03));
  d = min(d, roundBox(q - vec3(PHONE_B.x + .006, .32, 0.0), vec3(.008, .07, .016), .006));
  d = min(d, roundBox(q - vec3(-PHONE_B.x - .006, .38, 0.0), vec3(.008, .045, .016), .006));
  d = min(d, roundBox(q - vec3(-PHONE_B.x - .006, .24, 0.0), vec3(.008, .045, .016), .006));
  return d;
}
float internals(vec3 q) {
  float d = roundBox(q - vec3(0.0, .42, .02), vec3(.28, .24, .006), .01);
  d = min(d, roundBox(q - vec3(-.08, .46, .008), vec3(.07, .06, .012), .008));
  d = min(d, roundBox(q - vec3(.12, .36, .01), vec3(.05, .035, .01), .006));
  d = min(d, roundBox(q - vec3(.13, .53, .01), vec3(.04, .04, .01), .006));
  d = min(d, roundBox(q - vec3(0.0, -.28, .012), vec3(.27, .36, .014), .03));
  // The charging coil sits on the battery's -z face, the side the camera sees, because nothing behind the battery is ever visible. Its tube is about one character cell across when the stack is apart, so the ring does not break into isolated cells.
  vec3 c = q - vec3(0.0, -.28, -.002);
  d = min(d, length(vec2(length(c.xy) - .13, c.z)) - .014);
  return d;
}
float coach(vec3 p) {
  if (uCoach.x < .01) return 1e5;
  float bound = length(p - uCoachBound.xyz) - uCoachBound.w;
  if (bound > .1) return bound;
  float r = .022 * uCoach.y;
  float d = length(p - uJoints[0]) - .07 * uCoach.y;
  for (int i = 0; i < ${COACH_BONES.length}; i++) d = min(d, capsule(p, uJoints[BONES[i].x], uJoints[BONES[i].y], r));
  for (int i = 1; i < ${JOINT_COUNT}; i++) d = min(d, length(p - uJoints[i]) - r * 1.5);
  return d;
}
vec2 geometry(vec3 p) {
  vec3 o = p - uPhonePos;
  vec3 q = vec3(dot(o, uPhoneRight), dot(o, uPhoneUp), dot(o, uPhoneNormal));
  vec2 res = vec2(chassis(q), 1.0);
  if (uInternals > .01) { float d = internals(q); if (d < res.x) res = vec2(d, 2.0); }
  float c = coach(p);
  if (c < res.x) res = vec2(c, 3.0);
  return res;
}
vec2 sphereSpan(vec3 ro, vec3 rd, vec4 s) {
  vec3 oc = ro - s.xyz;
  float b = dot(oc, rd);
  float h = b * b - (dot(oc, oc) - s.w * s.w);
  if (h < 0.0) return vec2(1e5, -1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}
float backdrop(vec2 cellUv) {
  if (uBack.y < .002) return 0.0;
  vec2 c = cellUv - .5;
  float zoom = 1.0 - .045 * uBackDrift;
  vec2 a = c * zoom + vec2(.02 * uBackDrift, 0.0);
  vec2 ua = a, ub = a;
  if (uAspect > uBackAspect.x) ua.y *= uBackAspect.x / uAspect; else ua.x *= uAspect / uBackAspect.x;
  if (uAspect > uBackAspect.y) ub.y *= uBackAspect.y / uAspect; else ub.x *= uAspect / uBackAspect.y;
  float la = textureLod(uBackA, vec2(ua.x + .5, .5 - ua.y), uBackLod).r;
  float lb = textureLod(uBackB, vec2(ub.x + .5, .5 - ub.y), uBackLod).r;
  float l = mix(la, lb, uBack.x);
  float vignette = 1.0 - smoothstep(.35, .95, length(c * vec2(1.0, .8)));
  return pow(smoothstep(.18, .95, l), 1.15) * uBack.y * mix(.55, 1.0, vignette);
}
void main() {
  vec2 uv = gl_FragCoord.xy / uGrid * 2.0 - 1.0;
  uv.x *= uAspect;
  vec3 ro = uCamPos;
  vec3 rd = rayDir(uv, uShift);
  vec2 spanA = sphereSpan(ro, rd, uPhoneBound);
  vec2 spanB = uCoach.x > .01 ? sphereSpan(ro, rd, uCoachBound) : vec2(1e5, -1.0);
  float t = max(.01, min(spanA.x, spanB.x));
  float tEnd = min(FAR, max(spanA.y, spanB.y));
  float material = 0.0;
  if (tEnd > 0.0) {
    for (int i = 0; i < 80; i++) {
      vec2 field = geometry(ro + rd * t);
      if (field.x < .0012 * t) { material = field.y; break; }
      t += max(field.x, .003);
      if (t > tEnd) break;
    }
  }
  float light = 0.0;
  float tint = .22;
  float hitT = FAR;
  if (material > .5) {
    hitT = t;
    vec3 p = ro + rd * t;
    vec2 h = vec2(.0015 + t * .0004, 0.0);
    vec3 n = normalize(vec3(geometry(p + h.xyy).x - geometry(p - h.xyy).x, geometry(p + h.yxy).x - geometry(p - h.yxy).x, geometry(p + h.yyx).x - geometry(p - h.yyx).x));
    float diffuse = max(0.0, dot(n, LIGHT));
    float face = max(0.0, dot(n, -rd));
    float edge = pow(1.0 - face, 2.0);
    float spec = pow(max(0.0, dot(reflect(-LIGHT, n), -rd)), 18.0);
    tint = clamp(exp(-(t - 1.4) * .32), .25, 1.0);
    if (material < 1.5) light = .12 + diffuse * .45 + edge * .4 + spec * .35;
    else if (material < 2.5) light = (.1 + diffuse * .5 + edge * .3) * mix(.25, 1.0, uInternals);
    else light = (.45 + diffuse * .35 + edge * .25) * uCoach.x;
  } else {
    light = backdrop(gl_FragCoord.xy / uGrid);
  }
  // Glass never stops the march. It lights only its rim and, while the stack is apart, a moving highlight band.
  float glassLight = 0.0;
  float denom = dot(rd, uPhoneNormal);
  if (abs(denom) > 1e-4 && uGlass.x > .01) {
    float tg = dot(uGlassCenter - ro, uPhoneNormal) / denom;
    if (tg > 0.0 && tg < hitT + .01) {
      vec3 g = ro + rd * tg - uGlassCenter;
      vec2 local = vec2(dot(g, uPhoneRight), dot(g, uPhoneUp));
      float sd = roundRect(local, SCREEN_B + .012, SCREEN_R + .01);
      if (sd < 0.0) {
        float rim = 1.0 - smoothstep(0.0, .028, -sd);
        // GLSL ES gives pow() no defined result for a negative base, so the Gaussian squares by multiplication.
        float across = (local.x + local.y * .6 - uGlass.y) * 7.0;
        float band = exp(-across * across) * .35 * uGlass.z;
        glassLight = clamp((rim * .9 + band) * uGlass.x, 0.0, 1.0);
      }
    }
  }
  float v = clamp(hitT / FAR, 0.0, 1.0);
  outScene = vec4(clamp(light, 0.0, 1.0), tint, material / 8.0, glassLight);
  outDepth = vec4(floor(v * 255.0) / 255.0, fract(v * 255.0), 0.0, 1.0);
}`

/**
 * Glyph pass, per device pixel. Scene cells become ramp glyphs in the hero's
 * amber tints. Six planes (0 main screen, 1 code, 2 to 5 cards) are
 * intersected analytically at full precision. A plane draws where it is
 * nearer than the scene and inside its rounded rectangle, and develops cell
 * by cell from texture-luminance glyphs into the sharp texture.
 */
export const GLYPHS = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform sampler2D uAtlas;
uniform sampler2D uTex0;
uniform sampler2D uTex1;
uniform sampler2D uTex2;
uniform sampler2D uTex3;
uniform sampler2D uTex4;
uniform sampler2D uTex5;
uniform vec2 uGrid;
uniform vec2 uCell;
uniform vec2 uOffset;
uniform float uGlyphs;
uniform float uAspect;
uniform float uCanvasH;
uniform vec3 uCamPos;
uniform vec2 uShift;
uniform float uGather;
uniform float uScatter;
uniform vec3 uPC[6];
uniform vec3 uPR[6];
uniform vec3 uPU[6];
uniform vec3 uPS[6];
uniform vec4 uPState[6];
${COMMON}
const vec3 BG = vec3(9.0, 7.0, 5.0) / 255.0;
const vec3 FAR_TINT = vec3(.35, .24, .12);
const vec3 NEAR_TINT = vec3(.98, .69, .32);

// Sampler arrays need constant indices in GLSL ES 3.00, so slots are chosen by branch.
vec4 slot(int i, vec2 uv, float lod) {
  if (i == 0) return textureLod(uTex0, uv, lod);
  if (i == 1) return textureLod(uTex1, uv, lod);
  if (i == 2) return textureLod(uTex2, uv, lod);
  if (i == 3) return textureLod(uTex3, uv, lod);
  if (i == 4) return textureLod(uTex4, uv, lod);
  return textureLod(uTex5, uv, lod);
}
float glyphAlpha(float index, vec2 local) {
  return texture(uAtlas, vec2((index + local.x) / uGlyphs, 1.0 - local.y)).a;
}
vec2 toUv(vec2 cellCoord) {
  vec2 uv = cellCoord / uGrid * 2.0 - 1.0;
  uv.x *= uAspect;
  return uv;
}
// Nearest plane hit along a ray: x = t, y = plane index (-1 for none), zw = plane-local position in half-extents.
vec4 hitPlanes(vec3 ro, vec3 rd, out float sdOut) {
  vec4 best = vec4(1e5, -1.0, 0.0, 0.0);
  sdOut = 1.0;
  for (int i = 0; i < 6; i++) {
    if (uPState[i].y < .01) continue;
    vec3 n = cross(uPR[i], uPU[i]);
    float denom = dot(rd, n);
    // Planes seen from behind draw nothing, so the chassis back shows instead.
    if (denom < 1e-4) continue;
    float t = dot(uPC[i] - ro, n) / denom;
    if (t <= 0.0 || t >= best.x) continue;
    vec3 h = ro + rd * t - uPC[i];
    vec2 local = vec2(dot(h, uPR[i]), dot(h, uPU[i]));
    float sd = roundRect(local, uPS[i].xy, uPS[i].z);
    if (sd > 0.0) continue;
    best = vec4(t, float(i), local / uPS[i].xy);
    sdOut = sd;
  }
  return best;
}
void main() {
  vec2 p = (gl_FragCoord.xy - uOffset) / uCell;
  vec2 cell = floor(p);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uGrid.x || cell.y >= uGrid.y) { fragColor = vec4(BG, 1.0); return; }
  vec2 local = fract(p);
  // Before the arrival gather, each cell shows a glyph from a hashed nearby cell, so the phone reads as loose characters.
  vec2 src = cell;
  if (uGather < .999) src = clamp(floor(cell + (hash22(cell) - .5) * 2.0 * uScatter * (1.0 - uGather)), vec2(0.0), uGrid - 1.0);
  vec4 scene = texelFetch(uScene, ivec2(src), 0);
  vec3 color = BG;
  float index = floor(scene.r * (uGlyphs - 1.0) + .5);
  if (index > .5) {
    float material = scene.b * 8.0;
    vec3 tint = mix(FAR_TINT, NEAR_TINT, scene.g);
    if (material > 2.5) tint = mix(tint, vec3(1.0, .9, .72), .5);
    color = mix(BG, tint * (.7 + .3 * scene.r), glyphAlpha(index, local));
  }

  vec4 depthTexel = texelFetch(uDepth, ivec2(cell), 0);
  float sceneT = (depthTexel.r + depthTexel.g / 255.0) * FAR;
  vec3 ro = uCamPos;
  float sd;
  vec4 hit = hitPlanes(ro, rayDir(toUv(p), uShift), sd);
  if (hit.y > -.5 && hit.x < sceneT + .015) {
    int i = int(hit.y + .5);
    vec4 state = uPState[i];
    float pixelsPerUnit = uCanvasH * .5 * FOCAL / hit.x;
    float texelsPerPixel = (state.w / (2.0 * uPS[i].y)) / pixelsPerUnit;
    vec2 uv = vec2(hit.z * .5 + .5, .5 - hit.w * .5);
    vec3 sharp = slot(int(state.z + .5), uv, log2(max(texelsPerPixel, 1.0))).rgb;
    float sdCell;
    vec4 cellHit = hitPlanes(ro, rayDir(toUv(cell + .5), uShift), sdCell);
    vec3 glyph = BG;
    // Plane indices are compared as floats. int(y + .5) truncates toward zero, so a miss (-1) would become plane 0.
    if (abs(cellHit.y - hit.y) < .5) {
      vec2 cuv = vec2(cellHit.z * .5 + .5, .5 - cellHit.w * .5);
      float luma = dot(slot(int(state.z + .5), cuv, log2(max(texelsPerPixel * uCell.y, 1.0))).rgb, vec3(.299, .587, .114));
      float gi = floor(pow(luma, .85) * (uGlyphs - 1.0) + .5);
      if (gi > .5) glyph = mix(BG, NEAR_TINT * (.75 + .25 * luma), glyphAlpha(gi, local));
    }
    float roll = hash12(cell + float(i) * 17.0);
    float resolved = smoothstep(roll - .04, roll + .04, state.x * 1.08 - .04);
    float aa = clamp(-sd * pixelsPerUnit, 0.0, 1.0);
    color = mix(color, mix(glyph, sharp, resolved), state.y * aa);
  }

  vec4 base = texelFetch(uScene, ivec2(cell), 0);
  float gIndex = floor(base.a * (uGlyphs - 1.0) + .5);
  if (gIndex > .5) color = mix(color, vec3(1.0, .93, .8), glyphAlpha(gIndex, local) * .85);
  fragColor = vec4(color, 1.0);
}`
