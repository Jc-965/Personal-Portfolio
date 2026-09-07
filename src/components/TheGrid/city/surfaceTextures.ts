import { useEffect, useState } from 'react'
import { useThree } from '@react-three/fiber'
import { NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture, type WebGLRenderer } from 'three'
import { GRID_MAPS, surfaceUrl, type GridSurface } from '../gridAssets'

export interface SurfaceMaps { albedo: Texture; normal: Texture; roughness: Texture }
interface Entry {
  owners: number
  promise: Promise<SurfaceMaps>
  timer?: ReturnType<typeof setTimeout>
}
const caches = new WeakMap<WebGLRenderer, Map<GridSurface, Entry>>()

/** Each renderer shares one GPU texture set per surface. Loading starts on demand. */
export function acquireSurface(renderer: WebGLRenderer, surface: GridSurface) {
  let cache = caches.get(renderer)
  if (!cache) { cache = new Map(); caches.set(renderer, cache) }
  let entry = cache.get(surface)
  if (!entry) {
    const promise = (async () => {
      const { KTX2Loader } = await import('three/examples/jsm/loaders/KTX2Loader.js')
      const loader = new KTX2Loader().setTranscoderPath('/grid/basis/').setWorkerLimit(1).detectSupport(renderer)
      const loaded: Texture[] = []
      try {
        // Sequential maps avoid orphaned textures when a fallback also fails.
        for (const map of GRID_MAPS) {
          const texture = await loader.loadAsync(surfaceUrl(surface, map, 'ktx2'))
            .catch(() => new TextureLoader().loadAsync(surfaceUrl(surface, map, 'webp')))
          texture.colorSpace = map === 'albedo' ? SRGBColorSpace : NoColorSpace
          texture.wrapS = texture.wrapT = RepeatWrapping
          texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy())
          texture.needsUpdate = true
          loaded.push(texture)
        }
        const maps = { albedo: loaded[0], normal: loaded[1], roughness: loaded[2] }
        return maps
      } catch (error) {
        loaded.forEach(texture => texture.dispose())
        throw error
      } finally { loader.dispose() }
    })()
    entry = { owners: 0, promise }
    cache.set(surface, entry)
  }
  const owned = entry
  owned.owners++
  clearTimeout(owned.timer)
  let released = false
  return {
    promise: owned.promise,
    release() {
      if (released) return
      released = true
      owned.owners--
      owned.timer = setTimeout(() => {
        if (owned.owners) return
        cache.delete(surface)
        void owned.promise.then(maps => Object.values(maps).forEach(texture => texture.dispose()), () => {})
      }, 100)
    },
  }
}

export function useSurfaceMaps(surface: GridSurface) {
  const renderer = useThree(state => state.gl)
  const [loaded, setLoaded] = useState<{ renderer: WebGLRenderer; surface: GridSurface; maps: SurfaceMaps }>()
  useEffect(() => {
    const lease = acquireSurface(renderer, surface)
    let active = true
    void lease.promise.then(maps => { if (active) setLoaded({ renderer, surface, maps }) }, error => {
      if (active) console.warn(`Grid surface ${surface} unavailable`, error)
    })
    return () => { active = false; lease.release() }
  }, [renderer, surface])
  return loaded?.renderer === renderer && loaded.surface === surface ? loaded.maps : undefined
}
