import { firebaseConditionalPut, firebaseRestWithEtag } from './_firebaseRest.js'
import {
  MAX_STAR_MESSAGE_LENGTH,
  isAllowedStarMessage,
  readJson,
} from './_starModeration.js'
import { guardApiRequest } from './_security.js'
import {
  MAX_SESSION_SECRET_LENGTH,
  ownsStar,
} from './_starIdentity.js'

const FIREBASE_KEY_PATTERN = /^[A-Za-z0-9_-]{1,160}$/
export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ saved: false, allowed: false, checked: false, error: 'method_not_allowed' })
  }

  if (!guardApiRequest(request, response, { route: 'star-message', limit: 12, windowMs: 60000 })) {
    return
  }

  let body
  try {
    body = await readJson(request)
  } catch (error) {
    const tooLarge = error?.statusCode === 413
    return response.status(tooLarge ? 413 : 400).json({
      saved: false,
      allowed: false,
      checked: false,
      error: tooLarge ? 'payload_too_large' : 'invalid_json',
    })
  }

  const starKey = typeof body.starKey === 'string' ? body.starKey : ''
  // Prefer the raw secret; accept the old `sessionId` field for any in-flight
  // clients still running the previous bundle during a deploy.
  const sessionSecret = typeof body.sessionSecret === 'string'
    ? body.sessionSecret
    : (typeof body.sessionId === 'string' ? body.sessionId : '')
  const message = typeof body.message === 'string' ? body.message.trim() : ''

  if (!FIREBASE_KEY_PATTERN.test(starKey) || !sessionSecret || sessionSecret.length > MAX_SESSION_SECRET_LENGTH) {
    return response.status(400).json({ saved: false, allowed: false, checked: false, error: 'invalid_star' })
  }

  if (message.length > MAX_STAR_MESSAGE_LENGTH) {
    return response.status(400).json({ saved: false, allowed: false, checked: true, error: 'message_too_long' })
  }

  if (message && !isAllowedStarMessage(message)) {
    return response.status(200).json({ saved: false, allowed: false, checked: true, flagged: true })
  }

  let star
  let starEtag
  try {
    const result = await firebaseRestWithEtag(`stars/${starKey}`)
    star = result.data
    starEtag = result.etag
  } catch (error) {
    console.error('Star message read failed:', error)
    return response.status(503).json({ saved: false, allowed: false, checked: true, error: 'firebase_unavailable' })
  }

  if (!star) {
    return response.status(404).json({ saved: false, allowed: false, checked: true, error: 'star_not_found' })
  }

  if (star.isMega || !ownsStar(star, sessionSecret)) {
    return response.status(403).json({ saved: false, allowed: false, checked: true, error: 'star_not_editable' })
  }

  try {
    const updated = await firebaseConditionalPut(
      `stars/${starKey}`,
      { ...star, message },
      starEtag,
    )
    if (!updated) {
      return response.status(409).json({ saved: false, allowed: true, checked: true, error: 'star_changed' })
    }
  } catch (error) {
    console.error('Star message write failed:', error)
    return response.status(503).json({ saved: false, allowed: false, checked: true, error: 'firebase_unavailable' })
  }

  return response.status(200).json({ saved: true, allowed: true, checked: true, flagged: false })
}
