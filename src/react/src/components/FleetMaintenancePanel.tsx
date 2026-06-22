import { useEffect, useState } from 'react'
import { api } from '../api'

type NextDue = {
  eventType: string
  dueStatus: string
  nextDueDate?: string
  nextDueOdometer?: number
}

type FleetVehicleSummary = {
  vehicleId: string
  vin: string
  label: string
  status: string
  currentOdometer?: number
  fleetPositionNumber?: string
  overdueCount: number
  dueSoonCount: number
  nextDue?: NextDue
  lastMaintenanceDate?: string
}

type Props = {
  onOpenVehicle: (vehicleId: string) => void
}

function urgencyScore(v: FleetVehicleSummary) {
  if (v.overdueCount > 0) return 0
  if (v.dueSoonCount > 0) return 1
  return 2
}

function StatusBadge({ v }: { v: FleetVehicleSummary }) {
  if (v.overdueCount > 0)
    return <span className="tag tag-danger">{v.overdueCount} overdue</span>
  if (v.dueSoonCount > 0)
    return <span className="tag tag-warn">{v.dueSoonCount} due soon</span>
  return <span className="tag tag-ok">OK</span>
}

function nextDueLabel(nd: NextDue) {
  const parts = [nd.eventType]
  if (nd.nextDueDate) parts.push(nd.nextDueDate)
  if (nd.nextDueOdometer) parts.push(`${nd.nextDueOdometer.toLocaleString()} mi`)
  return parts.join(' · ')
}

export function FleetMaintenancePanel({ onOpenVehicle }: Props) {
  const [summaries, setSummaries] = useState<FleetVehicleSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<FleetVehicleSummary[]>('/api/maintenance/fleet-summary')
      .then(data => setSummaries([...data].sort((a, b) => urgencyScore(a) - urgencyScore(b))))
      .catch(() => setError('Could not load fleet summary'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p className="hint-text">Loading fleet...</p>
  if (error) return <p className="hint-text" style={{ color: 'var(--color-danger,#e53)' }}>{error}</p>

  const overdueVehicles = summaries.filter(v => v.overdueCount > 0).length
  const dueSoonVehicles = summaries.filter(v => v.dueSoonCount > 0).length

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="tag tag-danger">{overdueVehicles} vehicle{overdueVehicles !== 1 ? 's' : ''} overdue</span>
        <span className="tag tag-warn">{dueSoonVehicles} due soon</span>
        <span className="tag tag-muted">{summaries.length} total</span>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Vehicle</th>
            <th>Status</th>
            <th>Next Due</th>
            <th>Last Service</th>
            <th>Miles</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {summaries.map(v => (
            <tr
              key={v.vehicleId}
              style={{
                opacity: v.status === 'Active' ? 1 : 0.55,
                background: v.overdueCount > 0
                  ? 'color-mix(in srgb, var(--color-danger,#e53) 8%, transparent)'
                  : v.dueSoonCount > 0
                    ? 'color-mix(in srgb, var(--color-warn,#f90) 8%, transparent)'
                    : undefined,
              }}
            >
              <td>
                <strong>{v.label}</strong>
                {v.fleetPositionNumber && (
                  <p className="hint-text" style={{ margin: 0 }}>#{v.fleetPositionNumber}</p>
                )}
              </td>
              <td><StatusBadge v={v} /></td>
              <td style={{ fontSize: '0.85em' }}>
                {v.nextDue
                  ? <span style={{ color: v.nextDue.dueStatus === 'overdue' ? 'var(--color-danger,#e53)' : v.nextDue.dueStatus === 'due_soon' ? 'var(--color-warn,#f90)' : undefined }}>
                      {nextDueLabel(v.nextDue)}
                    </span>
                  : <span className="hint-text">—</span>}
              </td>
              <td style={{ fontSize: '0.85em' }}>{v.lastMaintenanceDate ?? <span className="hint-text">none</span>}</td>
              <td style={{ fontSize: '0.85em' }}>{v.currentOdometer?.toLocaleString() ?? '—'}</td>
              <td>
                <button className="btn-secondary" onClick={() => onOpenVehicle(v.vehicleId)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
