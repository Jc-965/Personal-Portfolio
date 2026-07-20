const isProductionDeploy = process.env.VERCEL_ENV === 'production' || process.env.REQUIRE_PRODUCTION_ENV === '1'

if (!isProductionDeploy) {
  console.log('Skipping production environment validation for a local/non-production build.')
  process.exit(0)
}

const requiredClient = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_DATABASE_URL',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
]
const missing = requiredClient.filter((key) => !process.env[key]?.trim())
const hasServiceAccountJson = Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim())
const hasServiceAccountFields = Boolean(
  process.env.FIREBASE_CLIENT_EMAIL?.trim() && process.env.FIREBASE_PRIVATE_KEY?.trim(),
)

if (!hasServiceAccountJson && !hasServiceAccountFields) {
  missing.push('FIREBASE_SERVICE_ACCOUNT_KEY (or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)')
}

if (missing.length > 0) {
  console.error(`Missing required production environment variables:\n- ${missing.join('\n- ')}`)
  process.exit(1)
}

console.log('Production environment variables are configured.')
