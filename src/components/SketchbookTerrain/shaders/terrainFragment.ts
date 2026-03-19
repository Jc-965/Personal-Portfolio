export const terrainFragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying float vHeight;
varying vec3 vWorldPosition;
varying float vMoisture;
varying float vDrainage;
varying float vMeadow;

uniform float uTime;

void main() {
  vec3 lightDir = normalize(vec3(0.36, 0.86, 0.32));
  vec3 n = normalize(vNormal);
  float diffuse = dot(n, lightDir) * 0.5 + 0.5;
  float steepness = 1.0 - abs(n.y);
  float h = vHeight;
  float wetness = clamp(vMoisture * 0.8 + vDrainage * 0.54 - smoothstep(6.0, 14.0, h) * 0.18, 0.0, 1.0);
  float rockMask = clamp(
    smoothstep(0.2, 0.72, steepness) + smoothstep(7.0, 15.5, h) * 0.34 - wetness * 0.18,
    0.0,
    1.0
  );

  vec3 deepWater = vec3(0.16, 0.39, 0.62);
  vec3 shallowWater = vec3(0.49, 0.72, 0.86);
  vec3 wetSoil = vec3(0.42, 0.36, 0.28);
  vec3 marshGrass = vec3(0.56, 0.61, 0.34);
  vec3 forestFloor = vec3(0.32, 0.49, 0.23);
  vec3 meadowGrass = vec3(0.69, 0.78, 0.43);
  vec3 sunGrass = vec3(0.79, 0.72, 0.41);
  vec3 drySlope = vec3(0.72, 0.55, 0.31);
  vec3 ridgeRock = vec3(0.64, 0.62, 0.6);
  vec3 cliffInk = vec3(0.35, 0.31, 0.28);
  vec3 summitStone = vec3(0.74, 0.73, 0.72);
  vec3 snowCap = vec3(0.94, 0.95, 0.97);

  vec3 color = mix(wetSoil, forestFloor, smoothstep(-2.2, 3.6, h));
  color = mix(color, marshGrass, wetness * (1.0 - smoothstep(1.2, 5.8, h)));
  color = mix(color, meadowGrass, vMeadow * (1.0 - steepness * 0.8));
  color = mix(color, sunGrass, smoothstep(0.12, 0.76, vMeadow) * (1.0 - wetness) * smoothstep(2.4, 8.8, h) * 0.42);
  color = mix(color, drySlope, smoothstep(4.2, 10.8, h) * 0.56 + (1.0 - wetness) * 0.18);
  color = mix(color, ridgeRock, rockMask);
  color = mix(color, cliffInk, rockMask * 0.2);
  color = mix(color, summitStone, smoothstep(11.2, 17.8, h) * (0.16 + rockMask * 0.28));

  float waterMask = (1.0 - smoothstep(-2.2, 0.9, h)) * smoothstep(0.28, 0.64, wetness + vDrainage * 0.28);
  float deepMask = (1.0 - smoothstep(-5.8, -1.0, h)) * waterMask;
  float ripple = sin(vWorldPosition.x * 0.26 + uTime * 0.42) * sin(vWorldPosition.z * 0.19 - uTime * 0.37);
  vec3 waterColor = mix(shallowWater, deepWater, deepMask);
  waterColor += vec3(0.05, 0.07, 0.08) * ripple * waterMask;
  color = mix(color, waterColor, waterMask);

  float shoreline = waterMask * (1.0 - smoothstep(0.0, 1.4, abs(h + 0.35)));
  color = mix(color, vec3(0.83, 0.8, 0.69), shoreline * 0.38);

  if (waterMask < 0.08 && h < -1.8) {
    color = mix(wetSoil, marshGrass, smoothstep(-1.8, -0.4, h) * wetness);
  }

  float snowNoise = sin(vWorldPosition.x * 0.12 + vWorldPosition.z * 0.08) * 0.5 + 0.5;
  float snowMask = smoothstep(14.6, 19.8, h + snowNoise * 1.25);
  snowMask *= smoothstep(0.14, 0.7, rockMask + steepness * 0.82);
  color = mix(color, snowCap, snowMask * (0.62 + steepness * 0.12));

  float contour = 0.94 + sin(h * 6.0 + vWorldPosition.x * 0.06 + vWorldPosition.z * 0.04) * 0.03;
  color *= mix(contour, 1.0, max(waterMask * 0.86, snowMask * 0.34));
  float landLight = 0.56 + diffuse * 0.68;
  float waterLight = 0.82 + diffuse * 0.38 + (0.5 + ripple * 0.5) * waterMask * 0.12;
  color *= mix(landLight, waterLight, waterMask);
  color = mix(color, color * (0.94 + diffuse * 0.16), snowMask * 0.22);

  gl_FragColor = vec4(color, 1.0);
}
`
