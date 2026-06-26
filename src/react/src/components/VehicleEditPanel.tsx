import type { FormEvent } from 'react'
import type { EditVehicleForm } from '../types'
import { vehicleStatuses } from '../constants'
import { US_STATE_CODES } from '../utils'

type Props = {
  form: EditVehicleForm
  loading: boolean
  onChange: (form: EditVehicleForm) => void
  onSubmit: (event: FormEvent) => void
  onCancel: () => void
}

export function VehicleEditPanel({ form, loading, onChange, onSubmit, onCancel }: Props) {
  return (
    <div className="panel">
      <div className="section-heading">
        <h2>Edit Vehicle</h2>
        <button className="secondary-button" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <form className="vehicle-edit-form" onSubmit={onSubmit}>
        <div className="form-actions sticky-form-actions">
          <button type="submit" disabled={loading}>Save Changes</button>
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
        <label>
          <span>Color</span>
          <input
            value={form.color}
            onChange={(e) => onChange({ ...form, color: e.target.value })}
            placeholder="e.g. Silver"
          />
        </label>
        <label>
          <span>License Plate</span>
          <input
            value={form.licensePlate}
            onChange={(e) => onChange({ ...form, licensePlate: e.target.value.toUpperCase() })}
            placeholder="e.g. ABC1234"
          />
        </label>
        <label>
          <span>Plate State</span>
          <select
            value={form.licensePlateState}
            onChange={(e) => onChange({ ...form, licensePlateState: e.target.value })}
          >
            <option value="">— select —</option>
            {US_STATE_CODES.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select value={form.status} onChange={(e) => onChange({ ...form, status: e.target.value })}>
            {vehicleStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Odometer</span>
          <input
            type="number"
            min={0}
            value={form.currentOdometer}
            onChange={(e) => onChange({ ...form, currentOdometer: e.target.value })}
            placeholder="Current miles"
          />
        </label>
        <label>
          <span>Fleet Position</span>
          <input
            value={form.fleetPositionNumber}
            onChange={(e) => onChange({ ...form, fleetPositionNumber: e.target.value })}
            placeholder="e.g. 01"
          />
        </label>
        <label>
          <span>Notes</span>
          <textarea
            value={form.notes}
            rows={3}
            onChange={(e) => onChange({ ...form, notes: e.target.value })}
          />
        </label>
      </form>
    </div>
  )
}
