import { useState } from 'react'
import type { Vehicle, VinDecode } from '../types'
import { validateVin } from '../utils'

export type VinConfirm = {
  rawVin: string
  correctedVin: string
  foundVehicle: Vehicle | null
  decoded: VinDecode | null
  checksumValid: boolean
  checksumReason?: string
  scanTarget: string
}

type Props = {
  confirm: VinConfirm
  loading: boolean
  onOpenVehicle: () => void
  onAddToFleet: () => void
  onRecheck: (vin: string) => void
  onScanAgain: () => void
  onDismiss: () => void
}

export function VinConfirmModal({
  confirm,
  loading,
  onOpenVehicle,
  onAddToFleet,
  onRecheck,
  onScanAgain,
  onDismiss,
}: Props) {
  const [editVin, setEditVin] = useState(confirm.correctedVin)
  const isDirty = editVin.trim().toUpperCase() !== confirm.correctedVin
  const editValidation = validateVin(editVin)

  const vehicleLabel = confirm.foundVehicle
    ? [confirm.foundVehicle.year, confirm.foundVehicle.make, confirm.foundVehicle.model, confirm.foundVehicle.trim]
        .filter(Boolean).join(' ')
    : null

  const decodedLabel = confirm.decoded && !confirm.foundVehicle
    ? [confirm.decoded.year, confirm.decoded.make, confirm.decoded.model, confirm.decoded.trim]
        .filter(Boolean).join(' ')
    : null

  return (
    <div className="camera-modal" role="dialog" aria-modal="true" aria-label="Confirm VIN">
      <div className="vin-confirm-panel">
        <div className="vin-confirm-header">
          <strong>Confirm VIN</strong>
          <button className="secondary-button" type="button" onClick={onDismiss}>Dismiss</button>
        </div>

        <div className="vin-confirm-body">
          {confirm.rawVin !== confirm.correctedVin && (
            <p className="vin-confirm-raw">Originally read: <code>{confirm.rawVin}</code></p>
          )}

          <label className="vin-confirm-label">
            <span>VIN</span>
            <input
              value={editVin}
              onChange={(e) => setEditVin(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              maxLength={17}
              className="vin-confirm-input"
            />
          </label>

          {/* Checksum badge */}
          <div className={`vin-confirm-check ${confirm.checksumValid ? 'vin-check-ok' : 'vin-check-warn'}`}>
            <span>{confirm.checksumValid ? '✓ VIN checksum valid' : `⚠ ${confirm.checksumReason}`}</span>
          </div>

          {/* Fleet result */}
          {confirm.foundVehicle ? (
            <div className="vin-confirm-result vin-result-found">
              <span className="vin-result-icon">✓</span>
              <div>
                <strong>Found in your fleet</strong>
                <span>{vehicleLabel}</span>
                {confirm.foundVehicle.licensePlate && (
                  <span>{confirm.foundVehicle.licensePlate} · {confirm.foundVehicle.licensePlateState}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="vin-confirm-result vin-result-missing">
              <span className="vin-result-icon">○</span>
              <div>
                <strong>Not in your fleet</strong>
                {decodedLabel && <span>Decoded: {decodedLabel}</span>}
                {!decodedLabel && <span>VIN decode unavailable</span>}
              </div>
            </div>
          )}

          {/* Re-check after correction */}
          {isDirty && editValidation.valid && (
            <button
              type="button"
              className="secondary-button"
              disabled={loading}
              onClick={() => onRecheck(editVin)}
            >
              Check Fleet for {editVin.trim().toUpperCase()}
            </button>
          )}
          {isDirty && !editValidation.valid && (
            <p className="vin-confirm-check vin-check-warn">
              <span>⚠ {editValidation.reason}</span>
            </p>
          )}
        </div>

        <div className="vin-confirm-actions">
          <button type="button" className="secondary-button" disabled={loading} onClick={onScanAgain}>
            Scan Again
          </button>
          {confirm.foundVehicle ? (
            <button type="button" disabled={loading} onClick={onOpenVehicle}>
              Open Vehicle
            </button>
          ) : (
            <button type="button" disabled={loading || !confirm.checksumValid} onClick={onAddToFleet}>
              Add to Fleet
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
