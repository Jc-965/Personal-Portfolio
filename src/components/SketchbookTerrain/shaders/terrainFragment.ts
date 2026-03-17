export const terrainFragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying float vHeight;
varying vec3 vWorldPosition;

uniform float uTime;

void main() {
  vec3 lightDir = normalize(vec3(0.4, 0.8, 0.3));
  float diffuse = dot(vNormal, lightDir) * 0.5 + 0.5;
  float steepness = 1.0 - abs(vNormal.y);

  // Bold, saturated landscape colors — need to survive sketch post-processing
  vec3 color;
  float h = vHeight;

  if (h < -2.0) {
    // Deep water — strong blue
    color = vec3(0.18, 0.38, 0.62);
  } else if (h < -0.5) {
    // Shallow water to shore
    float t = smoothstep(-2.0, -0.5, h);
    color = mix(vec3(0.22, 0.45, 0.68), vec3(0.50, 0.58, 0.38), t);
  } else if (h < 1.5) {
    // Beach / low grass — warm sandy to green
    float t = smoothstep(-0.5, 1.5, h);
    color = mix(vec3(0.60, 0.55, 0.35), vec3(0.30, 0.55, 0.20), t);
  } else if (h < 4.0) {
    // Lush grasslands — vivid greens
    float t = smoothstep(1.5, 4.0, h);
    color = mix(vec3(0.28, 0.52, 0.18), vec3(0.35, 0.48, 0.16), t);
  } else if (h < 7.0) {
    // Hills — green to warm ochre/brown
    float t = smoothstep(4.0, 7.0, h);
    color = mix(vec3(0.38, 0.48, 0.20), vec3(0.60, 0.45, 0.25), t);
  } else if (h < 11.0) {
    // High terrain — rocky brown/gray
    float t = smoothstep(7.0, 11.0, h);
    color = mix(vec3(0.55, 0.45, 0.30), vec3(0.70, 0.66, 0.58), t);
  } else {
    // Peaks — snow
    color = vec3(0.90, 0.88, 0.84);
  }

  // Steep slopes — darker rocky appearance
  if (steepness > 0.3 && h > 0.0) {
    color = mix(color, vec3(0.40, 0.34, 0.25), smoothstep(0.3, 0.7, steepness) * 0.5);
  }

  // Strong lighting for visible terrain shape
  color *= (0.45 + diffuse * 0.60);

  gl_FragColor = vec4(color, 1.0);
}
`
