export type Route = { page: 'home' } | { page: 'projects' } | { page: 'project'; id: string }

/** Which page a path shows. Anything unknown is the home page. */
export function matchRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'projects') return { page: 'home' }
  if (parts.length === 1) return { page: 'projects' }
  if (parts.length === 2) return { page: 'project', id: decodeURIComponent(parts[1]).toLowerCase() }
  return { page: 'home' }
}

export function projectPath(id: string): string {
  return `/projects/${id}/`
}
