import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '../ErrorBoundary'
import Landing from './Landing'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Landing />
    </ErrorBoundary>
  </StrictMode>,
)
