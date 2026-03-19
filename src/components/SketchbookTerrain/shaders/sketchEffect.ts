export const sketchFragmentShader = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uScrollProgress;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// Multi-sample edge detection for bolder lines
float detectEdge(vec2 uv, vec2 texel) {
  // Sample at two scales for thick + thin edges
  float edge = 0.0;

  for (float s = 1.0; s <= 2.5; s += 0.75) {
    vec2 t = texel * s;
    float tl = dot(texture2D(inputBuffer, uv + vec2(-t.x, t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float t0 = dot(texture2D(inputBuffer, uv + vec2(0.0, t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tr = dot(texture2D(inputBuffer, uv + vec2(t.x, t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float ml = dot(texture2D(inputBuffer, uv + vec2(-t.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float mr = dot(texture2D(inputBuffer, uv + vec2(t.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float bl = dot(texture2D(inputBuffer, uv + vec2(-t.x, -t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float b0 = dot(texture2D(inputBuffer, uv + vec2(0.0, -t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float br = dot(texture2D(inputBuffer, uv + vec2(t.x, -t.y)).rgb, vec3(0.299, 0.587, 0.114));
    float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    float gy = -tl - 2.0*t0 - tr + bl + 2.0*b0 + br;
    edge = max(edge, sqrt(gx*gx + gy*gy));
  }
  return edge;
}

void mainImage(in vec4 inputColor, in vec2 uv, out vec4 outputColor) {
  vec2 texel = 1.0 / uResolution;
  vec4 sceneColor = texture2D(inputBuffer, uv);

  // --- Bold pencil edge outlines ---
  // Hand-drawn wobble
  float wobble = vnoise(uv * 18.0 + uTime * 0.08) * 0.004;
  float edge = detectEdge(uv + wobble, texel);

  // Lower threshold = more edges detected, bolder outlines
  float edgeLine = smoothstep(0.06, 0.15, edge);
  // Vary thickness for pencil feel
  float thicknessVar = 0.6 + vnoise(uv * 40.0 + uTime * 0.05) * 0.6;
  edgeLine *= thicknessVar;
  edgeLine = clamp(edgeLine, 0.0, 1.0);

  // --- Paper texture ---
  vec3 paper = vec3(0.94, 0.91, 0.85);
  float grain = vnoise(uv * 400.0) * 0.018;
  paper -= grain;
  // Subtle fiber texture
  float fiber = vnoise(uv * vec2(600.0, 80.0)) * 0.008;
  float fiber2 = vnoise(uv * vec2(100.0, 550.0)) * 0.006;
  // Very faint fold lines
  float creaseA = smoothstep(0.47, 0.53, sin((uv.x * 12.0 + uv.y * 1.8) + vnoise(uv * 14.0) * 1.5)) * 0.015;
  paper -= fiber;
  paper -= fiber2;
  paper -= creaseA;

  // --- Colored pencil fill ---
  float lum = dot(sceneColor.rgb, vec3(0.299, 0.587, 0.114));
  // Boost saturation for colored pencil pop
  vec3 saturated = mix(vec3(lum), sceneColor.rgb, 1.24);
  // Keep colors bright — pencil on paper look
  vec3 pencilFill = saturated * 0.9 + 0.1;

  // --- Pencil stroke texture (colored pencil grain) ---
  vec2 screenPx = uv * uResolution;
  // Diagonal hatching that follows a pencil direction
  float hatch1 = sin((screenPx.x * 0.8 + screenPx.y * 0.6) * 0.25 + vnoise(uv * 8.0) * 4.0);
  hatch1 = smoothstep(-0.2, 0.2, hatch1);
  // Cross hatch at different angle
  float hatch2 = sin((screenPx.x * -0.3 + screenPx.y * 0.9) * 0.3 + vnoise(uv * 12.0) * 3.0);
  hatch2 = smoothstep(-0.3, 0.3, hatch2);

  // Apply subtle hatching — darker areas get more hatching
  float darkness = 1.0 - lum;
  float hatchAmount = darkness * 0.12;
  pencilFill = mix(pencilFill, pencilFill * 0.88, hatch1 * hatchAmount);
  pencilFill = mix(pencilFill, pencilFill * 0.92, hatch2 * hatchAmount * 0.5);

  // --- Blend fill with paper ---
  // Preserve mist, water blues, and summit whites so the distance does not flatten back to paper white
  float isBackground = smoothstep(0.66, 0.94, lum) * (1.0 - smoothstep(0.0, 0.18, edge));
  float waterBias = smoothstep(0.03, 0.18, sceneColor.b - max(sceneColor.r, sceneColor.g) * 0.9);
  float snowBias = smoothstep(0.8, 0.96, min(sceneColor.r, min(sceneColor.g, sceneColor.b)));
  vec3 skyPaperTint = mix(paper, vec3(0.84, 0.89, 0.9), 0.42);
  vec3 skyPaper = mix(skyPaperTint, sceneColor.rgb, 0.84);
  vec3 result = mix(pencilFill, skyPaper, isBackground * 0.34);
  result = mix(result, sceneColor.rgb, isBackground * 0.08 + waterBias * 0.12 + snowBias * 0.08);
  result = mix(result, result * vec3(0.985, 1.0, 1.02), smoothstep(0.56, 0.92, lum) * 0.14);

  // --- Draw pencil outlines ---
  vec3 inkColor = vec3(0.18, 0.15, 0.12);
  result = mix(result, inkColor, edgeLine * 0.66);

  // --- Gentle vignette ---
  vec2 vigUv = uv * (1.0 - uv);
  float vig = pow(vigUv.x * vigUv.y * 16.0, 0.08);
  result = mix(result, result * vig, 0.28);

  // --- Scroll transition ---
  vec3 finalColor = mix(sceneColor.rgb, result, uScrollProgress);

  outputColor = vec4(finalColor, 1.0);
}
`
