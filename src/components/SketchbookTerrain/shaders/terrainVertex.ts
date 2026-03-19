export const terrainVertexShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform sampler2D uDeformationMap;
uniform float uDeformStrength;

varying vec2 vUv;
varying vec3 vNormal;
varying float vHeight;
varying vec3 vWorldPosition;
varying float vMoisture;
varying float vDrainage;
varying float vMeadow;

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

float remapNoise(float value) {
  return value * 0.5 + 0.5;
}

float ridgeNoise(float value) {
  return 1.0 - abs(value);
}

vec4 waterFeatures(vec2 tc) {
  float creekAxis = tc.x - tc.y * 0.34;
  float creekBend = sin(tc.y * 0.09 - 0.7) * 5.8 + sin(tc.y * 0.024 + 1.7) * 2.6 + 0.8;
  float creekDistance = abs(creekAxis - creekBend);
  float creekMask = 1.0 - smoothstep(1.1, 9.4, creekDistance);
  float creekDepth = creekMask * (2.4 + remapNoise(cnoise(tc * 0.045 + vec2(44.0, -27.0))) * 3.4);

  float tributaryAxis = tc.x + tc.y * 0.42;
  float tributaryBend = sin(tc.x * 0.058 + 1.2) * 4.4 + sin(tc.y * 0.031 - 0.6) * 2.2 - 6.0;
  float tributaryDistance = abs(tributaryAxis - tributaryBend);
  float tributaryMask = 1.0 - smoothstep(0.9, 7.2, tributaryDistance);
  float tributaryDepth = tributaryMask * (1.4 + remapNoise(cnoise(tc * 0.038 + vec2(-12.0, 35.0))) * 2.8);

  float lakeDistance = length(vec2((tc.x - 11.5) * 0.74, (tc.y - 17.5) * 1.02));
  float lakeMask = 1.0 - smoothstep(5.2, 16.0, lakeDistance);
  float lakeDepth = lakeMask * (3.6 + remapNoise(cnoise(tc * 0.043 + vec2(-18.0, 29.0))) * 4.2);

  float basinDistance = length(vec2((tc.x + 18.0) * 1.06, (tc.y + 7.5) * 0.84));
  float basinMask = 1.0 - smoothstep(4.6, 11.8, basinDistance);
  float basinDepth = basinMask * (2.5 + remapNoise(cnoise(tc * 0.04 + vec2(22.0, -14.0))) * 3.4);

  float gladeDistance = length(vec2((tc.x + 4.0) * 0.88, (tc.y - 1.5) * 1.18));
  float gladeMask = 1.0 - smoothstep(4.2, 11.6, gladeDistance);
  float gladeDepth = gladeMask * (4.1 + remapNoise(cnoise(tc * 0.046 + vec2(18.0, -21.0))) * 3.8);

  return vec4(
    max(creekMask, tributaryMask * 0.86),
    max(max(lakeMask, basinMask * 0.9), gladeMask),
    creekDepth + tributaryDepth + lakeDepth + basinDepth + gladeDepth,
    max(max(creekMask * 0.82, tributaryMask * 0.74), max(max(lakeMask, basinMask * 0.9), gladeMask * 0.96))
  );
}

vec2 terrainWarp(vec2 tc) {
  float primaryWarp = cnoise(tc * 0.015 + vec2(13.4, -7.2));
  float secondaryWarp = cnoise(tc * 0.029 + vec2(-4.6, 6.8));
  float tertiaryWarp = cnoise(tc * 0.027 + vec2(8.2, -2.4));
  return vec2(
    tc.x + primaryWarp * 7.5 + secondaryWarp * 3.2,
    tc.y + cnoise(tc * 0.015 + vec2(-5.1, 11.3)) * 7.5 + tertiaryWarp * 3.2
  );
}

vec4 terrainSample(vec2 tc) {
  vec2 warp = terrainWarp(tc);
  float radius = length(vec2(tc.x * 0.86, tc.y * 0.94));
  float continentalLift = remapNoise(fbm(warp * 0.006 + vec2(-21.0, 13.0))) * 4.8;
  float macro = fbm(warp * 0.016) * 6.2;
  float broadRise = remapNoise(fbm(warp * 0.009 + vec2(-10.0, 6.5))) * 3.8;
  float ridgeField = pow(clamp(ridgeNoise(cnoise(warp * 0.027)), 0.0, 1.0), 1.78) * 3.6;
  float highlandMask = smoothstep(0.46, 0.84, remapNoise(cnoise(warp * 0.018 + vec2(-16.0, 9.0))));
  float summitMask = smoothstep(0.48, 0.88, remapNoise(cnoise(warp * 0.014 + vec2(-24.0, 12.0))));
  float edgeRise = smoothstep(16.0, 60.0, radius) * 3.5;
  float mountainBands = pow(clamp(ridgeNoise(cnoise(warp * 0.043 + vec2(9.0, -13.0))), 0.0, 1.0), 2.25);
  float alpineRidges = pow(clamp(ridgeNoise(cnoise(warp * 0.062 + vec2(-11.0, 19.0))), 0.0, 1.0), 3.0);
  float mountainLift = mountainBands * (1.2 + highlandMask * 4.4 + edgeRise * 0.3 + summitMask * 2.0);
  float peakLift = alpineRidges * (0.7 + summitMask * 5.3);
  float basinShape = (1.0 - smoothstep(10.0, 42.0, length(vec2(tc.x * 0.88, tc.y * 1.02)))) * 1.4;
  float valleyMask = smoothstep(0.42, 0.82, remapNoise(cnoise(warp * 0.018 + vec2(7.0, -22.0))));
  float valleyCarve = valleyMask * remapNoise(cnoise(warp * 0.05 + vec2(-3.0, 16.0))) * 1.35;
  float drainageA = ridgeNoise(cnoise(warp * 0.022 + vec2(14.0, -9.0)));
  float drainageB = ridgeNoise(cnoise(warp * vec2(0.031, 0.039) + vec2(-17.0, 6.0)));
  float drainage = pow(clamp(drainageA * 0.68 + drainageB * 0.32 - 0.15, 0.0, 1.0), 2.0);
  float channelCarve = drainage * (1.5 + remapNoise(cnoise(warp * 0.048)) * 1.25);
  vec4 water = waterFeatures(tc);
  float foothill = remapNoise(cnoise(warp * 0.045 + vec2(1.8, -0.6))) * 2.5;
  float plateauMask = smoothstep(0.48, 0.86, remapNoise(cnoise(warp * 0.02 + vec2(-12.0, 4.0))));
  float plateau = plateauMask * 1.5;
  float mesaMask = smoothstep(0.58, 0.88, remapNoise(cnoise(warp * 0.013 + vec2(25.0, -18.0))));
  float mesa = mesaMask * smoothstep(-0.15, 0.6, cnoise(warp * 0.024 + vec2(-9.0, 14.0))) * 2.6;
  float detail =
    cnoise(warp * 0.1) * 0.9 +
    cnoise(warp * 0.23) * 0.35 +
    cnoise(warp * 0.42 + vec2(-7.0, 4.0)) * 0.12;
  float height = macro * 0.82 + continentalLift + broadRise + ridgeField + foothill + plateau + mesa + edgeRise + mountainLift + peakLift - basinShape - valleyCarve - channelCarve - water.z + detail;
  float normalizedHeight = clamp((height + 6.5) / 28.0, 0.0, 1.0);
  float moistureNoise = remapNoise(fbm(warp * 0.018 + vec2(28.0, -18.0)));
  float moisture = clamp(0.34 + drainage * 0.54 + moistureNoise * 0.34 - normalizedHeight * 0.18 + highlandMask * 0.06 + valleyMask * 0.08 + water.w * 0.42, 0.0, 1.0);
  float meadowNoise = remapNoise(cnoise(warp * 0.024 + vec2(-14.0, 3.0)));
  float waterDrainage = clamp(max(drainage, water.x * 0.96 + water.y * 0.58), 0.0, 1.0);
  float meadow = clamp((meadowNoise - 0.42) * 2.0, 0.0, 1.0) * clamp(1.0 - waterDrainage * 0.7 - highlandMask * 0.44 - mesaMask * 0.22 - water.y * 0.58, 0.0, 1.0);
  return vec4(height, moisture, waterDrainage, meadow);
}

float terrainHeight(vec2 tc) {
  return terrainSample(tc).x;
}

float terrainHeightCoarse(vec2 tc) {
  vec2 warp = terrainWarp(tc);
  float radius = length(vec2(tc.x * 0.86, tc.y * 0.94));
  float continentalLift = remapNoise(fbm(warp * 0.006 + vec2(-21.0, 13.0))) * 4.8;
  float macro = fbm(warp * 0.016) * 6.2;
  float broadRise = remapNoise(fbm(warp * 0.009 + vec2(-10.0, 6.5))) * 3.8;
  float ridgeField = pow(clamp(ridgeNoise(cnoise(warp * 0.027)), 0.0, 1.0), 1.78) * 3.6;
  float highlandMask = smoothstep(0.46, 0.84, remapNoise(cnoise(warp * 0.018 + vec2(-16.0, 9.0))));
  float summitMask = smoothstep(0.48, 0.88, remapNoise(cnoise(warp * 0.014 + vec2(-24.0, 12.0))));
  float edgeRise = smoothstep(16.0, 60.0, radius) * 3.5;
  float mountainBands = pow(clamp(ridgeNoise(cnoise(warp * 0.043 + vec2(9.0, -13.0))), 0.0, 1.0), 2.25);
  float alpineRidges = pow(clamp(ridgeNoise(cnoise(warp * 0.062 + vec2(-11.0, 19.0))), 0.0, 1.0), 3.0);
  float mountainLift = mountainBands * (1.2 + highlandMask * 4.4 + edgeRise * 0.3 + summitMask * 2.0);
  float peakLift = alpineRidges * (0.7 + summitMask * 5.3);
  float basinShape = (1.0 - smoothstep(10.0, 42.0, length(vec2(tc.x * 0.88, tc.y * 1.02)))) * 1.4;
  float valleyMask = smoothstep(0.42, 0.82, remapNoise(cnoise(warp * 0.018 + vec2(7.0, -22.0))));
  float valleyCarve = valleyMask * remapNoise(cnoise(warp * 0.05 + vec2(-3.0, 16.0))) * 1.35;
  float drainageA = ridgeNoise(cnoise(warp * 0.022 + vec2(14.0, -9.0)));
  float drainageB = ridgeNoise(cnoise(warp * vec2(0.031, 0.039) + vec2(-17.0, 6.0)));
  float drainage = pow(clamp(drainageA * 0.68 + drainageB * 0.32 - 0.15, 0.0, 1.0), 2.0);
  float channelCarve = drainage * (1.5 + remapNoise(cnoise(warp * 0.048)) * 1.25);
  vec4 water = waterFeatures(tc);
  float foothill = remapNoise(cnoise(warp * 0.045 + vec2(1.8, -0.6))) * 2.5;
  float plateauMask = smoothstep(0.48, 0.86, remapNoise(cnoise(warp * 0.02 + vec2(-12.0, 4.0))));
  float plateau = plateauMask * 1.5;
  float mesaMask = smoothstep(0.58, 0.88, remapNoise(cnoise(warp * 0.013 + vec2(25.0, -18.0))));
  float mesa = mesaMask * smoothstep(-0.15, 0.6, cnoise(warp * 0.024 + vec2(-9.0, 14.0))) * 2.6;
  return macro * 0.82 + continentalLift + broadRise + ridgeField + foothill + plateau + mesa + edgeRise + mountainLift + peakLift - basinShape - valleyCarve - channelCarve - water.z;
}

void main() {
  vUv = uv;
  vec3 pos = position;

  vec2 tc = vec2(pos.x, -pos.y);

  vec4 terrain = terrainSample(tc);
  float h = terrain.x;
  vMoisture = terrain.y;
  vDrainage = terrain.z;
  vMeadow = terrain.w;

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
