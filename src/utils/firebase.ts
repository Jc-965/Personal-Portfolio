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

let firebaseApp: ReturnType<typeof initializeApp> | null = null
let database: Database | null = null

export function getFirebase(): Database | null {
  if (!firebaseApp) {
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
