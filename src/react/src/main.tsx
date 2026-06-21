import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider, useAuth } from './AuthContext.tsx'
import { LoginScreen } from './components/LoginScreen.tsx'
import { PendingApprovalScreen } from './components/PendingApprovalScreen.tsx'

function AppShell() {
  const { state } = useAuth()

  if (state.kind === 'loading') {
    return (
      <div className="login-screen">
        <div className="login-card">
          <p className="login-hint">Loading…</p>
        </div>
      </div>
    )
  }

  if (state.kind === 'unauthenticated') return <LoginScreen />
  if (state.kind === 'pending' || state.kind === 'suspended') return <PendingApprovalScreen />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  </StrictMode>,
)
