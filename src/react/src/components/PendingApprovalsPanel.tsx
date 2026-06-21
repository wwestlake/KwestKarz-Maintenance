import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'

type PendingUser = {
  id: string
  phone: string
  displayName?: string
  role: string
  status: string
  createdAt: string
}

export function PendingApprovalsPanel() {
  const { profile } = useAuth()
  const [users, setUsers] = useState<PendingUser[]>([])
  const [approving, setApproving] = useState<string | null>(null)
  const [roleSelections, setRoleSelections] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile?.role === 'admin') {
      api.get<PendingUser[]>('/api/users/pending').then(setUsers).catch(() => setError('Could not load pending users'))
    }
  }, [profile?.role])

  if (profile?.role !== 'admin') return null

  async function approve(userId: string) {
    setApproving(userId)
    setError('')
    try {
      await api.post(`/api/users/${userId}/approve`, { role: roleSelections[userId] ?? 'worker' })
      setUsers(prev => prev.filter(u => u.id !== userId))
    } catch {
      setError('Could not approve user')
    } finally {
      setApproving(null)
    }
  }

  async function suspend(userId: string) {
    setApproving(userId)
    setError('')
    try {
      await api.post(`/api/users/${userId}/suspend`, {})
      setUsers(prev => prev.filter(u => u.id !== userId))
    } catch {
      setError('Could not deny user')
    } finally {
      setApproving(null)
    }
  }

  return (
    <div className="panel area-panel">
      <div className="section-heading">
        <h2>Pending Approvals</h2>
        <span className="tag">{users.length} waiting</span>
      </div>
      {error && <p className="hint-text" style={{ color: 'var(--color-danger, #e53)' }}>{error}</p>}
      {users.length === 0 ? (
        <p className="hint-text">No users awaiting approval.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Phone</th>
              <th>Name</th>
              <th>Registered</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>{u.phone}</td>
                <td>{u.displayName ?? <span style={{ opacity: 0.45 }}>—</span>}</td>
                <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                <td>
                  <select
                    value={roleSelections[u.id] ?? 'worker'}
                    onChange={e => setRoleSelections(prev => ({ ...prev, [u.id]: e.target.value }))}
                    disabled={approving === u.id}
                  >
                    <option value="worker">Worker</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn-primary"
                    onClick={() => approve(u.id)}
                    disabled={approving === u.id}
                  >
                    Approve
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => suspend(u.id)}
                    disabled={approving === u.id}
                  >
                    Deny
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
