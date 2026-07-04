import {
  MAX_STAR_MESSAGE_LENGTH,
  isAllowedStarMessage,
  readJson,
} from './_starModeration.js'
import { guardApiRequest } from './_security.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ allowed: false, checked: false, error: 'method_not_allowed' })
  }

  if (!guardApiRequest(request, response, { route: 'moderate-star', limit: 30, windowMs: 60000 })) {
    return
  }

  let body
  try {
    body = await readJson(request)
  } catch (error) {
    const tooLarge = error?.statusCode === 413
    return response.status(tooLarge ? 413 : 400).json({
      allowed: false,
      checked: false,
      error: tooLarge ? 'payload_too_large' : 'invalid_json',
    })
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) {
    return response.status(200).json({ allowed: true, checked: true })
  }

  if (message.length > MAX_STAR_MESSAGE_LENGTH) {
    return response.status(400).json({ allowed: false, checked: true, error: 'message_too_long' })
  }

  const flagged = !isAllowedStarMessage(message)

  return response.status(200).json({
    allowed: !flagged,
    checked: true,
    flagged,
  })
}
