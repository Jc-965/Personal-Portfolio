export const MERGE_THRESHOLD = 250
export const MEGA_STAR_COUNT = 10
export const MIN_MEGA_DISTANCE = 0.12

const getWeight = (star) => star.isMega ? (star.mergedCount || 1) : 1

/**
 * Pure constellation compaction algorithm. Keeping this independent from the
 * request/database layer makes the highest-risk data transformation testable.
 */
export function calculateMegaStarsFromBatch(stars, timestamp = Date.now()) {
  if (stars.length < MEGA_STAR_COUNT) return []

  const gridSize = 15
  const density = new Map()

  for (const star of stars) {
    const gx = Math.floor(star.x * gridSize)
    const gy = Math.floor(star.y * gridSize)
    const key = `${gx},${gy}`
    const cell = density.get(key)
    if (cell) cell.push(star)
    else density.set(key, [star])
  }

  const cellData = Array.from(density.entries())
    .map(([key, cellStars]) => {
      const [gx, gy] = key.split(',').map(Number)
      return {
        key,
        x: (gx + 0.5) / gridSize,
        y: (gy + 0.5) / gridSize,
        stars: cellStars,
        count: cellStars.reduce((sum, star) => sum + getWeight(star), 0),
      }
    })
    .sort((a, b) => b.count - a.count)

  const megaStars = []
  const selectedCellKeys = new Set()

  for (const cell of cellData) {
    if (megaStars.length >= MEGA_STAR_COUNT) break
    if (megaStars.some(star => Math.hypot(star.x - cell.x, star.y - cell.y) < MIN_MEGA_DISTANCE)) {
      continue
    }

    selectedCellKeys.add(cell.key)
    const messageCounts = new Map()
    const colorCounts = new Map()

    for (const star of cell.stars) {
      const weight = getWeight(star)
      const message = typeof star.message === 'string' ? star.message.trim() : ''
      if (message) messageCounts.set(message, (messageCounts.get(message) || 0) + weight)
      colorCounts.set(star.color, (colorCounts.get(star.color) || 0) + weight)
    }

    const topMessage = Array.from(messageCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || ''
    const topColor = Array.from(colorCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || '#00ffff'

    megaStars.push({
      x: cell.x,
      y: cell.y,
      color: topColor,
      message: topMessage,
      timestamp,
      isMega: true,
      mergedCount: cell.count,
    })
  }

  for (const cell of cellData) {
    if (selectedCellKeys.has(cell.key) || megaStars.length === 0) continue

    let nearestIndex = 0
    let nearestDistance = Infinity
    megaStars.forEach((star, index) => {
      const distance = Math.hypot(star.x - cell.x, star.y - cell.y)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = index
      }
    })
    megaStars[nearestIndex].mergedCount += cell.count
  }

  return megaStars
}
