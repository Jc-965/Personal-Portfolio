export interface ConstellationStarPayload {
  x: number
  y: number
  color: string
  message: string
  timestamp: number
  sessionHash?: string
  visitId?: string
}

export type ConstellationStarPatch =
  | { x: number; y: number }
  | { color: string }

interface CreateStarParams {
  sessionSecret: string
  visitId: string
  x: number
  y: number
  color: string
}

interface CreateStarResponse {
  ok?: boolean
  starKey?: string
  star?: ConstellationStarPayload
}

const REQUEST_TIMEOUT_MS = 8000

async function postStar(body: Record<string, unknown>) {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch('/api/star', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function createConstellationStar(params: CreateStarParams) {
  try {
    const response = await postStar({ action: 'create', ...params })
    if (!response.ok) return null
    const result = await response.json() as CreateStarResponse
    if (!result.ok || !result.starKey || !result.star) return null
    return { key: result.starKey, star: result.star }
  } catch {
    return null
  }
}

export async function updateConstellationStar(params: {
  starKey: string
  sessionSecret: string
  patch: ConstellationStarPatch
}) {
  try {
    const response = await postStar({ action: 'update', ...params })
    return response.ok
  } catch {
    return false
  }
}
