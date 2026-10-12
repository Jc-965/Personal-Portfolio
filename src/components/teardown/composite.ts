/**
 * The chapter's final pass, one full-screen draw to the canvas. It owns the
 * room (drawn entirely in colored glyphs, with no photograph under them,
 * framed on its subject, crossing cell by cell between rooms), the opaque
 * base under it, the product layer's glyph decode, and the coach skeleton. Everything is computed in linear light and written to the
 * canvas as sRGB exactly once, here, so the renderer's own output conversion
 * stays off.
 *
 * The stage paints an opaque black base, the page's own background colour,
 * so the page's grid and graph never show through the chapter. `uEdge` sets
 * the base's fade at the stage's top and bottom and its opacity (stageEdges
 * in edges.ts): a stage entering from the page or leaving into it fades over
 * a wide edge and gains or loses its base with the scroll, and a stage that
 * meets another chapter keeps a hard, opaque edge so no page shows between
 * them. The pass composites
 * its layers back to front as premultiplied colour and writes that colour
 * and alpha, which is what a context created with premultipliedAlpha
 * expects, so glyph edges carry no dark fringe.
 * The room's glyphs print in cell by cell from the product's place at the chapter's start, and both
 * dissolve back into it at the end (`uReveal`). Its glyph rim is dithered
 * into the base, and the room fades over its own SEAM. The product
 * and the coach do not fade there, since the rig keeps them inside the
 * chapter.
 *
 * `uProduct` is the product render target: linear, premultiplied by
 * coverage, the same size as the canvas, and mipmapped. Room textures are
 * sRGB with mipmaps and `flipY`, so texture v runs bottom to top and focus
 * points arrive with y already flipped to match. Device pixels here are
 * drawing-buffer pixels, CSS pixels times the renderer's pixel ratio.
 */
import * as THREE from 'three'
import { COACH_BONES } from './coach'
import { GLSL_COMMON, glslFloat, CHAPTER_RAMP } from './materials'
import { SCATTER_CELLS } from './rig'
import { SEAM } from './edges'

const BONES = COACH_BONES.length
const RAMP = Array.from(CHAPTER_RAMP)
/** Densest glyph the product decode draws. The decode phase stays fine and bright, so it stops short of the block tail. */
const DECODE_TOP = RAMP.indexOf('O')
/** Densest glyph a flat room surface reaches. Only an object edge goes past it, up to ROOM_EDGE_TOP. */
const ROOM_FLAT_TOP = RAMP.indexOf('o')
/** Densest glyph any room cell draws. From % up the glyphs fill their cells, and a run of them reads as a bar, not a picture. */
const ROOM_EDGE_TOP = RAMP.indexOf('#')
/** The centred dot, drawn faintly along the coach's bones. */
const DOT = RAMP.indexOf('·')
/** --td-amber #eab76a in linear light, the default uTint. A chapter theme passes its own. */
export const TINT: readonly [number, number, number] = [0.8228, 0.4735, 0.1441]

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
uniform vec4 uLevels;
uniform vec2 uMirror;
uniform float uBackMix;
uniform float uBackGain;
uniform float uGlyphOnly;
uniform vec3 uTint;
uniform vec3 uGrade;
uniform float uReveal;
uniform vec2 uRevealAt;
uniform vec4 uCopyMask;
uniform vec3 uEdge;
uniform float uCopyNarrow;
uniform float uPixelRatio;
uniform sampler2D uProduct;
uniform vec2 uPointer;
uniform float uDecode;
uniform float uGather;
uniform sampler2D uAtlas;
uniform float uGlyphs;
uniform vec2 uCell;
uniform vec2 uRes;
uniform vec4 uBones[${BONES}];
uniform vec3 uHead;
uniform float uCoach;
out vec4 fragColor;
${GLSL_COMMON}
const vec3 IVORY = vec3(1.0, .9, .72);
// --td-amber #eab76a in linear light.
const vec3 AMBER = vec3(.8228, .4735, .1441);
const vec3 LUMA = vec3(.2126, .7152, .0722);

// Identity up to .8 per channel, so unlit screen colours pass unchanged, then an asymptote at 1.0 for lit highlights.
vec3 shoulder(vec3 c) {
  vec3 x = max(c - .8, 0.0);
  return min(c, vec3(.8)) + x / (1.0 + x / .2);
}

// Value noise, 0 to 1, smooth between integer lattice points.
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Scan order for canvas point q (0 to 1, y up): 0 at the top left corner, 1 at the bottom right. tilt is the weight of x.
float sweep(vec2 q, float tilt) {
  return clamp(q.x * tilt + (1.0 - q.y) * (1.0 - tilt), 0.0, 1.0);
}

float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  return length(pa - ba * clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0));
}

// Premultiplied source-over: layer on top of under. A layer of vec4(0.0, 0.0, 0.0, a) darkens what is beneath by a.
vec4 over(vec4 under, vec4 layer) {
  return layer + under * (1.0 - layer.a);
}

// A tint laid over everything beneath at weight t, as mix(under, tint, t) was against the opaque stage.
vec4 tint(vec4 under, vec3 color, float t) {
  return over(under, vec4(color, 1.0) * t);
}

// The window onto a room photograph in texture units: cover-fitted with 20% overscan, so most of each photograph
// is in frame and the focus point can move the window by up to .1 either way on the fitted axis to centre its
// subject.
vec2 roomSize(float aspect) {
  float screenAspect = uRes.x / uRes.y;
  vec2 size = screenAspect > aspect ? vec2(1.0, aspect / screenAspect) : vec2(screenAspect / aspect, 1.0);
  return size * .8;
}

// How far the room shifts against the pointer at the stage's edges, in texture units: about a sixth of the old
// parallax, enough that the phone visibly floats in front of the room when the hand moves.
const vec2 PARALLAX = vec2(.012, .008);

// The window's texture coordinate at canvas point q. The window is centred on the focus point, held inside the
// photograph by half the window, a .004 edge pad, and the parallax, and shifts only against the pointer. Scroll
// never moves the room: background motion independent of the visitor's hand reads as the floor moving, which is
// the motion that made visitors queasy.
vec2 roomUv(vec2 size, vec2 focus, vec2 q) {
  vec2 margin = size * .5 + .004 + PARALLAX;
  return clamp(focus, margin, 1.0 - margin) - uPointer * PARALLAX + (q - .5) * size;
}

// log2 of photo texels per device pixel. Negative when the photo is smaller than the frame.
float roomLod(sampler2D tex, vec2 size) {
  return log2(max(size.y * float(textureSize(tex, 0).y) / uRes.y, 1e-3));
}

// The window onto a room at canvas point q: the texture coordinate in xy and, in z, the lod at which one texel
// covers one glyph cell. A mirrored room (mirror 1) samples the photograph flipped left to right, and its focus
// counts on the flipped image.
vec3 roomWindow(sampler2D tex, float aspect, vec2 focus, float mirror, vec2 q) {
  vec2 size = roomSize(aspect);
  vec2 uv = roomUv(size, focus, q);
  uv.x = mix(uv.x, 1.0 - uv.x, mirror);
  return vec3(uv, max(roomLod(tex, size) + log2(sqrt(uCell.x * uCell.y)), 0.0));
}

// The photograph's mean colour over the glyph cell at canvas point q, and in w its local contrast: how far the cell's
// lightness sits from the mean of a patch about six cells across around it. That patch is wide enough that the
// term scores the edges of objects (a mug's rim, a pill box, the back of a chair) and not the grain of a surface.
vec4 roomCell(sampler2D tex, float aspect, vec2 focus, float mirror, vec2 q) {
  vec3 w = roomWindow(tex, aspect, focus, mirror, q);
  vec3 tone = textureLod(tex, w.xy, w.z).rgb;
  vec3 around = textureLod(tex, w.xy, w.z + 2.5).rgb;
  return vec4(tone, abs(lightness(tone) - lightness(around)));
}

// Glyph ink for a cell colour: saturation up by half, then a brightness lift that is largest for the darkest
// cells, up to 2.2x, since a glyph's strokes cover only part of its cell, the photographs are dim, and the glyphs
// alone carry the room. The lift
// scales every channel as one and stops where the largest reaches 1.0, so the hue holds: sky stays blue and wood
// stays warm, only more vivid than the photograph.
vec3 ink(vec3 tone) {
  vec3 c = max(mix(vec3(dot(tone, LUMA)), tone, 1.5), 0.0);
  float v = max(max(c.r, max(c.g, c.b)), 1e-3);
  return c * min(min(1.45 * pow(v, -.4), 2.2), 1.0 / v);
}

// How much of the room survives behind the copy, 1 where the copy is absent. uCopyMask is the right edge x of the
// copy block's ink from the left, the block's top and bottom y from the top, and the strength, all in device px.
// Wide stages shade only the copy block's own band, feathered over 80 CSS px above and below it, so the rest of
// the column keeps its room. Across, the ramp runs from 100 CSS px inside the ink's edge to 100 px past it, so the
// room's subject in the gap between the copy and the phone (the hands, at 1440 by 900) keeps its glyphs. The wide
// floor of .3 holds the evening table's lit band under the close act's chips, which have no scrim of their own. Narrow
// stages (uCopyNarrow 1) shade from 130 CSS px above the rail's top to 12 px below it, to a floor of .12, so no
// bright row of the room runs through the eyebrow or the first line. The coach copy rises about 108 px over its
// act, and at a 90 px lead and a .25 floor its amber eyebrow sat on the chair seat's amber glyphs. teardown.css
// draws a bottom gradient under the rest of the phone layout's copy.
float copyShade() {
  if (uCopyMask.w <= 0.0) return 1.0;
  float px = uPixelRatio;
  float y = uRes.y - gl_FragCoord.y;
  float lit;
  if (uCopyNarrow > .5) {
    lit = mix(1.0, .12, smoothstep(uCopyMask.y - 130.0 * px, uCopyMask.y + 12.0 * px, y));
  } else {
    float band = smoothstep(uCopyMask.y - 80.0 * px, uCopyMask.y, y) * (1.0 - smoothstep(uCopyMask.z, uCopyMask.z + 80.0 * px, y));
    lit = mix(1.0, mix(.3, 1.0, smoothstep(uCopyMask.x - 100.0 * px, uCopyMask.x + 100.0 * px, gl_FragCoord.x)), band);
  }
  return mix(1.0, lit, min(uCopyMask.w, 1.0));
}

void main() {
  vec2 s = gl_FragCoord.xy / uRes;
  vec2 grid = gl_FragCoord.xy / uCell;
  vec2 cell = floor(grid);
  vec2 local = fract(grid);
  vec2 sc = (cell + .5) * uCell / uRes;

  // The room is its glyphs alone, with a straight colour and a coverage that carries the gain, the vignette, the
  // copy mask, and the seam fade. It is laid over the black base by coverage, so a dim room is a sparse one. No
  // photograph sits under the glyphs: a softened copy of the picture there read as a filter instead of a room made
  // of characters.
  vec3 roomInk = vec3(0.0);
  float roomCover = 0.0;
  if (uBackGain > .002 && uReveal > .002) {
    // Glyph cells cross from room A to room B in a diagonal order from the top left, loosened by a sixth of hash,
    // each over 60% of the dissolve. The band is wide so the front is a soft slope across the frame, never a hard
    // wipe, and the small hash share keeps the front from sparkling.
    float swap = uBackMix;
    if (uBackMix > 0.0 && uBackMix < 1.0) swap = staggered(sweep(sc, .55) * .84 + hash12(cell * 1.37) * .16, .6, uBackMix);
    vec4 tone = vec4(0.0);
    if (swap < 1.0) tone += roomCell(uBackA, uBackAspect.x, uFocus.xy, uMirror.x, sc) * (1.0 - swap);
    if (swap > 0.0) tone += roomCell(uBackB, uBackAspect.y, uFocus.zw, uMirror.y, sc) * swap;

    // Density follows the cell's lightness within the room's own levels (uLevels), from a bare dot in the shadows
    // to the open o on its brightest lit surface, so each dim photograph spans the whole ramp and its tones carry
    // across the frame instead of breaking into lit patches on black. A flat surface never passes ROOM_FLAT_TOP,
    // so a window or a lamp is a field of rings and not a solid bar. An object edge (tone.a from roomCell) adds up
    // to .45 and may reach ROOM_EDGE_TOP, so the outlines of the mug, the pill box, the glasses, and the chair read
    // as the picture's lines. Glare is the photograph's absolute lightness from .5 to .78, never the level-relative
    // l, so it marks the lit windows, panes, and table (.64 to .75) in every room and leaves the hands' knuckle
    // highlights (.28 to .40, l up to .94 in their dim levels) their whole edge share and coverage. Glare cuts the
    // edge's share by up to 90%, since the grain inside a bright window scores as an edge too, and steps the cell
    // down the ramp toward the colon, which a fully glared cell prints. Every lit cell keeps a glyph, so a window
    // or the evening table reads as one even, fine stipple that carries its light. Dropping
    // glared cells on a per-cell hash printed them as random static. The contours are dark cells with no glare
    // (the chair back, the mug rim, the mullions), so they keep their o and # glyphs and cross the stipple. Cells
    // near the bottom of the levels stay empty, so the deepest shadows read as the stage itself, except on an
    // object edge, which prints whatever its lightness, so a dark subject (the mug's body, the forearms, the back
    // of the armchair) keeps its whole outline and not only its lit side. A held room (uGlyphOnly 1) caps its edges at the flat ceiling, so an outline is a dotted
    // contour of o and never a solid bar of # behind the exploded stack.
    vec2 levels = mix(uLevels.xy, uLevels.zw, swap);
    float l = smoothstep(levels.x, levels.y, lightness(tone.rgb));
    float glare = smoothstep(.5, .78, lightness(tone.rgb));
    float edge = smoothstep(.025, .1, tone.a);
    float flatTop = ${glslFloat(ROOM_FLAT_TOP)} / (uGlyphs - 1.0);
    float fill = min(.08 + .45 * pow(l, .85), flatTop);
    float level = min(fill + .45 * edge * (1.0 - .9 * glare), ${glslFloat(ROOM_EDGE_TOP)} / (uGlyphs - 1.0));
    level = mix(level, min(level, flatTop), uGlyphOnly);
    level = mix(level, ${glslFloat(RAMP.indexOf(':'))} / (uGlyphs - 1.0), glare);
    float alpha = glyphMask(uAtlas, uGlyphs, glyphIndex(level, uGlyphs), local);
    float body = max(smoothstep(.03, .14, l), edge);
    float shimmer = 1.0 + .4 * swap * (1.0 - swap);
    roomInk = ink(tone.rgb) * shimmer * uGrade;
    // Static grain of 2% per cell, fixed to the cell grid. It never animates.
    roomInk *= 1.0 + (hash12(cell + 41.7) - .5) * .04;
    // A gentle S-curve in perceptual space adds a little contrast without crushing the shadows or the mid-tones
    // that carry the room's shapes.
    vec3 p = clamp(sqrt(roomInk), 0.0, 1.0);
    p = mix(p, p * p * (3.0 - 2.0 * p), .15);
    roomInk = p * p;
    // An edge on a dark subject takes at least a quarter of the amber, so its outline stays visible over the
    // near-black page instead of printing as near-black glyphs.
    roomInk = max(roomInk, uTint * .25 * edge);
    // A held room (uGlyphOnly 1) keeps only the glyphs on object edges, so the field behind the exploded stack is
    // the previous room's outlines and never a scatter of dense clusters from its flat surfaces.
    roomCover = alpha * body * uBackGain * mix(1.0, smoothstep(.02, .1, tone.a), uGlyphOnly);
  }
  float seam = smoothstep(0.0, ${glslFloat(SEAM)}, s.y) * smoothstep(0.0, ${glslFloat(SEAM)}, 1.0 - s.y);
  float shade = copyShade();
  float r = length((s - .5) * 2.0) * .7071;
  // The room's rim. The glyphs thin toward the frame's edges and over the seams, so the picture holds around its
  // subject, which the focus point keeps near the middle. The rim is dithered cell by cell: each cell drops out at
  // its own point along the fall, so the rim is a scatter of characters, the way the room's own deep shadows
  // already end, and never a soft gradient edge.
  float fall = (1.0 - .4 * smoothstep(.3, 1.0, r)) * seam;
  float rim = smoothstep(0.0, .5, fall - hash12(cell + 17.9) * .5);
  // The room prints in from the product's place at the chapter's start and dissolves back into it at the end,
  // each glyph cell over half of the reveal in order of its distance from the product, loosened by a fifth of
  // hash, so the front is a wide soft ring growing out of the dark around the forming phone.
  float printed = uReveal;
  if (uReveal < 1.0) {
    float reach = clamp(distance(gl_FragCoord.xy, uRevealAt) / (.8 * length(uRes)), 0.0, 1.0) * .8;
    printed = staggered(reach + hash12(cell * 1.91 + 5.3) * .2, .5, uReveal);
  }
  roomCover *= rim * shade * printed;

  vec4 product = texelFetch(uProduct, ivec2(gl_FragCoord.xy), 0);
  if (uDecode < 1.0) {
    // Before the gather completes, each cell draws the product as seen from a nearby cell. The offset is mostly a
    // smooth flow over about 55 cells, so the loose characters stream in as coherent fragments instead of static.
    vec2 src = cell;
    if (uGather < .999) {
      vec2 flow = vec2(vnoise(cell * .018), vnoise(cell * .018 + 31.7)) * 2.0 - 1.0;
      vec2 jitter = hash22(cell) * 2.0 - 1.0;
      src = floor(cell + (flow * .75 + jitter * .25) * ${glslFloat(SCATTER_CELLS)} * (1.0 - uGather));
    }
    vec4 sampled = textureLod(uProduct, (src + .5) * uCell / uRes, log2(sqrt(uCell.x * uCell.y)));
    vec3 tone = sampled.rgb / max(sampled.a, 1e-4);
    float l = lightness(tone);
    // Every covered cell draws at least a light glyph, so the forming phone reads as one body of characters. A
    // cell takes its own hue where it has one, so the screen's teal and blue survive, and the grey of the body
    // takes the room's amber instead of white, so the characters belong to the room rather than to static. The
    // plume's alpha is the gather itself, so the arrival forms from nothing and the close scatters to nothing. A
    // floor here kept the dissolved phone's cloud on screen after the stage unpinned.
    float level = mix(.28, 1.0, l) * ${glslFloat(DECODE_TOP)} / (uGlyphs - 1.0);
    float alpha = glyphMask(uAtlas, uGlyphs, glyphIndex(level, uGlyphs), local) * sampled.a * uGather;
    float top = max(max(tone.r, max(tone.g, tone.b)), 1e-3);
    float chroma = (top - min(min(tone.r, tone.g), tone.b)) / top;
    vec3 hue = mix(uTint * 1.1, tone / top, smoothstep(.1, .4, chroma)) * mix(.5, 1.3, l);
    // Cells resolve in a diagonal scan with a little jitter, each over a third of the decode, brightest at the front.
    // The front's lift stays under the shoulder, so the scan reads as amber and never clips to a white cluster.
    float resolved = staggered(clamp(sweep(sc, .3) * .94 + hash12(cell + 7.31) * .06, 0.0, 1.0), .33, uDecode);
    vec4 glyph = vec4(hue * (1.0 + 0.6 * resolved * (1.0 - resolved)) * alpha, alpha);
    product = mix(glyph, product, resolved);
  }
  product.rgb = shoulder(product.rgb);

  // Back to front: the opaque black base, the room's glyphs on it with the copy mask's shade already in their
  // coverage, and the product over all of it, pixel for pixel. There is no glow: a blurred copy of the product
  // laid over the page read as a soft-focus filter.
  // The base's own edges: uEdge.x of the stage height at the top and uEdge.y at the bottom, at opacity uEdge.z.
  float baseSeam = smoothstep(0.0, max(uEdge.y, 1e-4), s.y) * smoothstep(0.0, max(uEdge.x, 1e-4), 1.0 - s.y);
  vec4 color = vec4(0.0, 0.0, 0.0, baseSeam * uEdge.z);
  color = over(color, vec4(roomInk * roomCover, roomCover));
  color = over(color, product);

  if (uCoach > .01) {
    // A pose-tracking overlay at fixed CSS sizes: 1.6 px amber bones, ivory rings of 4 px radius and 1.2 px stroke
    // at the joints and around the head, a 2 px dark keyline, a 20% amber glow, and faint dots in the cells along
    // each bone. Bones stop at the ring's centreline, so each joint reads as a separate marker.
    float px = uPixelRatio;
    vec2 p = gl_FragCoord.xy;
    vec2 pc = (cell + .5) * uCell;
    float bone = 1e5;
    float boneCell = 1e5;
    float joint = 1e5;
    for (int i = 0; i < ${BONES}; i++) {
      vec2 a = uBones[i].xy;
      vec2 b = uBones[i].zw;
      bone = min(bone, segment(p, a, b));
      boneCell = min(boneCell, segment(pc, a, b));
      joint = min(joint, min(distance(p, a), distance(p, b)));
    }
    float ring = min(abs(joint - 4.0 * px), abs(distance(p, uHead.xy) - uHead.z));
    float inside = 1.0 - smoothstep(4.0 * px - 1.0, 4.0 * px, joint);
    float boneCover = clamp(.8 * px + .5 - bone, 0.0, 1.0) * (1.0 - inside);
    float ringCover = clamp(.6 * px + .5 - ring, 0.0, 1.0);
    // Inside a ring only the ring counts, so the cleared bone adds no glow there and the ring keeps a dark centre.
    float near = min(mix(bone, 1e5, inside), ring);
    float glow = .2 * exp(-near * near / (25.0 * px * px)) * (1.0 - .7 * inside);
    float keyline = max(1.0 - smoothstep(px, 3.0 * px, near), inside);
    float dots = glyphMask(uAtlas, uGlyphs, ${glslFloat(DOT)}, local) * .3 * (1.0 - smoothstep(.3, 1.2, boneCell / uCell.y));
    float k = uCoach;
    color = over(color, vec4(0.0, 0.0, 0.0, .35 * keyline * k));
    color = tint(color, AMBER, glow * k);
    color = tint(color, AMBER, dots * k);
    color = tint(color, AMBER, boneCover * k);
    color = tint(color, IVORY, ringCover * k);
  }

  // Straight colour for the sRGB curve, then premultiplied again. The clamp against alpha keeps a bright
  // anti-aliased edge of the lit product, whose premultiplied colour can exceed its coverage, from adding light.
  color = clamp(color, 0.0, 1.0);
  vec3 straight = min(color.rgb / max(color.a, 1e-4), 1.0);
  vec3 srgb = mix(straight * 12.92, 1.055 * pow(straight, vec3(1.0 / 2.4)) - .055, step(.0031308, straight));
  // Half a code value of noise breaks up banding in the dark room gradients and the vignette. It scales with
  // alpha, so a clear pixel stays exactly clear.
  srgb = clamp(srgb + (hash12(gl_FragCoord.xy) - .5) / 255.0, 0.0, 1.0);
  fragColor = vec4(srgb * color.a, color.a);
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
 * bone, origin bottom left), and `uHead` (centre and radius). `uFocus` holds
 * room A's focus then room B's, x from the left and y from the bottom, 0 to 1.
 * `uLevels` holds room A's lightness levels (low, high) then room B's, and
 * `uMirror` is 1 for each room drawn flipped left to right, else 0.
 * `uBackGain` scales the room's coverage, 1 for fully opaque glyphs.
 * `uGlyphOnly` thins the room to its object outlines, 0 for the full room
 * and 1 for the outline-only field an act without a room holds. `uReveal` is the room's print-in, 0 for no
 * room and 1 for the whole room, from the rig's `backdrop.reveal`, and
 * `uRevealAt` is the device pixel the print grows out from and dissolves
 * back into, the product's projected centre.
 * `uCopyMask` is the right edge x of the copy block's ink from the left, the
 * block's top and bottom y from the top, and a strength from 0 to 1. At
 * strength 0 the room is untouched. `uCopyNarrow` is 1 on phone stages, which
 * read only the top. Wide darkens the room left of the edge within the
 * block's band, narrow darkens it from 130 CSS px above the top downward. `uLimb` is
 * kept for callers and not read, since the coach draws at fixed CSS sizes.
 * `uPixelRatio` is set from the renderer before every draw. `uTint` is the
 * linear colour of the decode's untinted glyphs and the room's edge floor,
 * TINT by default, and `uGrade` scales the room's ink per channel, 1 by
 * default, so a chapter can grade its rooms toward its palette. `uEdge`
 * is the base's top fade and bottom fade, as fractions of the stage height,
 * and its opacity. The default (SEAM, SEAM, 1) is an opaque base fading over
 * the room's own seam.
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
      uLevels: { value: new THREE.Vector4(0, 1, 0, 1) },
      uMirror: { value: new THREE.Vector2() },
      uBackMix: { value: 0 },
      uBackGain: { value: 0 },
      uGlyphOnly: { value: 0 },
      uTint: { value: new THREE.Vector3(...TINT) },
      uGrade: { value: new THREE.Vector3(1, 1, 1) },
      uReveal: { value: 0 },
      uRevealAt: { value: new THREE.Vector2() },
      uCopyMask: { value: new THREE.Vector4(0, 0, 0, 0) },
      uCopyNarrow: { value: 0 },
      uEdge: { value: new THREE.Vector3(SEAM, SEAM, 1) },
      uPixelRatio: { value: 1 },
      uProduct: { value: null },
      uPointer: { value: new THREE.Vector2() },
      uDecode: { value: 1 },
      uGather: { value: 1 },
      uAtlas: { value: null },
      uGlyphs: { value: RAMP.length },
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
  quad.onBeforeRender = (renderer) => { material.uniforms.uPixelRatio.value = renderer.getPixelRatio() }
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
