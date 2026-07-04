// Lightweight, dependency-free hardening for the public star-message API
// routes. Everything here is in-process: a per-instance rate limiter plus a
// same-origin guard. On a low-traffic personal site this keeps a warm Fluid
// Compute instance effective; under heavy scale-out the limit becomes
// per-instance, so a shared store (Vercel KV / Upstash) would be the next step.

const RATE_LIMIT_STORE = new Map()
const MAX_TRACKED_KEYS = 5000

function sweepExpired(now) {
  for (const [key, entry] of RATE_LIMIT_STORE) {
    if (now >= entry.resetAt) RATE_LIMIT_STORE.delete(key)
  }
}

export function getClientIp(request) {
  const headers = request.headers || {}
  // x-real-ip is set by Vercel's edge and is harder to spoof than a
  // client-supplied x-forwarded-for chain, so prefer it.
  const realIp = headers['x-real-ip']
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim()

  const forwarded = headers['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }

  return request.socket?.remoteAddress || 'unknown'
}

export function checkRateLimit(key, { limit, windowMs }) {
  const now = Date.now()
  if (RATE_LIMIT_STORE.size > MAX_TRACKED_KEYS) sweepExpired(now)

  const entry = RATE_LIMIT_STORE.get(key)
  if (!entry || now >= entry.resetAt) {
    RATE_LIMIT_STORE.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterSec: 0 }
  }

  if (entry.count >= limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) }
  }

  entry.count += 1
  return { allowed: true, retryAfterSec: 0 }
}

// A cross-site page can fire a POST at our API even though CORS blocks it from
// reading the response — so the write would still land. Browsers always attach
// an Origin header on such POSTs, so we reject any Origin whose host differs
// from the request host. Missing Origin (non-browser clients, some privacy
// tooling) is allowed through and left to the rate limiter.
export function isSameOriginRequest(request) {
  const headers = request.headers || {}
  const origin = headers.origin
  if (!origin) return true

  const host = headers.host
  if (!host) return false

  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

/**
 * Applies the same-origin guard and per-IP rate limit. Writes a 403/429
 * response and returns false when the request should be rejected; returns true
 * when the handler may continue.
 */
export function guardApiRequest(request, response, { route, limit, windowMs }) {
  if (!isSameOriginRequest(request)) {
    response.status(403).json({ allowed: false, checked: false, error: 'forbidden_origin' })
    return false
  }

  const { allowed, retryAfterSec } = checkRateLimit(`${route}:${getClientIp(request)}`, { limit, windowMs })
  if (!allowed) {
    response.setHeader('Retry-After', String(retryAfterSec))
    response.status(429).json({ allowed: false, checked: false, error: 'rate_limited' })
    return false
  }

  return true
}
