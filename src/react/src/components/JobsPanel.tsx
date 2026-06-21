import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import type { Job } from '../types'

const statusLabel: Record<string, string> = {
  open: 'Open',
  claimed: 'Claimed',
  complete: 'Complete',
  canceled: 'Canceled',
}

const statusClass: Record<string, string> = {
  open: 'tag',
  claimed: 'tag tag-warning',
  complete: 'tag tag-ok',
  canceled: 'tag tag-muted',
}

export function JobsPanel() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager'

  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [acting, setActing] = useState<string | null>(null)

  // Create job form (admin/manager only)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', amount: '' })

  useEffect(() => { refresh() }, [])

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const data = await api.get<Job[]>('/api/jobs')
      setJobs(data)
    } catch {
      setError('Could not load jobs')
    } finally {
      setLoading(false)
    }
  }

  async function createJob(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setActing('create')
    setError('')
    try {
      const job = await api.post<Job>('/api/jobs', {
        title: form.title.trim(),
        description: form.description.trim() || null,
        amount: parseFloat(form.amount) || 0,
      })
      setJobs(prev => [job, ...prev])
      setForm({ title: '', description: '', amount: '' })
      setShowForm(false)
    } catch {
      setError('Could not create job')
    } finally {
      setActing(null)
    }
  }

  async function claim(jobId: string) {
    setActing(jobId)
    setError('')
    try {
      const updated = await api.post<Job>(`/api/jobs/${jobId}/claim`, {})
      setJobs(prev => prev.map(j => j.id === jobId ? updated : j))
    } catch {
      setError('Could not claim job — someone may have gotten there first')
    } finally {
      setActing(null)
    }
  }

  async function complete(jobId: string) {
    setActing(jobId)
    setError('')
    try {
      await api.post(`/api/jobs/${jobId}/complete`, {})
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'complete' as const } : j))
    } catch {
      setError('Could not mark job complete')
    } finally {
      setActing(null)
    }
  }

  async function cancel(jobId: string) {
    setActing(jobId)
    setError('')
    try {
      await api.post(`/api/jobs/${jobId}/cancel`, {})
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'canceled' as const } : j))
    } catch {
      setError('Could not cancel job')
    } finally {
      setActing(null)
    }
  }

  const openJobs = jobs.filter(j => j.status === 'open')
  const activeJobs = jobs.filter(j => j.status === 'claimed')
  const doneJobs = jobs.filter(j => j.status === 'complete' || j.status === 'canceled')

  return (
    <section className="area-grid">
      {/* Header card */}
      <div className="panel area-panel">
        <div className="section-heading">
          <h2>Jobs</h2>
          <span className="tag">{openJobs.length} open</span>
        </div>
        {error && <p className="hint-text" style={{ color: 'var(--color-danger, #e53)' }}>{error}</p>}
        {isAdmin && (
          <button className="btn-primary" style={{ marginTop: 8 }} onClick={() => setShowForm(s => !s)}>
            {showForm ? 'Cancel' : '+ Post Job'}
          </button>
        )}
        {isAdmin && showForm && (
          <form onSubmit={createJob} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="form-row">
              <label>Title</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Detail and inspection — Unit 3"
                required
              />
            </div>
            <div className="form-row">
              <label>Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="What needs to be done..."
                rows={3}
              />
            </div>
            <div className="form-row">
              <label>Cash Amount ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="80.00"
              />
            </div>
            <button className="btn-primary" type="submit" disabled={acting === 'create'}>
              {acting === 'create' ? 'Posting...' : 'Post Job'}
            </button>
          </form>
        )}
      </div>

      {/* Open jobs */}
      {openJobs.length > 0 && (
        <div className="panel area-panel">
          <div className="section-heading"><h2>Available</h2></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {openJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                isAdmin={isAdmin}
                acting={acting}
                onClaim={() => claim(job.id)}
                onCancel={() => cancel(job.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Active/claimed jobs */}
      {activeJobs.length > 0 && (
        <div className="panel area-panel">
          <div className="section-heading"><h2>In Progress</h2></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {activeJobs.map(job => (
              <JobCard
                key={job.id}
                job={job}
                isAdmin={isAdmin}
                acting={acting}
                onComplete={() => complete(job.id)}
                onCancel={isAdmin ? () => cancel(job.id) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Done */}
      {doneJobs.length > 0 && (
        <div className="panel area-panel">
          <div className="section-heading">
            <h2>History</h2>
            <span className="tag">{doneJobs.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {doneJobs.map(job => (
              <JobCard key={job.id} job={job} isAdmin={isAdmin} acting={acting} />
            ))}
          </div>
        </div>
      )}

      {jobs.length === 0 && !loading && (
        <div className="panel area-panel">
          <p className="hint-text">No jobs yet.{isAdmin ? ' Post one to get started.' : ' Check back soon.'}</p>
        </div>
      )}
    </section>
  )
}

type JobCardProps = {
  job: Job
  isAdmin: boolean
  acting: string | null
  onClaim?: () => void
  onComplete?: () => void
  onCancel?: () => void
}

function JobCard({ job, acting, onClaim, onComplete, onCancel }: JobCardProps) {
  const busy = acting === job.id
  return (
    <div style={{ borderLeft: '3px solid var(--color-border)', paddingLeft: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <strong>{job.title}</strong>
          {job.description && <p className="hint-text" style={{ margin: '2px 0 0' }}>{job.description}</p>}
          <p className="hint-text" style={{ margin: '4px 0 0' }}>
            <strong style={{ fontSize: '1.1em' }}>${job.amount.toFixed(2)}</strong>
            {' · '}posted by {job.createdBy}
            {job.claimedByName && ` · claimed by ${job.claimedByName}`}
          </p>
        </div>
        <span className={statusClass[job.status] ?? 'tag'}>{statusLabel[job.status]}</span>
      </div>
      {(onClaim || onComplete || onCancel) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {onClaim && (
            <button className="btn-primary" onClick={onClaim} disabled={busy}>
              {busy ? 'Claiming...' : 'Claim Job'}
            </button>
          )}
          {onComplete && (
            <button className="btn-primary" onClick={onComplete} disabled={busy}>
              {busy ? '...' : 'Mark Complete'}
            </button>
          )}
          {onCancel && (
            <button className="btn-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          )}
        </div>
      )}
    </div>
  )
}
