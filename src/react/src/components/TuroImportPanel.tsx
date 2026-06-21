import type { FormEvent } from 'react'
import type { TuroTripImportResponse, TuroMaintenanceSignal } from '../types'

type Props = {
  turoImportFile: File | null
  turoImportResult: TuroTripImportResponse | null
  turoMaintenanceSignals: TuroMaintenanceSignal[]
  loading: boolean
  onFileChange: (file: File | null) => void
  onImport: (event: FormEvent) => void
  onRefreshSignals: () => void
}

export function TuroImportPanel({
  turoImportFile,
  turoImportResult,
  turoMaintenanceSignals,
  loading,
  onFileChange,
  onImport,
  onRefreshSignals,
}: Props) {
  return (
    <>
      <div className="panel area-panel">
        <div className="section-heading">
          <div>
            <h2>Turo Trip Import</h2>
            <p>Reservation ID is used to update existing rows instead of duplicating them.</p>
          </div>
        </div>
        <form className="import-form" onSubmit={onImport}>
          <label>
            <span>Trip earnings CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
          </label>
          <button type="submit" disabled={loading || !turoImportFile}>Import Trips</button>
        </form>
        {turoImportResult && (
          <div className="import-summary">
            <div><span>Rows</span><strong>{turoImportResult.rowCount}</strong></div>
            <div><span>New</span><strong>{turoImportResult.insertedCount}</strong></div>
            <div><span>Updated</span><strong>{turoImportResult.updatedCount}</strong></div>
            <div><span>Vehicle Matches</span><strong>{turoImportResult.vehicleMatches}</strong></div>
          </div>
        )}
        {turoImportResult && (
          <div className="record-list">
            {turoImportResult.vehicleSummaries.slice(0, 8).map((summary) => (
              <article key={`${summary.vin}-${summary.turoVehicleId}`} className="record">
                <strong>{summary.vehicleName ?? summary.vin ?? 'Unknown vehicle'}</strong>
                <span>{summary.vin ?? 'No VIN'} - {summary.importedTrips} trips</span>
                <p>
                  {summary.importedMiles.toLocaleString()} imported miles
                  {summary.latestOdometer ? ` - latest odometer ${summary.latestOdometer.toLocaleString()}` : ''}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="panel area-panel wide-panel">
        <div className="section-heading">
          <div>
            <h2>Maintenance Signals From Turo</h2>
            <p>{turoMaintenanceSignals.length} vehicles with imported trip history</p>
          </div>
          <button className="secondary-button" type="button" disabled={loading} onClick={onRefreshSignals}>
            Refresh
          </button>
        </div>
        <div className="record-list">
          {turoMaintenanceSignals.length === 0 && (
            <p className="empty">Import Turo trip earnings to generate maintenance signals.</p>
          )}
          {turoMaintenanceSignals.map((signal, index) => {
            const importedMiles = signal.importedMiles ?? 0
            const completedTrips = signal.completedTrips ?? 0
            const suggestedActions = signal.suggestedActions ?? []
            const key = signal.vehicleId ?? signal.vin ?? `signal-${index}`
            return (
              <article key={key} className="record">
                <div className="record-heading">
                  <strong>{signal.vehicleLabel ?? signal.vin ?? 'Unmatched Turo vehicle'}</strong>
                  <span>{completedTrips} completed trips</span>
                </div>
                <p>
                  {importedMiles.toLocaleString()} imported miles
                  {signal.latestImportedOdometer ? ` - latest odometer ${signal.latestImportedOdometer.toLocaleString()}` : ''}
                  {signal.milesSinceLatestMaintenance != null ? ` - ${signal.milesSinceLatestMaintenance.toLocaleString()} miles since latest maintenance` : ''}
                </p>
                <div className="match-list">
                  {suggestedActions.length === 0 ? (
                    <span className="status-chip good">No predicted action yet</span>
                  ) : (
                    suggestedActions.map((action) => (
                      <span key={action} className="status-chip warning">{action}</span>
                    ))
                  )}
                </div>
              </article>
            )
          })}
        </div>
      </div>
    </>
  )
}
