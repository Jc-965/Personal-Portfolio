import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'
import { bootstrapNativeCursorSuppression } from './utils/nativeCursor'

bootstrapNativeCursorSuppression()

// Activate the webfonts stylesheet (loaded with media="print" so it never
// blocks first paint; an inline onload= handler would violate the CSP).
document.getElementById('webfonts')?.setAttribute('media', 'all')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
