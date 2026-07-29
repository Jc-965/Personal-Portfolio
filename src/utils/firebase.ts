import { initializeApp } from 'firebase/app'
import { getDatabase, type Database } from 'firebase/database'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const requiredFirebaseConfig = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key)

let firebaseApp: ReturnType<typeof initializeApp> | null = null
let database: Database | null = null

/**
 * The Firebase app instance, or null when config is missing or init failed.
 * Exposed for features that need SDKs beyond the database (anonymous auth for
 * the constellation's direct position writes). Initializes through
 * getFirebase() so App Check setup is never skipped.
 */
export function getFirebaseApp(): ReturnType<typeof initializeApp> | null {
  getFirebase()
  return firebaseApp
}

export function getFirebase(): Database | null {
  if (!firebaseApp) {
    if (requiredFirebaseConfig.length > 0) {
      if (import.meta.env.DEV) {
        console.warn(`Firebase is disabled; missing ${requiredFirebaseConfig.join(', ')}.`)
      }
      return null
    }
    try {
      firebaseApp = initializeApp(firebaseConfig)

      // App Check (reCAPTCHA v3, fully invisible — no user interaction): proves
      // requests come from this site. Activates only when a site key is set;
      // enforcement is flipped separately in the Firebase console, so shipping
      // this without a key (or before enforcing) changes nothing for visitors.
      const appCheckSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
      if (appCheckSiteKey) {
        try {
          if (import.meta.env.DEV) {
            // Dev builds attest with a debug token instead of real reCAPTCHA.
            // First run prints the token in the browser console — register it
            // under App Check → Apps → Manage debug tokens.
            ;(self as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true
          }
          initializeAppCheck(firebaseApp, {
            provider: new ReCaptchaV3Provider(appCheckSiteKey),
            isTokenAutoRefreshEnabled: true,
          })
        } catch (e) {
          // App Check failing must never take the database down with it.
          console.warn('App Check init failed:', e)
        }
      }

      database = getDatabase(firebaseApp)
    } catch (e) {
      console.warn('Firebase init failed:', e)
    }
  }
  return database
}
