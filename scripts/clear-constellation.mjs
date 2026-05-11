// One-off: wipes the constellation stars and metadata from Firebase Realtime DB.
// Run from project root:
//   node --env-file=.env.local scripts/clear-constellation.mjs
//
// The DB rules currently allow public writes, so no admin credentials needed.

import { initializeApp } from 'firebase/app'
import { getDatabase, ref, remove } from 'firebase/database'

const config = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
}

if (!config.databaseURL) {
  console.error('Missing VITE_FIREBASE_DATABASE_URL. Run with: node --env-file=.env.local scripts/clear-constellation.mjs')
  process.exit(1)
}

const app = initializeApp(config)
const db = getDatabase(app)

console.log('Clearing stars and metadata from', config.databaseURL)
await remove(ref(db, 'stars'))
await remove(ref(db, 'metadata'))
console.log('Done.')
process.exit(0)
