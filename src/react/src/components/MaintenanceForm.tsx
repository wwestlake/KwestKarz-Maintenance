import { useState } from 'react'
import type { FormEvent } from 'react'
import { maintenanceTypes } from '../constants'

type MaintenanceFormState = {
  eventType: string
  datePerformed: string
  odometer: string
  performedBy: string
  cost: string
  nextDueDate: string
  nextDueOdometer: string
  notes: string
}

type Props = {
  form: MaintenanceFormState
  receiptFile: File | null
  receiptInsight: string
  loading: boolean
  onChange: (form: MaintenanceFormState) => void
  onSubmit: (event: FormEvent) => void
  onReadReceipt: () => void
  onReceiptFileChange: (file: File | null) => void
  onCancel: () => void
}

export function MaintenanceForm({
  form,
  receiptFile,
  receiptInsight,
  loading,
  onChange,
  onSubmit,
  onReadReceipt,
  onReceiptFileChange,
  onCancel,
}: Props) {
  const [showMaintenanceTypes, setShowMaintenanceTypes] = useState(false)

  return (
    <div className="panel">
      <div className="section-heading">
        <h2>Log Maintenance</h2>
        <button className="secondary-button" type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <form className="maintenance-form" onSubmit={onSubmit}>
        <div className="quick-actions wide">
          <button className="type-picker-button" type="button" onClick={() => setShowMaintenanceTypes(!showMaintenanceTypes)}>
            Maintenance Type
          </button>
          {['Oil Change', 'Car Wash', 'Mechanical Repair'].map((type) => (
            <button
              key={type}
              className={form.eventType === type ? 'action-chip selected' : 'action-chip'}
              type="button"
              onClick={() => onChange({ ...form, eventType: type })}
            >
              {type === 'Mechanical Repair' ? 'Repair' : type}
            </button>
          ))}
        </div>
        {showMaintenanceTypes && (
          <div className="type-picker wide">
            {maintenanceTypes.map((type) => (
              <button
                key={type}
                className={form.eventType === type ? 'type-option selected' : 'type-option'}
                type="button"
                onClick={() => {
                  onChange({ ...form, eventType: type })
                  setShowMaintenanceTypes(false)
                }}
              >
                {type}
              </button>
            ))}
          </div>
        )}
        <label>
          <span>Event</span>
          <input value={form.eventType} onChange={(e) => onChange({ ...form, eventType: e.target.value })} />
        </label>
        <label>
          <span>Date</span>
          <input type="date" value={form.datePerformed} onChange={(e) => onChange({ ...form, datePerformed: e.target.value })} />
        </label>
        <label>
          <span>Odometer</span>
          <input inputMode="numeric" value={form.odometer} onChange={(e) => onChange({ ...form, odometer: e.target.value })} />
        </label>
        <label>
          <span>Cost</span>
          <input inputMode="decimal" value={form.cost} onChange={(e) => onChange({ ...form, cost: e.target.value })} />
        </label>
        <label>
          <span>Next Due Date</span>
          <input type="date" value={form.nextDueDate} onChange={(e) => onChange({ ...form, nextDueDate: e.target.value })} />
        </label>
        <label>
          <span>Next Due Miles</span>
          <input inputMode="numeric" value={form.nextDueOdometer} onChange={(e) => onChange({ ...form, nextDueOdometer: e.target.value })} />
        </label>
        <label className="wide">
          <span>Notes</span>
          <textarea value={form.notes} onChange={(e) => onChange({ ...form, notes: e.target.value })} />
        </label>
        <div className="receipt-panel wide">
          <label>
            <span>Receipt / Photo</span>
            <input type="file" accept="image/*" onChange={(e) => onReceiptFileChange(e.target.files?.[0] ?? null)} />
          </label>
          <button type="button" className="secondary-button" disabled={!receiptFile || loading} onClick={onReadReceipt}>
            Read Receipt
          </button>
          {receiptInsight && <pre className="receipt-insight">{receiptInsight}</pre>}
        </div>
        <button type="submit" disabled={loading}>Save Maintenance</button>
      </form>
    </div>
  )
}
