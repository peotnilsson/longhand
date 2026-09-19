import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '../ErrorBoundary'
import Privacy from './Privacy'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Privacy />
    </ErrorBoundary>
  </StrictMode>,
)
