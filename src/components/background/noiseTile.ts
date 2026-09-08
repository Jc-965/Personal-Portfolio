/** Edge length of one repeat of the film grain, in CSS pixels. */
export const NOISE_TILE = 256

// The same fractal-noise tile the CSS layer used, now rasterised once and
// blended inside the canvas instead of by the compositor every frame.
const NOISE_SVG =
  `<svg viewBox='0 0 ${NOISE_TILE} ${NOISE_TILE}' width='${NOISE_TILE}' height='${NOISE_TILE}' xmlns='http://www.w3.org/2000/svg'>` +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/></filter>" +
  "<rect width='100%' height='100%' filter='url(#n)' opacity='0.03'/></svg>"

/**
 * Rasterise the grain at `scale` device pixels per CSS pixel so it lands on
 * the same pixel grid as the canvas it will be blended into.
 */
export async function rasterizeNoiseTile(scale: number): Promise<HTMLCanvasElement | null> {
  const size = Math.max(1, Math.round(NOISE_TILE * scale))
  const image = new Image(size, size)
  image.src = `data:image/svg+xml,${encodeURIComponent(NOISE_SVG)}`
  try {
    await image.decode()
  } catch {
    return null
  }
  const tile = document.createElement('canvas')
  tile.width = size
  tile.height = size
  const ctx = tile.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(image, 0, 0, size, size)
  return tile
}
