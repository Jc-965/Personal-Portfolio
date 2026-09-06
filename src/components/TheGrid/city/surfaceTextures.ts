import { useEffect } from 'react'
import { useLoader } from '@react-three/fiber'
import { RepeatWrapping, TextureLoader } from 'three'
import { GRID_SURFACE_URLS } from '../gridAssets'

let owners = 0
let releaseTimer: ReturnType<typeof setTimeout> | undefined

/** Suspense cache shares the data maps across the reflection and PBR surfaces. */
export function useSurfaceTextures() {
  const textures = useLoader(TextureLoader, [...GRID_SURFACE_URLS])
  textures.forEach(texture => {
    texture.wrapS = texture.wrapT = RepeatWrapping
    texture.anisotropy = 2
  })
  useEffect(() => {
    owners += 1
    clearTimeout(releaseTimer)
    return () => {
      owners -= 1
      // StrictMode replays effects. Delay release until all consumers are gone.
      releaseTimer = setTimeout(() => {
        if (owners !== 0) return
        textures.forEach(texture => texture.dispose())
        useLoader.clear(TextureLoader, [...GRID_SURFACE_URLS])
      }, 0)
    }
  }, [textures])
  return textures
}
