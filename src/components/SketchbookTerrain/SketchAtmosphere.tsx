/* eslint-disable react/no-unknown-property */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const skyVertexShader = /* glsl */ `
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const skyFragmentShader = /* glsl */ `
precision highp float;

varying vec3 vWorldPosition;

void main() {
  vec3 direction = normalize(vWorldPosition);
  float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
  float horizonBand = smoothstep(0.02, 0.24, height) * (1.0 - smoothstep(0.3, 0.62, height));

  vec3 zenith = vec3(0.47, 0.59, 0.7);
  vec3 highSky = vec3(0.66, 0.76, 0.8);
  vec3 horizon = vec3(0.84, 0.84, 0.79);
  vec3 lowHaze = vec3(0.73, 0.79, 0.82);
  vec3 nearAir = vec3(0.79, 0.83, 0.84);

  vec3 color = mix(horizon, zenith, smoothstep(0.08, 0.92, height));
  color = mix(color, highSky, smoothstep(0.2, 0.72, height) * 0.46);
  color = mix(lowHaze, color, smoothstep(0.02, 0.28, height));
  color = mix(color, nearAir, horizonBand * 0.42);

  vec3 sunDirection = normalize(vec3(-0.24, 0.31, -0.92));
  float sun = max(dot(direction, sunDirection), 0.0);
  color += vec3(0.16, 0.12, 0.08) * pow(sun, 8.0) * 0.18;
  color += vec3(0.28, 0.22, 0.15) * pow(sun, 24.0) * 0.12;

  float coolLift = smoothstep(0.34, 0.9, height);
  color = mix(color, color * vec3(0.96, 0.99, 1.04), coolLift * 0.12);

  gl_FragColor = vec4(color, 1.0);
}
`

function SkyDome({ isMobile }: { isMobile: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const geometry = useMemo(
    () => new THREE.SphereGeometry(260, isMobile ? 24 : 32, isMobile ? 16 : 22),
    [isMobile],
  )
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  }), [])

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  useFrame(({ camera }) => {
    if (!meshRef.current) return
    meshRef.current.position.copy(camera.position)
  })

  return <mesh ref={meshRef} geometry={geometry} material={material} frustumCulled={false} />
}

export default function SketchAtmosphere({ isMobile }: { isMobile: boolean }) {
  return (
    <>
      <SkyDome isMobile={isMobile} />
    </>
  )
}
