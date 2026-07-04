import {
  MAX_STAR_MESSAGE_LENGTH,
  isAllowedStarMessage,
  readJson,
} from './_starModeration.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ allowed: false, checked: false, error: 'method_not_allowed' })
  }

  let body
  try {
    body = await readJson(request)
  } catch {
    return response.status(400).json({ allowed: false, checked: false, error: 'invalid_json' })
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
