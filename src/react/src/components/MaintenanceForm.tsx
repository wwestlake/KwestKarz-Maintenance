import { useState } from 'react'
import type { FormEvent } from 'react'
import type { ServiceSchedule } from '../types'

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
  serviceSchedules: ServiceSchedule[]
  currentOdometer?: number
  onChange: (form: MaintenanceFormState) => void
  onSubmit: (event: FormEvent) => void
  onReadReceipt: () => void
  onReceiptFileChange: (file: File | null) => void
  onCancel: () => void
}

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function MaintenanceForm({
  form,
  receiptFile,
  receiptInsight,
  loading,
  serviceSchedules,
  currentOdometer,
  onChange,
  onSubmit,
  onReadReceipt,
  onReceiptFileChange,
  onCancel,
}: Props) {
  const [showMaintenanceTypes, setShowMaintenanceTypes] = useState(false)

  function applyType(type: string) {
    const schedule = serviceSchedules.find(
      (s) => s.eventType.toLowerCase() === type.toLowerCase()
    )
    const nextDueOdometer =
      schedule?.mileInterval != null && currentOdometer != null
        ? String(currentOdometer + schedule.mileInterval)
        : form.nextDueOdometer
    const nextDueDate =
      schedule?.dayInterval != null ? addDays(schedule.dayInterval) : form.nextDueDate

    onChange({ ...form, eventType: type, nextDueOdometer, nextDueDate })
    setShowMaintenanceTypes(false)
  }

  const activeSchedule = serviceSchedules.find(
    (s) => s.eventType.toLowerCase() === form.eventType.toLowerCase()
  )

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
              onClick={() => applyType(type)}
            >
              {type === 'Mechanical Repair' ? 'Repair' : type}
            </button>
          ))}
        </div>
        {showMaintenanceTypes && (
          <div className="type-picker wide">
            {serviceSchedules.map((s) => (
              <button
                key={s.eventType}
                className={form.eventType === s.eventType ? 'type-option selected' : 'type-option'}
                type="button"
                onClick={() => applyType(s.eventType)}
              >
                {s.eventType}
                {(s.mileInterval != null || s.dayInterval != null) && (
                  <span className="schedule-dot" title="Auto-fill available" />
                )}
              </button>
            ))}
          </div>
        )}
        {activeSchedule && (
          <p className="schedule-hint wide">
            Schedule: every
            {activeSchedule.mileInterval != null ? ` ${activeSchedule.mileInterval.toLocaleString()} mi` : ''}
            {activeSchedule.mileInterval != null && activeSchedule.dayInterval != null ? ' /' : ''}
            {activeSchedule.dayInterval != null ? ` ${activeSchedule.dayInterval} days` : ''}
            {' — next due fields pre-filled'}
          </p>
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
