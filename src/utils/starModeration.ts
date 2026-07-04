interface StarModerationResponse {
  allowed?: boolean
  checked?: boolean
}

interface StarMessageSaveResponse {
  saved?: boolean
  allowed?: boolean
  checked?: boolean
}

interface SaveStarMessageParams {
  starKey: string
  sessionSecret: string
  message: string
}

const MODERATION_TIMEOUT_MS = 3500
const MESSAGE_SAVE_TIMEOUT_MS = 8000

/**
 * Lightweight client wrapper around server-side star message moderation.
 * The live message write goes through /api/star-message so Firebase rules can
 * reject browser-side message edits.
 */
export async function isStarMessageAllowed(message: string): Promise<boolean> {
  const trimmed = message.trim()
  if (!trimmed) return true

  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS)

  try {
    const response = await fetch('/api/moderate-star', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: trimmed }),
      signal: controller.signal,
    })

    if (!response.ok) {
      console.warn('Star moderation unavailable:', response.status)
      return true
    }

    const result = await response.json() as StarModerationResponse
    return result.allowed !== false
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.warn('Star moderation unavailable:', error)
    }
    return true
  } finally {
    window.clearTimeout(timeout)
  }
}

export async function saveModeratedStarMessage({
  starKey,
  sessionSecret,
  message,
}: SaveStarMessageParams): Promise<boolean> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), MESSAGE_SAVE_TIMEOUT_MS)

  try {
    const response = await fetch('/api/star-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starKey, sessionSecret, message: message.trim() }),
      signal: controller.signal,
    })

    if (!response.ok) {
      console.warn('Star message save unavailable:', response.status)
      return false
    }

    const result = await response.json() as StarMessageSaveResponse
    return result.saved === true && result.allowed !== false
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.warn('Star message save unavailable:', error)
    }
    return false
  } finally {
    window.clearTimeout(timeout)
  }
}
