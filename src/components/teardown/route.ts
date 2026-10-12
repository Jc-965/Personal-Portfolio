/**
 * Chapter ids with a journey page. TEARDOWNS (src/content/teardown) and CHAPTERS (src/content/chapters) hold the
 * same ids, and App reads this list instead, so the initial bundle never carries the stories.
 */
export const JOURNEYS: readonly string[] = ['parkiwell', 'agoriai', 'tarocchi', 'mycommunity']

/**
 * Role ids with a journey page. ROLE_STORIES (src/content/roles) holds the same ids, and App reads this list
 * instead, so the initial bundle never carries the stories.
 */
export const ROLE_JOURNEYS: readonly string[] = ['scottylabs-ai', 'blue-shield', 'sorcea', 'cmumaps', 'gcs', 'coding-minds', 'softcom']

/** A chapter's journey page is an in-app history entry at the root, one path segment named by the chapter id. */
export function journeyPath(id: string): string {
  return `/${id}`
}

/** The chapter id whose journey `pathname` names, with or without a trailing slash, or null. */
export function journeyAt(pathname: string, ids: readonly string[]): string | null {
  const id = pathname.replace(/^\/|\/$/g, '')
  return ids.includes(id) ? id : null
}
