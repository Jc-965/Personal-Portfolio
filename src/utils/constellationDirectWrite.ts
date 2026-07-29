import { ref as dbRef, update } from 'firebase/database'
import { getFirebase, getFirebaseApp } from './firebase'

/**
 * Direct position writes: browser -> Firebase over the already-open WebSocket,
 * instead of browser -> Vercel function -> Firebase REST (three hops and
 * ~200ms+ per drag frame). Security rules allow an authenticated client to
 * write exactly two leaves — stars/$key/x and stars/$key/y — and only when the
 * star's ownerUid matches the anonymous uid minted here. Creation, captions,
 * moderation, and merges all remain server-only.
 *
 * This module is imported dynamically alongside constellationRealtime so
 * firebase/auth stays out of the initial bundle.
 */

let uidPromise: Promise<string | null> | null = null

export function ensureAnonymousUid(): Promise<string | null> {
  if (!uidPromise) {
    uidPromise = signIn().then(uid => {
      // A failed sign-in (provider disabled, network down) should not poison
      // the whole session — let a later drag attempt retry.
      if (uid == null) uidPromise = null
      return uid
    })
  }
  return uidPromise
}

async function signIn(): Promise<string | null> {
  try {
    const app = getFirebaseApp()
    if (!app) return null
    const { getAuth, signInAnonymously } = await import('firebase/auth')
    const auth = getAuth(app)
    if (auth.currentUser) return auth.currentUser.uid
    const credential = await signInAnonymously(auth)
    return credential.user.uid
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('Anonymous auth unavailable; falling back to API writes:', error)
    }
    return null
  }
}

export async function writeStarPosition(
  starKey: string,
  x: number,
  y: number,
): Promise<boolean> {
  try {
    const database = getFirebase()
    if (!database) return false
    // One multi-path update so x and y land atomically; each leaf is validated
    // independently by the security rules.
    await update(dbRef(database), {
      [`stars/${starKey}/x`]: x,
      [`stars/${starKey}/y`]: y,
    })
    return true
  } catch {
    return false
  }
}
