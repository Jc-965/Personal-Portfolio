import crypto from 'node:crypto'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FIREBASE_SCOPE = 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email'

let cachedAccessToken = null
let cachedAccessTokenExpiresAt = 0

function decodeServiceAccountKey(rawKey) {
  if (!rawKey) return null

  try {
    return JSON.parse(rawKey)
  } catch {
    try {
      return JSON.parse(Buffer.from(rawKey, 'base64').toString('utf8'))
    } catch {
      return null
    }
  }
}

function getFirebaseConfig() {
  const serviceAccount = decodeServiceAccountKey(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || serviceAccount?.client_email
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || serviceAccount?.private_key || '').replace(/\\n/g, '\n')
  const databaseUrl = process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL

  if (!clientEmail || !privateKey || !databaseUrl) {
    throw new Error('missing_firebase_admin_config')
  }

  return { clientEmail, privateKey, databaseUrl: databaseUrl.replace(/\/$/, '') }
}

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function createServiceAccountJwt({ clientEmail, privateKey }) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss: clientEmail,
    sub: clientEmail,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
    scope: FIREBASE_SCOPE,
  }))
  const unsignedToken = `${header}.${payload}`
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsignedToken)
    .sign(privateKey, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${unsignedToken}.${signature}`
}

async function getAccessToken(config) {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt - 60000) {
    return cachedAccessToken
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: createServiceAccountJwt(config),
    }),
  })

  if (!response.ok) {
    throw new Error(`firebase_token_failed:${response.status}`)
  }

  const token = await response.json()
  cachedAccessToken = token.access_token
  cachedAccessTokenExpiresAt = Date.now() + (Number(token.expires_in) || 3600) * 1000
  return cachedAccessToken
}

export async function firebaseRest(path, init = {}) {
  const config = getFirebaseConfig()
  const accessToken = await getAccessToken(config)
  const response = await fetch(`${config.databaseUrl}/${path}.json`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`firebase_rest_failed:${response.status}:${text}`)
  }

  if (response.status === 204) return null
  return response.json()
}
