import { ref as dbRef, onValue } from 'firebase/database'
import { getFirebase } from './firebase'

interface ConstellationRealtimeHandlers {
  onStars: (value: unknown) => void
  onMetadata: (value: unknown) => void
  onStarsError: () => void
  onMetadataError: () => void
}

/**
 * Firebase stays behind this async module boundary so the constellation shell,
 * cached stars, and the visitor's optimistic star can paint before the SDK is
 * downloaded and initialized.
 */
export function subscribeToConstellation({
  onStars,
  onMetadata,
  onStarsError,
  onMetadataError,
}: ConstellationRealtimeHandlers): (() => void) | null {
  const database = getFirebase()
  if (!database) return null

  const unsubscribeStars = onValue(
    dbRef(database, 'stars'),
    snapshot => onStars(snapshot.val()),
    onStarsError,
  )
  const unsubscribeMetadata = onValue(
    dbRef(database, 'metadata'),
    snapshot => onMetadata(snapshot.val()),
    onMetadataError,
  )

  return () => {
    unsubscribeStars()
    unsubscribeMetadata()
  }
}
