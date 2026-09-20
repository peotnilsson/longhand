import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './ErrorBoundary'
import './index.css'
import App from './App.tsx'

/**
 * Keep a copy of the app itself, so it opens without a network.
 *
 * Only in a built app: in development the point of the dev server is that it
 * serves the file you just changed. A failed registration is not worth a word
 * to the user — the app works either way, it just needs the network next time.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
