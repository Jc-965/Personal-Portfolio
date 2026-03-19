// JS-side terrain sampling shared with the GLSL terrain shader.

function mod289(x: number): number {
  return x - Math.floor(x * (1.0 / 289.0)) * 289.0
}

function permute(x: number): number {
  return mod289(((x * 34.0) + 1.0) * x)
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function dot2(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by
}

function saturate(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = saturate((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

function remapNoise(value: number): number {
  return value * 0.5 + 0.5
}

function ridgeNoise(value: number): number {
  return 1 - Math.abs(value)
}

export interface TerrainSample {
  height: number
  moisture: number
  drainage: number
  meadow: number
  slope: number
  rocky: number
  forest: number
}

type TerrainCoreSample = Omit<TerrainSample, 'slope' | 'rocky' | 'forest'>

function sampleWaterFeatures(x: number, z: number) {
  const creekAxis = x - z * 0.34
  const creekBend = Math.sin(z * 0.09 - 0.7) * 5.8 + Math.sin(z * 0.024 + 1.7) * 2.6 + 0.8
  const creekDistance = Math.abs(creekAxis - creekBend)
  const creekMask = 1 - smoothstep(1.1, 9.4, creekDistance)
  const creekDepth = creekMask * (2.4 + remapNoise(cnoise(x * 0.045 + 44.0, z * 0.045 - 27.0)) * 3.4)

  const tributaryAxis = x + z * 0.42
  const tributaryBend = Math.sin(x * 0.058 + 1.2) * 4.4 + Math.sin(z * 0.031 - 0.6) * 2.2 - 6.0
  const tributaryDistance = Math.abs(tributaryAxis - tributaryBend)
  const tributaryMask = 1 - smoothstep(0.9, 7.2, tributaryDistance)
  const tributaryDepth = tributaryMask * (1.4 + remapNoise(cnoise(x * 0.038 - 12.0, z * 0.038 + 35.0)) * 2.8)

  const lakeDistance = Math.hypot((x - 11.5) * 0.74, (z - 17.5) * 1.02)
  const lakeMask = 1 - smoothstep(5.2, 16.0, lakeDistance)
  const lakeDepth = lakeMask * (3.6 + remapNoise(cnoise(x * 0.043 - 18.0, z * 0.043 + 29.0)) * 4.2)

  const basinDistance = Math.hypot((x + 18.0) * 1.06, (z + 7.5) * 0.84)
  const basinMask = 1 - smoothstep(4.6, 11.8, basinDistance)
  const basinDepth = basinMask * (2.5 + remapNoise(cnoise(x * 0.04 + 22.0, z * 0.04 - 14.0)) * 3.4)

  const gladeDistance = Math.hypot((x + 4.0) * 0.88, (z - 1.5) * 1.18)
  const gladeMask = 1 - smoothstep(4.2, 11.6, gladeDistance)
  const gladeDepth = gladeMask * (4.1 + remapNoise(cnoise(x * 0.046 + 18.0, z * 0.046 - 21.0)) * 3.8)

  return {
    creekMask: Math.max(creekMask, tributaryMask * 0.86),
    pondMask: Math.max(lakeMask, basinMask * 0.9, gladeMask),
    waterCarve: creekDepth + tributaryDepth + lakeDepth + basinDepth + gladeDepth,
    waterBoost: Math.max(creekMask * 0.82, tributaryMask * 0.74, lakeMask, basinMask * 0.9, gladeMask * 0.96),
  }
}

export function cnoise(px: number, py: number): number {
  const pix = Math.floor(px)
  const piy = Math.floor(py)
  const pfx = px - pix
  const pfy = py - piy

  const ix0 = mod289(pix)
  const ix1 = mod289(pix + 1)
  const iy0 = mod289(piy)
  const iy1 = mod289(piy + 1)

  const i00 = permute(permute(ix0) + iy0)
  const i10 = permute(permute(ix1) + iy0)
  const i01 = permute(permute(ix0) + iy1)
  const i11 = permute(permute(ix1) + iy1)

  const gx = (n: number) => (n * (1.0 / 41.0)) % 1.0 * 2.0 - 1.0
  const gy = (n: number) => Math.abs(gx(n)) - 0.5
  const tx = (n: number) => Math.floor(gx(n) + 0.5)

  const gx00 = gx(i00) - tx(i00)
  const gy00 = gy(i00)
  const gx10 = gx(i10) - tx(i10)
  const gy10 = gy(i10)
  const gx01 = gx(i01) - tx(i01)
  const gy01 = gy(i01)
  const gx11 = gx(i11) - tx(i11)
  const gy11 = gy(i11)

  const norm = (gxi: number, gyi: number) => {
    const d = gxi * gxi + gyi * gyi
    return 1.79284291400159 - 0.85373472095314 * d
  }

  const n00g = norm(gx00, gy00)
  const n10g = norm(gx10, gy10)
  const n01g = norm(gx01, gy01)
  const n11g = norm(gx11, gy11)

  const n00 = dot2(gx00 * n00g, gy00 * n00g, pfx, pfy)
  const n10 = dot2(gx10 * n10g, gy10 * n10g, pfx - 1, pfy)
  const n01 = dot2(gx01 * n01g, gy01 * n01g, pfx, pfy - 1)
  const n11 = dot2(gx11 * n11g, gy11 * n11g, pfx - 1, pfy - 1)

  const fx = fade(pfx)
  const fy = fade(pfy)
  const nx0 = lerp(n00, n10, fx)
  const nx1 = lerp(n01, n11, fx)
  return 2.3 * lerp(nx0, nx1, fy)
}

export function fbm(x: number, z: number): number {
  let value = 0
  let amplitude = 1
  let frequency = 1

  for (let i = 0; i < 6; i += 1) {
    value += amplitude * cnoise(x * frequency, z * frequency)
    frequency *= 1.95
    amplitude *= 0.5
  }

  return value
}

function sampleTerrainCore(x: number, z: number): TerrainCoreSample {
  const primaryWarp = cnoise(x * 0.015 + 13.4, z * 0.015 - 7.2)
  const secondaryWarp = cnoise(x * 0.029 - 4.6, z * 0.029 + 6.8)
  const tertiaryWarp = cnoise(x * 0.027 + 8.2, z * 0.027 - 2.4)
  const warpX = x + primaryWarp * 7.5 + secondaryWarp * 3.2
  const warpZ = z + cnoise(x * 0.015 - 5.1, z * 0.015 + 11.3) * 7.5 + tertiaryWarp * 3.2
  const radius = Math.hypot(x * 0.86, z * 0.94)

  const continentalLift = remapNoise(fbm(warpX * 0.006 - 21.0, warpZ * 0.006 + 13.0)) * 4.8
  const macro = fbm(warpX * 0.016, warpZ * 0.016) * 6.2
  const broadRise = remapNoise(fbm(warpX * 0.009 - 10.0, warpZ * 0.009 + 6.5)) * 3.8
  const ridgeField = Math.pow(saturate(ridgeNoise(cnoise(warpX * 0.027, warpZ * 0.027))), 1.78) * 3.6
  const highlandMask = smoothstep(0.46, 0.84, remapNoise(cnoise(warpX * 0.018 - 16.0, warpZ * 0.018 + 9.0)))
  const summitMask = smoothstep(0.48, 0.88, remapNoise(cnoise(warpX * 0.014 - 24.0, warpZ * 0.014 + 12.0)))
  const edgeRise = smoothstep(16, 60, radius) * 3.5
  const mountainBands = Math.pow(saturate(ridgeNoise(cnoise(warpX * 0.043 + 9.0, warpZ * 0.043 - 13.0))), 2.25)
  const alpineRidges = Math.pow(saturate(ridgeNoise(cnoise(warpX * 0.062 - 11.0, warpZ * 0.062 + 19.0))), 3.0)
  const mountainLift = mountainBands * (1.2 + highlandMask * 4.4 + edgeRise * 0.3 + summitMask * 2.0)
  const peakLift = alpineRidges * (0.7 + summitMask * 5.3)
  const basinShape = (1 - smoothstep(10, 42, Math.hypot(x * 0.88, z * 1.02))) * 1.4
  const valleyMask = smoothstep(0.42, 0.82, remapNoise(cnoise(warpX * 0.018 + 7.0, warpZ * 0.018 - 22.0)))
  const valleyCarve = valleyMask * remapNoise(cnoise(warpX * 0.05 - 3.0, warpZ * 0.05 + 16.0)) * 1.35
  const drainageA = ridgeNoise(cnoise(warpX * 0.022 + 14.0, warpZ * 0.022 - 9.0))
  const drainageB = ridgeNoise(cnoise(warpX * 0.031 - 17.0, warpZ * 0.039 + 6.0))
  const drainage = Math.pow(saturate(drainageA * 0.68 + drainageB * 0.32 - 0.15), 2.0)
  const channelCarve = drainage * (1.5 + remapNoise(cnoise(warpX * 0.048, warpZ * 0.048)) * 1.25)
  const waterFeatures = sampleWaterFeatures(x, z)
  const foothill = remapNoise(cnoise(warpX * 0.045 + 1.8, warpZ * 0.045 - 0.6)) * 2.5
  const plateauMask = smoothstep(0.48, 0.86, remapNoise(cnoise(warpX * 0.02 - 12.0, warpZ * 0.02 + 4.0)))
  const plateau = plateauMask * 1.5
  const mesaMask = smoothstep(0.58, 0.88, remapNoise(cnoise(warpX * 0.013 + 25.0, warpZ * 0.013 - 18.0)))
  const mesa = mesaMask * smoothstep(-0.15, 0.6, cnoise(warpX * 0.024 - 9.0, warpZ * 0.024 + 14.0)) * 2.6
  const detail =
    cnoise(warpX * 0.1, warpZ * 0.1) * 0.9 +
    cnoise(warpX * 0.23, warpZ * 0.23) * 0.35 +
    cnoise(warpX * 0.42 - 7.0, warpZ * 0.42 + 4.0) * 0.12
  const height =
    macro * 0.82 +
    continentalLift +
    broadRise +
    ridgeField +
    foothill +
    plateau +
    mesa +
    edgeRise +
    mountainLift -
    valleyCarve +
    peakLift -
    basinShape -
    channelCarve -
    waterFeatures.waterCarve +
    detail
  const normalizedHeight = saturate((height + 6.5) / 28.0)
  const moistureNoise = remapNoise(fbm(warpX * 0.018 + 28.0, warpZ * 0.018 - 18.0))
  const moisture = saturate(
    0.34 +
    drainage * 0.54 +
    moistureNoise * 0.34 -
    normalizedHeight * 0.18 +
    highlandMask * 0.06 +
    valleyMask * 0.08 +
    waterFeatures.waterBoost * 0.42,
  )
  const meadowNoise = remapNoise(cnoise(warpX * 0.024 - 14.0, warpZ * 0.024 + 3.0))
  const waterDrainage = Math.max(drainage, waterFeatures.creekMask * 0.96 + waterFeatures.pondMask * 0.58)
  const meadow = saturate((meadowNoise - 0.42) * 2.0) * saturate(
    1 - waterDrainage * 0.7 - highlandMask * 0.44 - mesaMask * 0.22 - waterFeatures.pondMask * 0.58,
  )

  return {
    height,
    moisture,
    drainage: saturate(waterDrainage),
    meadow,
  }
}

function sampleTerrainSlope(x: number, z: number): number {
  const epsilon = 1.3
  const dx = getTerrainHeight(x + epsilon, z) - getTerrainHeight(x - epsilon, z)
  const dz = getTerrainHeight(x, z + epsilon) - getTerrainHeight(x, z - epsilon)
  return Math.hypot(dx, dz) / (epsilon * 2)
}

export function getTerrainHeight(x: number, z: number): number {
  return sampleTerrainCore(x, z).height
}

export function getTerrainSlope(x: number, z: number): number {
  return sampleTerrainSlope(x, z)
}

export function getTerrainSample(x: number, z: number): TerrainSample {
  const core = sampleTerrainCore(x, z)
  const water = saturate(
    (1 - smoothstep(-2.2, 0.9, core.height)) * smoothstep(0.28, 0.64, core.moisture + core.drainage * 0.28),
  )
  const slope = saturate(sampleTerrainSlope(x, z) * 0.94)
  const meadow = core.meadow * (1 - water * 0.8)
  const rocky = saturate(slope * 1.16 + smoothstep(5.5, 15.8, core.height) * 0.42 - core.moisture * 0.24 - water * 0.26)
  const forest = saturate(
    0.58 + core.moisture * 0.5 - meadow * 0.34 - rocky * 0.58 - smoothstep(11.0, 16.0, core.height) * 0.32 - water * 1.02,
  )

  return {
    ...core,
    meadow,
    slope,
    rocky,
    forest,
  }
}
