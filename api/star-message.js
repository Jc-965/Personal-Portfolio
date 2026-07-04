import { firebaseRest } from './_firebaseRest.js'
import {
  MAX_STAR_MESSAGE_LENGTH,
  isAllowedStarMessage,
  readJson,
} from './_starModeration.js'

const FIREBASE_KEY_PATTERN = /^[A-Za-z0-9_-]{1,160}$/

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ saved: false, allowed: false, checked: false, error: 'method_not_allowed' })
  }

  let body
  try {
    body = await readJson(request)
  } catch {
    return response.status(400).json({ saved: false, allowed: false, checked: false, error: 'invalid_json' })
  }

  const starKey = typeof body.starKey === 'string' ? body.starKey : ''
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : ''
  const message = typeof body.message === 'string' ? body.message.trim() : ''

  if (!FIREBASE_KEY_PATTERN.test(starKey) || !sessionId || sessionId.length > 64) {
    return response.status(400).json({ saved: false, allowed: false, checked: false, error: 'invalid_star' })
  }

  if (message.length > MAX_STAR_MESSAGE_LENGTH) {
    return response.status(400).json({ saved: false, allowed: false, checked: true, error: 'message_too_long' })
  }

  if (message && !isAllowedStarMessage(message)) {
    return response.status(200).json({ saved: false, allowed: false, checked: true, flagged: true })
  }

  let star
  try {
    star = await firebaseRest(`stars/${starKey}`)
  } catch (error) {
    console.error('Star message read failed:', error)
    return response.status(503).json({ saved: false, allowed: false, checked: true, error: 'firebase_unavailable' })
  }

  if (!star) {
    return response.status(404).json({ saved: false, allowed: false, checked: true, error: 'star_not_found' })
  }

  if (star.sessionId !== sessionId || star.isMega) {
    return response.status(403).json({ saved: false, allowed: false, checked: true, error: 'star_not_editable' })
  }

  try {
    await firebaseRest(`stars/${starKey}`, {
      method: 'PATCH',
      body: JSON.stringify({ message }),
    })
  } catch (error) {
    console.error('Star message write failed:', error)
    return response.status(503).json({ saved: false, allowed: false, checked: true, error: 'firebase_unavailable' })
  }

  return response.status(200).json({ saved: true, allowed: true, checked: true, flagged: false })
}
