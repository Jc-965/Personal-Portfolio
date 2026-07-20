import { firebaseRest } from './_firebaseRest.js'
import { guardApiRequest } from './_security.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ ok: false, error: 'method_not_allowed' })
  }
  if (!guardApiRequest(request, response, { route: 'sketch-visit', limit: 10, windowMs: 60000 })) return

  try {
    await firebaseRest('metadata/sketchVisitors', {
      method: 'PUT',
      body: JSON.stringify({ '.sv': { increment: 1 } }),
    })
    const count = await firebaseRest('metadata/sketchVisitors')
    return response.status(200).json({ ok: true, count: Number(count) || 1 })
  } catch (error) {
    console.error('Sketch visitor count failed:', error)
    return response.status(503).json({ ok: false, error: 'firebase_unavailable' })
  }
}
