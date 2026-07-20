import {
  createConstellationStar,
  FIREBASE_KEY_PATTERN,
  isValidCoordinate,
  isValidStarColor,
  updateConstellationStar,
} from './_constellationService.js'
import { readJson } from './_starModeration.js'
import { guardApiRequest } from './_security.js'
import { isValidSessionSecret } from './_starIdentity.js'

function invalid(response, error = 'invalid_star') {
  return response.status(400).json({ ok: false, error })
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ ok: false, error: 'method_not_allowed' })
  }

  if (!guardApiRequest(request, response, { route: 'star', limit: 40, windowMs: 60000 })) return

  let body
  try {
    body = await readJson(request)
  } catch (error) {
    const tooLarge = error?.statusCode === 413
    return response.status(tooLarge ? 413 : 400).json({
      ok: false,
      error: tooLarge ? 'payload_too_large' : 'invalid_json',
    })
  }

  const sessionSecret = typeof body.sessionSecret === 'string' ? body.sessionSecret : ''
  if (!isValidSessionSecret(sessionSecret)) return invalid(response)

  try {
    if (body.action === 'create') {
      const visitId = typeof body.visitId === 'string' ? body.visitId : ''
      if (
        !isValidCoordinate(body.x) ||
        !isValidCoordinate(body.y) ||
        !isValidStarColor(body.color) ||
        !/^[A-Za-z0-9_-]{1,100}$/.test(visitId)
      ) {
        return invalid(response)
      }

      const result = await createConstellationStar({
        sessionSecret,
        x: body.x,
        y: body.y,
        color: body.color,
        visitId,
      })
      return response.status(200).json({ ok: true, starKey: result.key, star: result.star })
    }

    if (body.action === 'update') {
      const starKey = typeof body.starKey === 'string' ? body.starKey : ''
      const rawPatch = body.patch && typeof body.patch === 'object' ? body.patch : null
      if (!FIREBASE_KEY_PATTERN.test(starKey) || !rawPatch) return invalid(response)

      const patch = {}
      if ('x' in rawPatch || 'y' in rawPatch) {
        if (!isValidCoordinate(rawPatch.x) || !isValidCoordinate(rawPatch.y)) return invalid(response)
        patch.x = rawPatch.x
        patch.y = rawPatch.y
      }
      if ('color' in rawPatch) {
        if (!isValidStarColor(rawPatch.color)) return invalid(response)
        patch.color = rawPatch.color.toLowerCase()
      }
      if (Object.keys(patch).length === 0) return invalid(response, 'empty_patch')

      const result = await updateConstellationStar({ starKey, sessionSecret, patch })
      if (result.status === 'not_found') return response.status(404).json({ ok: false, error: 'star_not_found' })
      if (result.status === 'forbidden') return response.status(403).json({ ok: false, error: 'star_not_editable' })
      if (result.status === 'conflict') return response.status(409).json({ ok: false, error: 'star_changed' })
      return response.status(200).json({ ok: true })
    }

    return invalid(response, 'invalid_action')
  } catch (error) {
    console.error('Constellation star operation failed:', error)
    return response.status(503).json({ ok: false, error: 'firebase_unavailable' })
  }
}
