export const GRID_SURFACE_URLS = [
  '/grid/materials/asphalt/normal.webp',
  '/grid/materials/asphalt/roughness.webp',
  '/grid/materials/concrete/normal.webp',
  '/grid/materials/concrete/roughness.webp',
] as const

export const GRID_ASSET_URLS = [
  '/grid/environment/modern_buildings_night_1k.hdr',
  ...GRID_SURFACE_URLS,
] as const

export const GRID_ENVIRONMENT_URL = GRID_ASSET_URLS[0]

export async function preloadGridAssets(
  onProgress?: (progress: number) => void,
): Promise<void> {
  let completed = 0
  await Promise.all(GRID_ASSET_URLS.map(async url => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Grid asset failed to load: ${url}`)
    await response.blob()
    completed += 1
    onProgress?.(completed / GRID_ASSET_URLS.length)
  }))
}
