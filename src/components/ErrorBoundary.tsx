import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /**
   * What to render if a child throws. Defaults to `null` so a crash in a
   * decorative WebGL layer simply removes that layer instead of taking the
   * whole page down with it.
   */
  fallback?: ReactNode
  /** Optional label to make console output identifiable per boundary. */
  label?: string
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * Catches render/runtime errors from a subtree (notably the Three.js canvases,
 * which can throw on WebGL context loss on low-end devices) and swaps in a
 * fallback instead of unmounting the entire React tree to a blank screen.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ''}]`, error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}

export default ErrorBoundary
