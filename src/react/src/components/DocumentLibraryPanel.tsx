import { useEffect, useState } from 'react'
import { api } from '../api'

type Doc = {
  id: string
  ownerType: string
  ownerId: string
  kind: string
  originalFileName: string
  contentType: string
  sizeBytes: number
  description?: string
  createdBy?: string
  createdAt: string
}

type Props = {
  vehicleId: string
}

const ownerLabels: Record<string, string> = {
  Vehicle: 'Vehicle Documents',
  MaintenanceRecord: 'Maintenance Receipts & Photos',
  DiagnosticReport: 'OBD2 / Diagnostic Reports',
  IncidentRecord: 'Incident Records',
}

function sizeLabel(bytes: number) {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

export function DocumentLibraryPanel({ vehicleId }: Props) {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!vehicleId) return
    setLoading(true)
    api.get<Doc[]>(`/api/vehicles/${vehicleId}/documents/all`)
      .then(setDocs)
      .catch(() => setError('Could not load documents'))
      .finally(() => setLoading(false))
  }, [vehicleId])

  if (loading) return <p className="hint-text">Loading documents...</p>
  if (error) return <p className="hint-text" style={{ color: 'var(--color-danger,#e53)' }}>{error}</p>

  const groups = docs.reduce<Record<string, Doc[]>>((acc, d) => {
    const key = d.ownerType
    if (!acc[key]) acc[key] = []
    acc[key].push(d)
    return acc
  }, {})

  const groupOrder = ['Vehicle', 'MaintenanceRecord', 'DiagnosticReport', 'IncidentRecord']
  const sortedGroups = [
    ...groupOrder.filter(k => groups[k]),
    ...Object.keys(groups).filter(k => !groupOrder.includes(k)),
  ]

  if (docs.length === 0) {
    return <p className="hint-text">No documents attached yet.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {sortedGroups.map(ownerType => (
        <div key={ownerType}>
          <h3 style={{ fontSize: '0.9em', fontWeight: 600, marginBottom: 6, opacity: 0.7 }}>
            {ownerLabels[ownerType] ?? ownerType}
            <span className="tag tag-muted" style={{ marginLeft: 8 }}>{groups[ownerType].length}</span>
          </h3>
          <div className="record-list">
            {groups[ownerType].map(doc => (
              <article key={doc.id} className="record" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {doc.originalFileName}
                  </strong>
                  <span className="hint-text">{doc.kind} · {sizeLabel(doc.sizeBytes)}</span>
                  {doc.description && (
                    <p className="hint-text" style={{ margin: '2px 0 0', fontSize: '0.8em' }}>
                      {doc.description.slice(0, 120)}{doc.description.length > 120 ? '…' : ''}
                    </p>
                  )}
                </div>
                <a
                  href={`/api/documents/${doc.id}/content`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                  style={{ flexShrink: 0, textDecoration: 'none' }}
                >
                  View
                </a>
              </article>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
