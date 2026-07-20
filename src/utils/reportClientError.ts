export function reportClientError(error: Error, label?: string, componentStack?: string | null) {
  const boundary = label || 'Unknown'
  console.error(`[ErrorBoundary: ${boundary}]`, error, componentStack)

  window.dispatchEvent(new CustomEvent('portfolio:error', {
    detail: { boundary, errorName: error.name },
  }))

  if (import.meta.env.PROD) {
    void import('@vercel/analytics').then(({ track }) => {
      track('client_error', { boundary, errorName: error.name })
    }).catch(() => undefined)
  }
}
