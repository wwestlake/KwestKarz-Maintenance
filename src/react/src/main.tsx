import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import App from './App.tsx'
import { AuthProvider, useAuth } from './AuthContext.tsx'
import { LoginScreen } from './components/LoginScreen.tsx'
import { PendingApprovalScreen } from './components/PendingApprovalScreen.tsx'
import { ContactPage } from './components/ContactPage.tsx'
import { PublicLandingPage } from './components/PublicLandingPage.tsx'

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

function RootShell() {
  const pathname = window.location.pathname
  if (pathname.startsWith('/contact')) return <ContactPage />
  const isEmployeePath = pathname.startsWith('/employee')
  if (!isEmployeePath) return <PublicLandingPage />

  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootShell />
  </StrictMode>,
)
