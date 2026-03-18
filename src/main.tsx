import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'
import { bootstrapNativeCursorSuppression } from './utils/nativeCursor'

bootstrapNativeCursorSuppression()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
