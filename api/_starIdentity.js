import crypto from 'node:crypto'

export const MAX_SESSION_SECRET_LENGTH = 36

export function isValidSessionSecret(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_SESSION_SECRET_LENGTH
}

export function hashSessionSecret(sessionSecret) {
  return crypto.createHash('sha256').update(sessionSecret).digest('hex')
}

export function ownsStar(star, sessionSecret) {
  if (!star || !isValidSessionSecret(sessionSecret)) return false

  if (typeof star.sessionHash === 'string' && star.sessionHash) {
    const hash = hashSessionSecret(sessionSecret)
    if (hash.length !== star.sessionHash.length) return false
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(star.sessionHash))
  }

  return false
}
