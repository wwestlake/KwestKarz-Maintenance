import { useAuth } from '../AuthContext'

export function PendingApprovalScreen() {
  const { profile, signOut } = useAuth()

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1 className="login-title">KwestKarz</h1>
        <div className="pending-icon">⏳</div>
        <h2 className="pending-heading">Awaiting Approval</h2>
        <p className="login-hint">
          Your account ({profile?.phone}) has been registered and is waiting for
          admin approval. You'll have access once approved.
        </p>
        <button className="login-link" onClick={signOut}>
          Sign out
        </button>
      </div>
    </div>
  )
}
