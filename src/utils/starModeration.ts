interface StarModerationResponse {
  allowed?: boolean
  checked?: boolean
}

interface StarMessageSaveResponse {
  saved?: boolean
  allowed?: boolean
  checked?: boolean
  flagged?: boolean
}

/**
 * 'flagged' means the message failed moderation; 'unavailable' means the save
 * could not run at all (endpoint down, missing server config, rate limit,
 * network failure). Callers must not present 'unavailable' as a content
 * rejection — that turns every outage into "your message is profanity".
 */
export type StarMessageSaveResult = 'saved' | 'flagged' | 'unavailable'

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
}: SaveStarMessageParams): Promise<StarMessageSaveResult> {
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
      return 'unavailable'
    }

    const result = await response.json() as StarMessageSaveResponse
    if (result.saved === true && result.allowed !== false) return 'saved'
    return result.flagged || result.allowed === false ? 'flagged' : 'unavailable'
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      console.warn('Star message save unavailable:', error)
    }
    return 'unavailable'
  } finally {
    window.clearTimeout(timeout)
  }
}
