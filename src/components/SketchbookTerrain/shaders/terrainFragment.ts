export const terrainFragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUv;
varying vec3 vNormal;
varying float vHeight;
varying vec3 vWorldPosition;

uniform float uTime;

void main() {
  vec3 lightDir = normalize(vec3(0.4, 0.8, 0.3));
  vec3 n = normalize(vNormal);
  float diffuse = dot(n, lightDir) * 0.5 + 0.5;
  float steepness = 1.0 - abs(n.y);

  vec3 color;
  float h = vHeight;

  if (h < -1.5) {
    color = vec3(0.17, 0.44, 0.71);
  } else if (h < -0.3) {
    float t = smoothstep(-1.5, -0.3, h);
    color = mix(vec3(0.24, 0.52, 0.74), vec3(0.42, 0.58, 0.32), t);
  } else if (h < 0.5) {
    float t = smoothstep(-0.3, 0.5, h);
    color = mix(vec3(0.56, 0.54, 0.32), vec3(0.30, 0.58, 0.22), t);
  } else if (h < 3.5) {
    float t = smoothstep(0.5, 3.5, h);
    color = mix(vec3(0.24, 0.60, 0.22), vec3(0.20, 0.52, 0.18), t);
  } else if (h < 5.5) {
    float t = smoothstep(3.5, 5.5, h);
    color = mix(vec3(0.30, 0.50, 0.22), vec3(0.55, 0.45, 0.28), t);
  } else if (h < 7.5) {
    float t = smoothstep(5.5, 7.5, h);
    color = mix(vec3(0.55, 0.44, 0.30), vec3(0.68, 0.62, 0.52), t);
  } else {
    color = vec3(0.82, 0.80, 0.76);
  }

  // Steep slopes — darker rocky appearance
  if (steepness > 0.3 && h > 0.0) {
    color = mix(color, vec3(0.40, 0.34, 0.25), smoothstep(0.3, 0.7, steepness) * 0.5);
  }

  // Strong lighting for visible terrain shape
  color *= (0.55 + diffuse * 0.62);

  gl_FragColor = vec4(color, 1.0);
}
`
