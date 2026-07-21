import { useState } from 'react'
import { RotateCw, AlertCircle, CheckCircle } from 'lucide-react'
import { api } from '../api'

type RescanStatus = 'idle' | 'scanning' | 'success' | 'error'

type RescanResult = {
  totalScanned: number
  successCount: number
  failureCount: number
  results: {
    vehicleId: string
    vin: string
    bodyClass: string | null
    transmission: string | null
    success: boolean
    error: string | null
  }[]
}

export function AdminPanel() {
  const [rescanStatus, setRescanStatus] = useState<RescanStatus>('idle')
  const [rescanResult, setRescanResult] = useState<RescanResult | null>(null)
  const [error, setError] = useState('')

  const handleRescanVins = async () => {
    setRescanStatus('scanning')
    setError('')
    setRescanResult(null)

    try {
      const result = await api.post<RescanResult>('/api/vehicles/rescan-vins', {})
      setRescanResult(result)
      setRescanStatus('success')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rescan VINs')
      setRescanStatus('error')
    }
  }

  return (
    <div className="admin-panel">
      <h2 className="panel-title">Admin Tools</h2>

      <div className="admin-section">
        <h3 className="admin-section-title">Vehicle Management</h3>

        <div className="admin-card">
          <div className="admin-card-header">
            <h4>Rescan Fleet VINs</h4>
            <p className="admin-card-subtitle">
              Look up all vehicle VINs with NHTSA and update body class & transmission
            </p>
          </div>

          <button
            onClick={handleRescanVins}
            disabled={rescanStatus === 'scanning'}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RotateCw size={18} />
            {rescanStatus === 'scanning' ? 'Scanning...' : 'Start Rescan'}
          </button>

          {rescanStatus === 'success' && rescanResult && (
            <div className="admin-result admin-result--success">
              <CheckCircle size={20} />
              <div>
                <strong>Rescan Complete</strong>
                <p>
                  Scanned {rescanResult.totalScanned} vehicles: {rescanResult.successCount} succeeded,{' '}
                  {rescanResult.failureCount} failed
                </p>
                {rescanResult.results.length > 0 && (
                  <div className="rescan-results-list">
                    {rescanResult.results.map((r) => (
                      <div key={r.vehicleId} className="rescan-result-item">
                        <span className={r.success ? 'result-success' : 'result-error'}>
                          {r.success ? '✓' : '✕'}
                        </span>
                        <span className="result-vin">{r.vin}</span>
                        {r.success && (
                          <span className="result-specs">
                            {r.bodyClass && <span>{r.bodyClass}</span>}
                            {r.transmission && <span>{r.transmission}</span>}
                          </span>
                        )}
                        {!r.success && <span className="result-error-text">{r.error}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {rescanStatus === 'error' && (
            <div className="admin-result admin-result--error">
              <AlertCircle size={20} />
              <div>
                <strong>Rescan Failed</strong>
                <p>{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
