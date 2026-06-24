import type { FormEvent } from 'react'
import type { TirePressureSnapshot } from '../types'

type TirePsiForm = {
  frontLeftPsi: string
  frontRightPsi: string
  rearLeftPsi: string
  rearRightPsi: string
  notes: string
}

type Props = {
  tirePressure: TirePressureSnapshot
  tireSpecForm: TirePsiForm
  tireLogForm: TirePsiForm
  tirePressureInsight: string
  loading: boolean
  onSpecChange: (form: TirePsiForm) => void
  onLogChange: (form: TirePsiForm) => void
  onSpecSubmit: (event: FormEvent) => void
  onLogSubmit: (event: FormEvent) => void
  onScanSpec: () => void
  onScanLog: () => void
}

export function TirePressurePanel({
  tirePressure,
  tireSpecForm,
  tireLogForm,
  tirePressureInsight,
  loading,
  onSpecChange,
  onLogChange,
  onSpecSubmit,
  onLogSubmit,
  onScanSpec,
  onScanLog,
}: Props) {
  const specSummary = tirePressure.spec
    ? `FL ${tirePressure.spec.frontLeftPsi ?? '?'} / FR ${tirePressure.spec.frontRightPsi ?? '?'} / RL ${tirePressure.spec.rearLeftPsi ?? '?'} / RR ${tirePressure.spec.rearRightPsi ?? '?'} PSI`
    : 'No factory spec saved'

  return (
    <div className="panel tire-pressure-panel">
      <div className="section-heading">
        <h2>Tire Pressure</h2>
        <p>{specSummary}</p>
      </div>

      <div className="tire-grid">
        <form className="tire-card" onSubmit={onSpecSubmit}>
          <div className="section-heading compact-heading">
            <h2>Factory Spec</h2>
            <button className="secondary-button" type="button" disabled={loading} onClick={onScanSpec}>
              Scan Plate
            </button>
          </div>
          {(['frontLeftPsi', 'frontRightPsi', 'rearLeftPsi', 'rearRightPsi'] as const).map((key) => {
            const labels: Record<string, string> = {
              frontLeftPsi: 'Front Left', frontRightPsi: 'Front Right',
              rearLeftPsi: 'Rear Left', rearRightPsi: 'Rear Right',
            }
            return (
              <label key={key}>
                <span>{labels[key]}</span>
                <input
                  inputMode="numeric"
                  value={tireSpecForm[key]}
                  onChange={(e) => onSpecChange({ ...tireSpecForm, [key]: e.target.value })}
                />
              </label>
            )
          })}
          <label className="wide">
            <span>Notes</span>
            <textarea value={tireSpecForm.notes} onChange={(e) => onSpecChange({ ...tireSpecForm, notes: e.target.value })} />
          </label>
          <button type="submit" disabled={loading}>Save Spec</button>
        </form>

        <form className="tire-card" onSubmit={onLogSubmit}>
          <div className="section-heading compact-heading">
            <h2>Actual Readings</h2>
            <button className="secondary-button" type="button" disabled={loading} onClick={onScanLog}>
              Scan Readings
            </button>
          </div>
          {(['frontLeftPsi', 'frontRightPsi', 'rearLeftPsi', 'rearRightPsi'] as const).map((key) => {
            const labels: Record<string, string> = {
              frontLeftPsi: 'Front Left', frontRightPsi: 'Front Right',
              rearLeftPsi: 'Rear Left', rearRightPsi: 'Rear Right',
            }
            return (
              <label key={key}>
                <span>{labels[key]}</span>
                <input
                  inputMode="numeric"
                  value={tireLogForm[key]}
                  onChange={(e) => onLogChange({ ...tireLogForm, [key]: e.target.value })}
                />
              </label>
            )
          })}
          <label className="wide">
            <span>Notes</span>
            <textarea value={tireLogForm.notes} onChange={(e) => onLogChange({ ...tireLogForm, notes: e.target.value })} />
          </label>
          <button type="submit" disabled={loading}>Save Pressure Log</button>
        </form>
      </div>

      {tirePressureInsight && (
        <div className="wide">
          <p className="context">Last tire scan readout</p>
          <pre className="receipt-insight">{tirePressureInsight}</pre>
        </div>
      )}

      <div className="record-list tire-log-list">
        {tirePressure.recentLogs.length === 0 && <p className="empty">No tire pressure logs yet.</p>}
        {tirePressure.recentLogs.map((log) => (
          <article key={log.id} className={`record tire-log status-${log.status.toLowerCase()}`}>
            <strong>{log.status}</strong>
            <span>{new Date(log.measuredAt).toLocaleString()}</span>
            <p>FL {log.frontLeftPsi ?? '?'} / FR {log.frontRightPsi ?? '?'} / RL {log.rearLeftPsi ?? '?'} / RR {log.rearRightPsi ?? '?'} PSI</p>
          </article>
        ))}
      </div>
    </div>
  )
}
