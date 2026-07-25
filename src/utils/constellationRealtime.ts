import {
  ref as dbRef,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onValue,
} from 'firebase/database'
import { getFirebase } from './firebase'

interface ConstellationRealtimeHandlers {
  onStarAdded: (key: string, value: unknown) => void
  onStarChanged: (key: string, value: unknown) => void
  onStarRemoved: (key: string) => void
  onStarsSynced: (isInitial: boolean) => void
  onMetadata: (value: unknown) => void
  onStarsError: () => void
  onMetadataError: () => void
}

/**
 * Firebase stays behind this async module boundary so the constellation shell,
 * cached stars, and the visitor's optimistic star can paint before the SDK is
 * downloaded and initialized.
 *
 * Stars sync per child rather than per tree: one visitor dragging their star
 * used to hand every other browser a freshly materialized object for the whole
 * sky several times a second. Child events carry just the star that moved, so
 * remote motion arrives sooner and costs one object instead of hundreds.
 */
export function subscribeToConstellation({
  onStarAdded,
  onStarChanged,
  onStarRemoved,
  onStarsSynced,
  onMetadata,
  onStarsError,
  onMetadataError,
}: ConstellationRealtimeHandlers): (() => void) | null {
  const database = getFirebase()
  if (!database) return null

  const starsRef = dbRef(database, 'stars')
  let initialSyncDone = false

  const unsubscribers = [
    onChildAdded(
      starsRef,
      snapshot => { if (snapshot.key) onStarAdded(snapshot.key, snapshot.val()) },
      onStarsError,
    ),
    onChildChanged(
      starsRef,
      snapshot => { if (snapshot.key) onStarChanged(snapshot.key, snapshot.val()) },
      onStarsError,
    ),
    onChildRemoved(
      starsRef,
      snapshot => { if (snapshot.key) onStarRemoved(snapshot.key) },
      onStarsError,
    ),
    // Fires after the initial child batch and after every later update. Its
    // snapshot is deliberately never read: calling val() here would rebuild the
    // entire sky as a plain object on every single star move, which is exactly
    // the cost the child listeners above avoid.
    onValue(
      starsRef,
      () => {
        const isInitial = !initialSyncDone
        initialSyncDone = true
        onStarsSynced(isInitial)
      },
      onStarsError,
    ),
    onValue(
      dbRef(database, 'metadata'),
      snapshot => onMetadata(snapshot.val()),
      onMetadataError,
    ),
  ]

  return () => unsubscribers.forEach(unsubscribe => unsubscribe())
}
