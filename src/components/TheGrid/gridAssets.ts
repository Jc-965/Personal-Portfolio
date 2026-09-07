export const GRID_SURFACES = ['asphalt', 'concrete', 'facade', 'paintedMetal', 'corrugatedMetal', 'rust', 'tile', 'velvet'] as const
export type GridSurface = typeof GRID_SURFACES[number]
export const GRID_MAPS = ['albedo', 'normal', 'roughness'] as const
export function surfaceUrl(surface: GridSurface, map: typeof GRID_MAPS[number], format: 'webp' | 'ktx2') {
  return `/grid/materials/${surface}/${map}.${format}`
}
// Full registry for district streaming; only street surfaces are boot-prefetched.
export const GRID_MATERIAL_URLS = GRID_SURFACES.flatMap(surface => GRID_MAPS.flatMap(map =>
  [surfaceUrl(surface, map, 'ktx2'), surfaceUrl(surface, map, 'webp')]))
export const GRID_SURFACE_URLS = ['asphalt', 'concrete'].flatMap(surface =>
  GRID_MAPS.map(map => surfaceUrl(surface as GridSurface, map, 'ktx2')))
export const GRID_ENVIRONMENT_URL = '/grid/environment/modern_buildings_night_1k.hdr'
export const GRID_ASSET_URLS = [GRID_ENVIRONMENT_URL, ...GRID_MATERIAL_URLS,
  '/grid/basis/basis_transcoder.js', '/grid/basis/basis_transcoder.wasm']

export async function preloadGridAssets(onProgress?: (progress: number) => void): Promise<void> {
  const urls = [GRID_ENVIRONMENT_URL, ...GRID_SURFACE_URLS]
  let completed = 0
  await Promise.all(urls.map(async url => {
    async function prefetch(assetUrl: string) {
      const response = await fetch(assetUrl)
      if (!response.ok) throw new Error(`Grid asset failed to load: ${assetUrl}`)
      await response.blob()
    }
    try {
      await prefetch(url)
    } catch (error) {
      if (!url.endsWith('.ktx2')) throw error
      await prefetch(url.replace(/\.ktx2$/, '.webp'))
    }
    onProgress?.(++completed / urls.length)
  }))
}
