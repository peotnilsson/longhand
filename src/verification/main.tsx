import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from '../ErrorBoundary'
import Verification from './Verification'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <Verification />
    </ErrorBoundary>
  </StrictMode>,
)
