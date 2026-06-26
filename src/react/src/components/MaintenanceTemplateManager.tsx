import { useEffect, useState } from 'react'
import { useAuth } from '../AuthContext'
import { api } from '../api'

type Template = {
  id: string
  eventType: string
  mileInterval?: number
  dayInterval?: number
  warnMilesOut: number
  warnDaysOut: number
  description?: string
  isActive: boolean
  sortOrder: number
}

const empty = (): Omit<Template, 'id'> => ({
  eventType: '', mileInterval: undefined, dayInterval: undefined,
  warnMilesOut: 500, warnDaysOut: 14, description: undefined,
  isActive: true, sortOrder: 999,
})

export function MaintenanceTemplateManager() {
  const { profile } = useAuth()
  const [templates, setTemplates] = useState<Template[]>([])
  const [editing, setEditing] = useState<Template | null>(null)
  const [form, setForm] = useState(empty())
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (profile?.role === 'admin') load()
  }, [profile?.role])

  if (profile?.role !== 'admin') return null

  async function load() {
    try {
      const data = await api.get<Template[]>('/api/maintenance/templates/all')
      setTemplates(data)
    } catch { setError('Could not load templates') }
  }

  function startEdit(t: Template) {
    setEditing(t)
    setForm({ ...t })
    setIsNew(false)
    setError('')
  }

  function startNew() {
    setEditing(null)
    setForm(empty())
    setIsNew(true)
    setError('')
  }

  function cancel() { setEditing(null); setIsNew(false); setError('') }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = {
        eventType: form.eventType,
        mileInterval: form.mileInterval ?? null,
        dayInterval: form.dayInterval ?? null,
        warnMilesOut: form.warnMilesOut,
        warnDaysOut: form.warnDaysOut,
        description: form.description || null,
        isActive: form.isActive,
        sortOrder: form.sortOrder,
      }
      if (isNew) {
        await api.post('/api/maintenance/templates', body)
      } else if (editing) {
        await api.put(`/api/maintenance/templates/${editing.id}`, body)
      }
      await load()
      cancel()
    } catch { setError('Could not save template') }
    finally { setSaving(false) }
  }

  const num = (v: string) => v === '' ? undefined : parseInt(v)

  return (
    <div className="panel area-panel">
      <div className="section-heading">
        <h2>Maintenance Templates</h2>
        <span className="tag">{templates.length} types</span>
      </div>
      {error && <p className="hint-text" style={{ color: 'var(--color-danger,#e53)' }}>{error}</p>}

      {!isNew && !editing && (
        <button className="btn-primary" style={{ marginBottom: 12 }} onClick={startNew}>+ Add Type</button>
      )}

      {(isNew || editing) && (
        <form onSubmit={save} style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="form-actions sticky-form-actions">
            <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            <button className="btn-secondary" type="button" onClick={cancel}>Cancel</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <div className="form-row" style={{ flex: 2, minWidth: 180 }}>
              <label>Event Type Name</label>
              <input value={form.eventType} onChange={e => setForm(f => ({ ...f, eventType: e.target.value }))} required />
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 100 }}>
              <label>Sort Order</label>
              <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 999 }))} />
            </div>
          </div>
          <div className="form-row">
            <label>Description</label>
            <input value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value || undefined }))} placeholder="Optional short description" />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
              <label>Every X Miles</label>
              <input type="number" min="0" value={form.mileInterval ?? ''} onChange={e => setForm(f => ({ ...f, mileInterval: num(e.target.value) }))} placeholder="e.g. 5000" />
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
              <label>Every X Days</label>
              <input type="number" min="0" value={form.dayInterval ?? ''} onChange={e => setForm(f => ({ ...f, dayInterval: num(e.target.value) }))} placeholder="e.g. 180" />
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
              <label>Warn Miles Out</label>
              <input type="number" min="0" value={form.warnMilesOut} onChange={e => setForm(f => ({ ...f, warnMilesOut: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
              <label>Warn Days Out</label>
              <input type="number" min="0" value={form.warnDaysOut} onChange={e => setForm(f => ({ ...f, warnDaysOut: parseInt(e.target.value) || 0 }))} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
            Active (shows in maintenance form)
          </label>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Type</th>
            <th>Miles</th>
            <th>Days</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {templates.map(t => (
            <tr key={t.id} style={{ opacity: t.isActive ? 1 : 0.45 }}>
              <td>{t.sortOrder}</td>
              <td>
                <strong>{t.eventType}</strong>
                {t.description && <p className="hint-text" style={{ margin: 0 }}>{t.description}</p>}
              </td>
              <td>{t.mileInterval != null ? `${t.mileInterval.toLocaleString()} mi` : '—'}</td>
              <td>{t.dayInterval != null ? `${t.dayInterval} days` : '—'}</td>
              <td><span className={t.isActive ? 'tag tag-ok' : 'tag tag-muted'}>{t.isActive ? 'Active' : 'Inactive'}</span></td>
              <td>
                <button className="btn-secondary" onClick={() => startEdit(t)}>Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
