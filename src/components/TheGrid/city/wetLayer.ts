import type { MeshStandardMaterial } from 'three'

/** Common world-space water mask, including vertical splash falloff at the kerb. */
export const wetLayerGLSL = /* glsl */ `
  float wetHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float wetNoise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(wetHash(i),wetHash(i+vec2(1.,0.)),f.x),
      mix(wetHash(i+vec2(0.,1.)),wetHash(i+vec2(1.)),f.x),f.y);
  }
  float surfaceWetness(vec3 p) {
    return (0.18 + 0.82 * smoothstep(0.42, 0.66, wetNoise(p.xz * 0.18)))
      * (1.0 - smoothstep(0.15, 3.4, p.y));
  }
  vec2 wetRipple(vec2 p, float time) {
    vec2 cell = floor(p); vec2 f = fract(p) - 0.5;
    float phase = fract(time * 0.7 + wetHash(cell));
    float r = length(f);
    float ring = sin((r-phase*0.55)*34.0)*exp(-r*5.0)
      * (1.0-smoothstep(0.0,0.5,abs(r-phase*0.45)*6.0))*(1.0-phase);
    return normalize(f + vec2(0.0001)) * ring;
  }
`

export function applyWetLayer(material: MeshStandardMaterial, wet = true, seed = 0) {
  material.customProgramCacheKey = () => `grid-wet-v3-${wet}`
  const seedUniform = { value: seed }
  material.userData.surfaceSeed = seedUniform
  material.onBeforeCompile = shader => {
    shader.uniforms.uSurfaceSeed = seedUniform
    shader.uniforms.uSurfaceTime = { value: 0 }
    material.userData.surfaceTime = shader.uniforms.uSurfaceTime
    shader.vertexShader = 'varying vec3 vSurfaceWorld;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
      vec4 surfacePosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        surfacePosition = instanceMatrix * surfacePosition;
      #endif
      vSurfaceWorld = (modelMatrix * surfacePosition).xyz;
      #include <project_vertex>
    `)
    shader.fragmentShader = `varying vec3 vSurfaceWorld; uniform float uSurfaceTime; uniform float uSurfaceSeed;\n${wetLayerGLSL}\n` + shader.fragmentShader
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float surfaceWater = ${wet ? 'surfaceWetness(vSurfaceWorld)' : '0.0'};
      diffuseColor.rgb *= (0.8 + 0.3 * wetNoise(vSurfaceWorld.xz * 0.13 + uSurfaceSeed)) * (1.0 - surfaceWater * 0.38);
    `).replace('#include <roughnessmap_fragment>', `
      #include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.09, surfaceWater * 0.85);
    `).replace('#include <normal_fragment_maps>', `
      #include <normal_fragment_maps>
      normal = normalize(normal + vec3(wetRipple(vSurfaceWorld.xz * 0.9, uSurfaceTime), 0.0) * surfaceWater * 0.06);
    `)
  }
}
