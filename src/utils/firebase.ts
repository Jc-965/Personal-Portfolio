import { initializeApp } from 'firebase/app'
import { getDatabase, type Database } from 'firebase/database'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

let firebaseApp: ReturnType<typeof initializeApp> | null = null
let database: Database | null = null

export function getFirebase(): Database | null {
  if (!firebaseApp) {
    try {
      firebaseApp = initializeApp(firebaseConfig)
      database = getDatabase(firebaseApp)
    } catch (e) {
      console.warn('Firebase init failed:', e)
    }
  }
  return database
}
