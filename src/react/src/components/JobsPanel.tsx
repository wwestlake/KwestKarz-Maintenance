import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'
import type { Job, Vehicle } from '../types'

const statusLabel: Record<string, string> = {
  open: 'Open',
  claimed: 'Claimed',
  in_progress: 'In Progress',
  complete: 'Complete',
  canceled: 'Canceled',
}

const statusClass: Record<string, string> = {
  open: 'tag',
  claimed: 'tag tag-warning',
  in_progress: 'tag tag-ok',
  complete: 'tag tag-ok',
  canceled: 'tag tag-muted',
}

export function JobsPanel() {
  const { profile } = useAuth()
  const isAdmin = profile?.role === 'admin' || profile?.role === 'manager'

  const [jobs, setJobs] = useState<Job[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [acting, setActing] = useState<string | null>(null)

  // Create job form (admin/manager only)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', amount: '', location: '', dueAt: '', vehicleId: '', steps: [] as string[], newStep: '' })

  useEffect(() => { refresh() }, [])

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      const [jobsData, vehiclesData] = await Promise.all([
        api.get<Job[]>('/api/jobs'),
        api.get<Vehicle[]>('/api/vehicles')
      ])
      setJobs(jobsData)
      setVehicles(vehiclesData)
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
        location: form.location.trim() || null,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        vehicleId: form.vehicleId || null,
        steps: form.steps
      })
      setJobs(prev => [job, ...prev])
      setForm({ title: '', description: '', amount: '', location: '', dueAt: '', vehicleId: '', steps: [], newStep: '' })
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

  async function checkin(jobId: string) {
    setActing(jobId)
    setError('')
    try {
      const updated = await api.post<Job>(`/api/jobs/${jobId}/checkin`, {})
      setJobs(prev => prev.map(j => j.id === jobId ? updated : j))
    } catch {
      setError('Could not check in. Ensure you claimed this job.')
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
  const activeJobs = jobs.filter(j => j.status === 'claimed' || j.status === 'in_progress')
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
                placeholder="e.g. Wash and Detail"
                required
              />
            </div>
            <div className="form-row">
              <label>Location</label>
              <input
                type="text"
                value={form.location}
                onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. 123 Main St"
              />
            </div>
            <div className="form-row">
              <label>NLT Due Time</label>
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={e => setForm(f => ({ ...f, dueAt: e.target.value }))}
              />
            </div>
            <div className="form-row">
              <label>Vehicle (Optional)</label>
              <select value={form.vehicleId} onChange={e => setForm(f => ({ ...f, vehicleId: e.target.value }))}>
                <option value="">-- None --</option>
                {vehicles.map(v => (
                   <option key={v.id} value={v.id}>{v.year} {v.make} {v.model} - {v.licensePlate}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>General Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Overall context or notes..."
                rows={2}
              />
            </div>
            <div className="form-row">
              <label>Checklist Steps</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {form.steps.map((step, idx) => (
                   <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                     <span>{idx + 1}. {step}</span>
                     <button type="button" className="btn-secondary" style={{ padding: '2px 6px', fontSize: '0.8em' }} onClick={() => setForm(f => ({ ...f, steps: f.steps.filter((_, i) => i !== idx) }))}>x</button>
                   </div>
                ))}
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    value={form.newStep}
                    onChange={e => setForm(f => ({ ...f, newStep: e.target.value }))}
                    placeholder="e.g. Wash exterior..."
                    onKeyDown={e => {
                       if (e.key === 'Enter') {
                         e.preventDefault();
                         if (form.newStep.trim()) {
                            setForm(f => ({ ...f, steps: [...f.steps, f.newStep.trim()], newStep: '' }))
                         }
                       }
                    }}
                  />
                  <button type="button" className="btn-secondary" onClick={() => {
                     if (form.newStep.trim()) {
                        setForm(f => ({ ...f, steps: [...f.steps, f.newStep.trim()], newStep: '' }))
                     }
                  }}>Add</button>
                </div>
              </div>
            </div>
            <div className="form-row">
              <label>Cash Amount ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="25.00"
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
                onCheckin={job.status === 'claimed' ? () => checkin(job.id) : undefined}
                onComplete={job.status === 'in_progress' ? () => complete(job.id) : undefined}
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
  onCheckin?: () => void
  onComplete?: () => void
  onCancel?: () => void
  onCounterOffer?: () => void
}

function JobCard({ job, acting, onClaim, onCheckin, onComplete, onCancel, onCounterOffer }: JobCardProps) {
  const busy = acting === job.id
  
  // Local state to track which steps are checked off when in progress
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({})

  // Require all steps checked to complete
  const allChecked = job.steps && job.steps.length > 0 
      ? job.steps.every((_, idx) => checkedSteps[idx])
      : true

  return (
    <div style={{ borderLeft: '3px solid var(--color-border)', paddingLeft: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <strong>{job.title}</strong>
          {job.dueAt && <div className="hint-text" style={{ color: 'var(--color-danger, #e53)' }}>Due: {new Date(job.dueAt).toLocaleString()}</div>}
          {job.location && <div className="hint-text">📍 {job.location}</div>}
          {job.description && <p className="hint-text" style={{ margin: '2px 0 0' }}>{job.description}</p>}
          
          {job.steps && job.steps.length > 0 && (
             <div style={{ margin: '8px 0', background: 'var(--surface-hover)', padding: '8px', borderRadius: '4px' }}>
                <strong style={{ fontSize: '0.85em', textTransform: 'uppercase' }}>Checklist:</strong>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                   {job.steps.map((step, idx) => (
                      <label key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: job.status === 'in_progress' ? 'pointer' : 'default' }}>
                         <input 
                            type="checkbox" 
                            disabled={job.status !== 'in_progress'} 
                            checked={!!checkedSteps[idx]}
                            onChange={e => setCheckedSteps(prev => ({ ...prev, [idx]: e.target.checked }))}
                            style={{ marginTop: 4 }}
                         />
                         <span>{step}</span>
                      </label>
                   ))}
                </div>
             </div>
          )}
          
          <p className="hint-text" style={{ margin: '4px 0 0' }}>
            <strong style={{ fontSize: '1.1em' }}>${job.amount.toFixed(2)}</strong>
            {' · '}posted by {job.createdBy}
            {job.claimedByName && ` · claimed by ${job.claimedByName}`}
          </p>
        </div>
        <span className={statusClass[job.status] ?? 'tag'}>{statusLabel[job.status]}</span>
      </div>
      {(onClaim || onCheckin || onComplete || onCancel || onCounterOffer) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {onClaim && (
            <button className="btn-primary" onClick={onClaim} disabled={busy}>
              {busy ? 'Claiming...' : 'Accept Job'}
            </button>
          )}
          {onCounterOffer && (
            <button className="btn-secondary" onClick={onCounterOffer} disabled={busy}>
              Counter Offer
            </button>
          )}
          {onCheckin && (
            <button className="btn-primary" onClick={onCheckin} disabled={busy}>
              {busy ? '...' : 'Check In (I am here)'}
            </button>
          )}
          {onComplete && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--surface-hover)', padding: '8px', borderRadius: '4px', width: '100%' }}>
              <span className="hint-text" style={{ color: 'var(--color-danger, #e53)', fontWeight: 'bold' }}>
                 📸 WARNING: Sloppy photos can result in payment delays. Ensure clear evidence of all checklist items.
              </span>
              <button className="btn-primary" onClick={onComplete} disabled={busy || !allChecked}>
                {busy ? '...' : 'Upload Photos & Complete'}
              </button>
              {!allChecked && <span className="hint-text" style={{ fontSize: '0.8em' }}>Must check all steps to complete.</span>}
            </div>
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
