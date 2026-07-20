import crypto from 'node:crypto'
import {
  firebaseConditionalPut,
  firebaseRest,
  firebaseRestWithEtag,
} from './_firebaseRest.js'
import {
  calculateMegaStarsFromBatch,
  MERGE_THRESHOLD,
} from './_constellationMerge.js'
import { hashSessionSecret, ownsStar } from './_starIdentity.js'

const MERGE_LOCK_TIMEOUT_MS = 30000
const ALLOWED_COLORS = new Set(['#00ffff', '#ff00ff', '#00ff41', '#ffcc00', '#ff3366'])

export const FIREBASE_KEY_PATTERN = /^[A-Za-z0-9_-]{1,160}$/

function createDatabaseKey() {
  return crypto.randomBytes(18).toString('base64url')
}

export function isValidCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
}

export function isValidStarColor(value) {
  return typeof value === 'string' && ALLOWED_COLORS.has(value.toLowerCase())
}

async function claimMergeLock() {
  const now = Date.now()
  const token = crypto.randomUUID()
  const { data, etag } = await firebaseRestWithEtag('metadata/mergeLock')
  if (data && typeof data.claimedAt === 'number' && now - data.claimedAt < MERGE_LOCK_TIMEOUT_MS) {
    return null
  }

  const claimed = await firebaseConditionalPut('metadata/mergeLock', { token, claimedAt: now }, etag)
  return claimed ? token : null
}

async function releaseMergeLock(token) {
  try {
    const { data, etag } = await firebaseRestWithEtag('metadata/mergeLock')
    if (data?.token === token) {
      await firebaseConditionalPut('metadata/mergeLock', null, etag)
    }
  } catch {
    // The lock expires; cleanup is best-effort after a failed merge.
  }
}

export async function mergeConstellationIfNeeded() {
  const initialStars = await firebaseRest('stars')
  const initialList = initialStars ? Object.values(initialStars) : []
  if (initialList.filter(star => !star.isMega).length < MERGE_THRESHOLD) return 'not_needed'

  const token = await claimMergeLock()
  if (!token) return 'busy'

  let cleared = false
  try {
    const data = await firebaseRest('stars')
    const freshStars = data
      ? Object.entries(data).map(([key, star]) => ({ ...star, key }))
      : []
    if (freshStars.filter(star => !star.isMega).length < MERGE_THRESHOLD) return 'not_needed'

    const megaStars = calculateMegaStarsFromBatch(freshStars)
    if (megaStars.length === 0) return 'not_needed'

    const updates = {}
    freshStars.forEach(star => { updates[`stars/${star.key}`] = null })
    megaStars.forEach(star => {
      updates[`stars/${createDatabaseKey()}`] = {
        ...star,
        message: '',
        sessionHash: hashSessionSecret(token),
      }
    })
    updates['metadata/mergeCount'] = { '.sv': { increment: 1 } }
    updates['metadata/mergeLock'] = null

    await firebaseRest('', { method: 'PATCH', body: JSON.stringify(updates) })
    cleared = true
    return 'merged'
  } finally {
    if (!cleared) await releaseMergeLock(token)
  }
}

export async function createConstellationStar({ sessionSecret, x, y, color, visitId }) {
  // Compact an already-full field before inserting the visitor's star so the
  // newly returned/editable star is never immediately consumed by that merge.
  let mergeStatus = 'busy'
  for (const delayMs of [0, 100, 250, 500]) {
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs))
    mergeStatus = await mergeConstellationIfNeeded()
    if (mergeStatus !== 'busy') break
  }
  if (mergeStatus === 'busy') throw new Error('constellation_merge_busy')

  const key = createDatabaseKey()
  const star = {
    x,
    y,
    color: color.toLowerCase(),
    message: '',
    timestamp: Date.now(),
    sessionHash: hashSessionSecret(sessionSecret),
    visitId,
  }

  await firebaseRest('', {
    method: 'PATCH',
    body: JSON.stringify({
      [`stars/${key}`]: star,
      'metadata/totalStarsEver': { '.sv': { increment: 1 } },
    }),
  })
  return { key, star }
}

export async function updateConstellationStar({ starKey, sessionSecret, patch }) {
  const { data: star, etag } = await firebaseRestWithEtag(`stars/${starKey}`)
  if (!star) return { status: 'not_found' }
  if (star.isMega || !ownsStar(star, sessionSecret)) return { status: 'forbidden' }

  const updated = await firebaseConditionalPut(`stars/${starKey}`, { ...star, ...patch }, etag)
  if (!updated) return { status: 'conflict' }
  return { status: 'updated' }
}
