// localStorage can throw on access or write (Safari lockdown/private modes,
// storage-blocked iframes, quota exhaustion). Features that use it for
// nice-to-have persistence shouldn't crash when it's unavailable.
export function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Persistence is best-effort; losing it degrades gracefully.
  }
}
