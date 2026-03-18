export const terrainVertexShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform sampler2D uDeformationMap;
uniform float uDeformStrength;

varying vec2 vUv;
varying vec3 vNormal;
varying float vHeight;
varying vec3 vWorldPosition;

// Noise functions
vec4 mod289(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t*t*t*(t*(t*6.0-15.0)+10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0,0.0,1.0,1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0,0.0,1.0,1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz, iy = Pi.yyww;
  vec4 fx = Pf.xzxz, fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0/41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x), g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z), g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00,g00), dot(g01,g01), dot(g10,g10), dot(g11,g11)));
  g00 *= norm.x; g01 *= norm.y; g10 *= norm.z; g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  float freq = 1.0;
  for (int i = 0; i < 6; i++) {
    value += amp * cnoise(p * freq);
    freq *= 1.95;
    amp *= 0.5;
  }
  return value;
}

float terrainHeight(vec2 tc) {
  float h = fbm(tc * 0.04 + 1.0) * 7.0;
  h += cnoise(tc * 0.08) * 2.5;
  h += cnoise(tc * 0.2) * 1.0;
  h += cnoise(tc * 0.5) * 0.3;
  return h;
}

float terrainHeightCoarse(vec2 tc) {
  float h = fbm(tc * 0.04 + 1.0) * 7.0;
  h += cnoise(tc * 0.08) * 2.5;
  return h;
}

void main() {
  vUv = uv;
  vec3 pos = position;

  vec2 tc = vec2(pos.x, -pos.y);

  float h = terrainHeight(tc);
  h += cnoise(tc * 0.03 + uTime * 0.005) * 1.0;

  float deformRaw = texture2D(uDeformationMap, uv).r;
  float deform = (deformRaw - 0.502) * (255.0 / 12.8);
  h += deform * uDeformStrength;

  pos.z = h;
  vHeight = h;
  vWorldPosition = (modelMatrix * vec4(pos, 1.0)).xyz;

  float eps = 0.8;
  float hL = terrainHeightCoarse(tc + vec2(-eps, 0.0));
  float hR = terrainHeightCoarse(tc + vec2(eps, 0.0));
  float hD = terrainHeightCoarse(tc + vec2(0.0, -eps));
  float hU = terrainHeightCoarse(tc + vec2(0.0, eps));

  vec3 localNormal = normalize(vec3(hL - hR, hD - hU, 2.0 * eps));
  vNormal = normalize((modelMatrix * vec4(localNormal, 0.0)).xyz);

  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`
