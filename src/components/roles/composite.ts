/**
 * The journey page's final pass, one full-screen draw. It lays the island's render (linear, premultiplied, cleared
 * to transparent around the island) over the role's painted sky, blurs it outside a horizontal sharp band the way
 * a tilt-shift lens does, adds a soft glow from the render's coarse mips, tone maps the island with ACES, grades
 * the whole frame warm, darkens the corners, and writes sRGB. During an expansion it draws into the rectangle the
 * stage sets with the viewport and scissor, so its uv runs over that rectangle and `uSkyAlpha` fades the sky in.
 */
import * as THREE from 'three'

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const FRAGMENT = /* glsl */ `
uniform sampler2D uScene;
uniform sampler2D uSky;
uniform float uSkyReady;
uniform float uSkyAspect;
uniform float uSkyFocus;
uniform float uSkyAlpha;
uniform float uAspect;
uniform vec2 uParallax;
uniform float uFocusY;
uniform float uBlur;
uniform vec2 uTexel;
uniform vec3 uTint;
varying vec2 vUv;

// three's ACES filmic fit, so the journey's island matches the home page's, which the renderer tone maps itself.
vec3 rrtOdt(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 color) {
  const mat3 inputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color = inputMat * (color / 0.6);
  color = rrtOdt(color);
  return clamp(outputMat * color, 0.0, 1.0);
}

// Four taps around uv at a mip level, so a coarse level reads as a soft blur instead of blocks.
vec4 soft(vec2 uv, float lod) {
  vec2 o = uTexel * exp2(lod) * 0.75;
  return 0.25 * (textureLod(uScene, uv + vec2(o.x, o.y), lod) + textureLod(uScene, uv + vec2(-o.x, o.y), lod)
    + textureLod(uScene, uv + vec2(o.x, -o.y), lod) + textureLod(uScene, uv + vec2(-o.x, -o.y), lod));
}

void main() {
  // The sky covers the frame, its focus x kept in view, drifting a little with the pointer and the scroll.
  vec2 skyUv = vUv;
  float scale = uAspect / uSkyAspect;
  if (scale > 1.0) skyUv.y = 0.5 + (skyUv.y - 0.5) / scale;
  else skyUv.x = uSkyFocus + (skyUv.x - 0.5) * scale;
  skyUv = 0.5 + (skyUv - 0.5) * 0.94 + uParallax * 0.03;
  vec3 sky = uSkyReady > 0.5 ? textureLod(uSky, skyUv, 1.5).rgb : mix(vec3(0.82, 0.86, 0.95), vec3(0.98, 0.9, 0.8), vUv.y);

  // The tilt-shift: sharp within 0.16 of uFocusY, blurring to uBlur mips by 0.5 away.
  float away = abs(vUv.y - uFocusY);
  float lod = uBlur * smoothstep(0.16, 0.5, away);
  vec4 island = lod > 0.05 ? soft(vUv, lod) : texture2D(uScene, vUv);
  // A glow from the coarse mips, so lit edges and emissive lights bloom softly.
  vec3 glow = textureLod(uScene, vUv, 4.5).rgb * 0.18;

  // The island is premultiplied by its coverage. Over the sky, which fades in by uSkyAlpha during an expansion,
  // the pair's coverage is a + (1 - a) * skyAlpha, and the colour is divided back to straight for the grade and
  // the sRGB curve, then premultiplied once on the way out.
  float alpha = island.a + (1.0 - island.a) * uSkyAlpha;
  vec3 premultiplied = aces(island.rgb + glow) + sky * (1.0 - island.a) * uSkyAlpha;
  vec3 color = premultiplied / max(alpha, 1e-4);
  color *= uTint;
  vec2 centred = (vUv - 0.5) * vec2(uAspect, 1.0);
  color *= 1.0 - 0.28 * smoothstep(0.45, 1.25, length(centred));
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha);
}
`

export interface RoleComposite {
  scene: THREE.Scene
  camera: THREE.OrthographicCamera
  uniforms: {
    uScene: { value: THREE.Texture | null }
    uSky: { value: THREE.Texture | null }
    uSkyReady: { value: number }
    uSkyAspect: { value: number }
    uSkyFocus: { value: number }
    uSkyAlpha: { value: number }
    uAspect: { value: number }
    uParallax: { value: THREE.Vector2 }
    uFocusY: { value: number }
    uBlur: { value: number }
    uTexel: { value: THREE.Vector2 }
    uTint: { value: THREE.Vector3 }
  }
  dispose(): void
}

export function createRoleComposite(): RoleComposite {
  const uniforms = {
    uScene: { value: null as THREE.Texture | null },
    uSky: { value: null as THREE.Texture | null },
    uSkyReady: { value: 0 },
    uSkyAspect: { value: 16 / 9 },
    uSkyFocus: { value: 0.5 },
    uSkyAlpha: { value: 1 },
    uAspect: { value: 16 / 9 },
    uParallax: { value: new THREE.Vector2() },
    uFocusY: { value: 0.5 },
    uBlur: { value: 3 },
    uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uTint: { value: new THREE.Vector3(1.04, 1.0, 0.94) },
  }
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    transparent: true,
    premultipliedAlpha: true,
    blending: THREE.NormalBlending,
  })
  const geometry = new THREE.PlaneGeometry(2, 2)
  const scene = new THREE.Scene()
  scene.add(new THREE.Mesh(geometry, material))
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  return {
    scene,
    camera,
    uniforms,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}
