// JS-side noise matching the GLSL terrain shader for object placement

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

  const gx00 = gx(i00) - tx(i00), gy00 = gy(i00)
  const gx10 = gx(i10) - tx(i10), gy10 = gy(i10)
  const gx01 = gx(i01) - tx(i01), gy01 = gy(i01)
  const gx11 = gx(i11) - tx(i11), gy11 = gy(i11)

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
  let amp = 1.0
  let freq = 1.0
  for (let i = 0; i < 6; i++) {
    value += amp * cnoise(x * freq, z * freq)
    freq *= 1.95
    amp *= 0.5
  }
  return value
}

// Must match the GLSL terrain vertex shader
export function getTerrainHeight(x: number, z: number): number {
  let h = fbm(x * 0.04 + 1.0, z * 0.04 + 1.0) * 12.0
  h += cnoise(x * 0.08, z * 0.08) * 4.0
  h += cnoise(x * 0.2, z * 0.2) * 1.5
  h += cnoise(x * 0.5, z * 0.5) * 0.4
  return h
}
