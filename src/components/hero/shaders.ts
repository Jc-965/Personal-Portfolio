import { CAMERA, RIG } from './world'

/** Uniforms the glyph pass takes for the pointer pull and the press. */
export const POINTER_UNIFORMS = `
uniform vec2 uPointer;
uniform float uPull;
uniform float uPullRadius;
uniform float uPullDepth;
uniform vec4 uPress;
uniform float uPressPush;`

/**
 * The pointer draws the glyph field toward itself: nothing moves right under
 * it, the pull peaks a little way out and fades past the reach. Uniform
 * regions look the same, so what shows is the edges of the text leaning in.
 * The glyphs under it also step up the ramp a little. A press bumps the cells
 * around a click outward and lets them settle, the same move the page's
 * background grid makes.
 */
export const POINTER_BOOST = `
// Strength of the pull at a point, 0 to 1, peaking at about .58 of the reach.
float pullAt(vec2 at) {
  float d = distance(at, uPointer) / max(uPullRadius, 1.0);
  return d * exp(-d * d * 1.5) * 2.86 * uPull;
}
vec2 pullShiftPx(vec2 at) {
  vec2 to = uPointer - at;
  float d = length(to);
  if (d < 1.0) return vec2(0.0);
  return (to / d) * pullAt(at) * uPullDepth;
}
// uPress is (x, y, reach, strength). The push is strongest at the click and
// fades to nothing at the edge of its reach, like the grid's click.
vec2 pressShiftPx(vec2 at) {
  vec2 away = at - uPress.xy;
  float d = length(away);
  float reach = uPress.z;
  if (reach < 1.0 || d < 1.0 || d >= reach) return vec2(0.0);
  float push = (1.0 - d / reach) * uPress.w * uPressPush;
  // The innermost cells stretch outward instead of sampling across the centre.
  return (away / d) * min(push, d * .8);
}`

/** GLSL float literal, so integers never land in a mix() as ints. */
const f = (n: number) => (Number.isInteger(n) ? `${n}.0` : `${n}`)

/** World geometry is evaluated at character resolution, then drawn from a crisp glyph atlas. */
export const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

export const SCENE = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2 uGrid;
uniform float uTime;
uniform float uProgress;
uniform vec2 uLook;
uniform float uAspect;
uniform float uNarrow;
uniform sampler2D uName;
uniform vec3 uNamePos;
uniform vec2 uNameSize;
uniform float uNameSpread;
uniform float uNameReveal;
const float PI = 3.14159265;
const float FAR = 85.0;
const vec3 LIGHT = vec3(-0.48, 0.72, -0.5);

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y);
}
float terrain(vec2 p) {
  float corridor = 1.0 - exp(-pow((p.x - 4.0) * .13, 2.0));
  return -2.3 + corridor * (sin(p.x * .22) * cos(p.y * .13) * 2.6 + noise(p * .18) * 2.0);
}
float box(vec3 p, vec3 size) {
  vec3 q = abs(p) - size;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float ring(vec3 p, float radius, float thickness) {
  return length(vec2(length(p.xy) - radius, p.z)) - thickness;
}
mat2 rotate(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
float line(float v, float width) { return 1.0 - smoothstep(0.0, width, abs(fract(v + .5) - .5)); }

vec3 gateway() { return vec3(mix(${f(RIG.wide.gate.x)}, ${f(RIG.narrow.gate.x)}, uNarrow), mix(${f(RIG.wide.gate.y)}, ${f(RIG.narrow.gate.y)}, uNarrow), ${f(RIG.wide.gate.z)}); }

vec2 geometry(vec3 p) {
  vec2 res = vec2((p.y - terrain(p.xz)) * .55, 1.0);
  vec3 q = p - gateway();
  // Separate front and back rims give the opening real thickness.
  float d = min(ring(q, 5.1, .19), ring(q - vec3(0, 0, 1.35), 5.1, .19));
  d = min(d, ring(q, 5.8, .12));
  // Repeated radial ribs belong to the stationary portal, not the camera.
  float angle = atan(q.y, q.x);
  vec3 rib = vec3(length(q.xy) - 5.43, mod(angle + PI / 36.0, PI / 18.0) - PI / 36.0, q.z - .65);
  rib.y *= 5.43;
  d = min(d, box(rib, vec3(.36, .035, .7)));
  if (d < res.x) res = vec2(d, 2.0);
  // A tilted inner mechanism rotates slowly without moving the destination.
  vec3 inner = q;
  inner.xy = rotate(uTime * .035) * inner.xy;
  inner.xz = rotate(.18 * sin(uTime * .1)) * inner.xz;
  d = ring(inner, 4.65, .065);
  if (d < res.x) res = vec2(d, 3.0);
  // Near pillars frame the shot and pass the viewer quickly during travel.
  d = box(p - vec3(-7.5, 3.0, -1.0), vec3(.38, 6.0, .7));
  d = min(d, box(p - vec3(-10.0, 5.0, 22.0), vec3(.8, 9.0, 1.1)));
  d = min(d, box(p - vec3(19.0, 6.5, 32.0), vec3(.8, 11.0, 1.1)));
  if (d < res.x) res = vec2(d, 4.0);
  // The name stands as a thick slab ahead of the opening camera. Its lettering
  // is a signed distance texture, extruded into a thin plate so the side faces
  // never fill the counters from the camera's angle, and carved in from the left.
  if (uNameReveal > 0.0) {
    vec3 s = p - uNamePos;
    d = box(s, vec3(uNameSize * .5, .1));
    if (d < .5) {
      vec2 t = s.xy / uNameSize + .5;
      float letter = (textureLod(uName, vec2(t.x, 1.0 - t.y), 0.0).r - .5) * uNameSpread;
      d = max(letter, abs(s.z) - .1);
      d = max(d, s.x - uNameSize.x * (uNameReveal - .5));
    }
    if (d < res.x) res = vec2(d, 5.0);
  }
  return res;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uGrid * 2.0 - 1.0;
  uv.x *= uAspect;
  float advance = uProgress * uProgress * (3.0 - 2.0 * uProgress);
  vec3 gate = gateway();
  vec3 ro = vec3(mix(0.0, gate.x, advance), mix(${f(CAMERA.y)}, gate.y, advance), mix(${f(CAMERA.startZ)}, ${f(CAMERA.endZ)}, advance));
  // Portrait framing lifts the gateway above the introduction.
  vec3 rd = normalize(vec3(uv.x + uLook.x, uv.y + uLook.y - mix(${f(RIG.wide.tilt)}, ${f(RIG.narrow.tilt)}, uNarrow) * (1.0 - advance), ${f(CAMERA.focal)}));
  float distance = .08;
  float material = 0.0;
  for (int i = 0; i < 92; i++) {
    vec2 field = geometry(ro + rd * distance);
    if (field.x < .0028 * distance) { material = field.y; break; }
    distance += max(field.x, .015);
    if (distance > FAR) break;
  }
  float light = 0.0;
  float depth = 0.0;
  float upperLine = 1.0;
  if (material > .5) {
    vec3 p = ro + rd * distance;
    float e = .009 + distance * .0005;
    vec2 h = vec2(e, 0);
    vec3 n = normalize(vec3(geometry(p + h.xyy).x - geometry(p - h.xyy).x, geometry(p + h.yxy).x - geometry(p - h.yxy).x, geometry(p + h.yyx).x - geometry(p - h.yyx).x));
    float diffuse = max(0.0, dot(n, LIGHT));
    float face = max(0.0, dot(n, -rd));
    float edge = pow(1.0 - face, 2.0);
    depth = exp(-distance * .017);
    if (material < 1.5) {
      float grid = max(line((p.x - 2.0) * .2, .015 + distance * .0007), line(p.z * .2, .015 + distance * .0007));
      float contour = line(p.y * 2.0, .065);
      light = (.025 + diffuse * .23 + grid * .23 + contour * .13) * exp(-distance * .025);
      // A thin path leads into the opening and survives into the next scene.
      float path = exp(-abs(p.x - gate.x) * 12.0);
      light = max(light, path * .72 * depth);
    } else if (material < 3.5) {
      light = (.24 + diffuse * .5 + face * .16 + edge * .26) * depth;
      light += pow(max(0.0, dot(reflect(-LIGHT, n), -rd)), 14.0) * .3;
    } else if (material < 4.5) {
      float marks = line(p.y * .6, .055);
      light = (.045 + diffuse * .26 + edge * .3 + marks * .14) * depth;
    } else {
      // Shade each cell by how much of it the lettering covers, so edge cells
      // fall to lighter glyphs and the letterforms stay crisp at this resolution.
      vec2 t = (p.xy - uNamePos.xy) / uNameSize + .5;
      float letter = (textureLod(uName, vec2(t.x, 1.0 - t.y), 0.0).r - .5) * uNameSpread;
      float cell = distance * .7 / uGrid.y;
      float cover = clamp(.5 - letter / cell, 0.0, 1.0);
      light = (.8 + diffuse * .2 + face * .1) * mix(.12, 1.0, cover) * depth;
      float sweep = (p.x - uNamePos.x) / uNameSize.x + .5;
      light += exp(-abs(sweep - uNameReveal) * 24.0) * .5 * step(uNameReveal, .999);
      upperLine = step(uNamePos.y, p.y);
    }
  } else {
    vec2 starCell = floor(rd.xy / max(rd.z, .1) * vec2(175.0, 100.0));
    float star = step(.996, hash(starCell));
    light = star * (.15 + hash(starCell + 7.0) * .3);
    depth = .22;
  }
  fragColor = vec4(clamp(light, 0.0, 1.0), depth, material / 8.0, upperLine);
}`

export const GLYPHS = `#version 300 es
precision highp float;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform vec2 uGrid;
uniform vec2 uCell;
uniform vec2 uOffset;
uniform float uGlyphs;
${POINTER_UNIFORMS}
${POINTER_BOOST}
void main() {
  // The pointer draws the field toward itself and a press pushes it away.
  vec2 shift = (pullShiftPx(gl_FragCoord.xy) + pressShiftPx(gl_FragCoord.xy)) / uCell;
  vec2 p = (gl_FragCoord.xy - uOffset) / uCell - shift;
  vec2 cell = floor(p);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uGrid.x || cell.y >= uGrid.y) { fragColor = vec4(0); return; }
  vec4 scene = texelFetch(uScene, ivec2(cell), 0);
  // Under the pull, glyphs step up the ramp a little. Empty cells stay empty.
  float level = scene.r > .001 ? min(1.0, scene.r + pullAt(gl_FragCoord.xy) * .1) : 0.0;
  float index = floor(level * (uGlyphs - 1.0) + .5);
  if (index < .5) { fragColor = vec4(0); return; }
  float material = scene.b * 8.0;
  vec2 local = fract(p);
  float alpha = texture(uAtlas, vec2((index + local.x) / uGlyphs, 1.0 - local.y)).a;
  vec3 farTint = vec3(.35, .24, .12);
  vec3 nearTint = vec3(.98, .69, .32);
  vec3 tint = mix(farTint, nearTint, scene.g);
  float lift = .7 + .3 * scene.r;
  if (material > 1.5 && material < 3.5) tint = mix(tint, vec3(1.0, .87, .62), scene.r * .52);
  if (material > 4.5) {
    // The wordmark's own split: ivory first line, amber second.
    vec3 ink = scene.a > .5 ? vec3(.95, .9, .81) : vec3(.96, .74, .42);
    tint = mix(ink * .7, ink, scene.r);
    lift = .85 + .15 * scene.r;
  }
  fragColor = vec4(tint * lift * alpha, alpha);
}`
