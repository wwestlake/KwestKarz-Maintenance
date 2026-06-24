import { useRef, useState } from 'react'
import { api } from '../api'
import { extractVin, validateVin, normalizeState, US_STATE_CODES, computeFleetId } from '../utils'
import type { Vehicle, VinDecode } from '../types'

type Form = {
  vin: string
  year: string
  make: string
  model: string
  trim: string
  color: string
  licensePlate: string
  licensePlateState: string
  currentOdometer: string
  fleetIdOverride: string
}

type Props = {
  onClose: () => void
  onCreated: (vehicle: Vehicle) => void
}

const empty: Form = {
  vin: '', year: '', make: '', model: '', trim: '',
  color: '', licensePlate: '', licensePlateState: '',
  currentOdometer: '', fleetIdOverride: '',
}

function extractJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/)
  if (match) {
    try { return JSON.parse(match[0]) } catch { /* not valid JSON */ }
  }
  return {}
}

export function AddVehicleModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<Form>(empty)
  const [insuranceNotes, setInsuranceNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [vinValidation, setVinValidation] = useState<{ valid: boolean; reason?: string } | null>(null)
  const regInputRef = useRef<HTMLInputElement>(null)
  const insInputRef = useRef<HTMLInputElement>(null)

  const computedFleetId = computeFleetId(form.year, form.color, form.model, form.licensePlate)
  const fleetId = form.fleetIdOverride || computedFleetId

  function patch(updates: Partial<Form>) {
    setForm((prev) => ({ ...prev, ...updates }))
  }

  async function decodeVin(vin: string) {
    const check = validateVin(vin)
    setVinValidation(check)
    if (!check.valid) return
    try {
      const decoded = await api.get<VinDecode>(`/api/vin/${encodeURIComponent(vin)}/decode`)
      patch({
        year: decoded.year?.toString() ?? '',
        make: decoded.make ?? '',
        model: decoded.model ?? '',
        trim: decoded.trim ?? '',
      })
    } catch { /* decode failed — not critical */ }
  }

  async function scanRegistration(file: File) {
    setLoading(true)
    setMessage('Reading registration...')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('prompt', 'This is a vehicle registration document. Extract the following as a JSON object with these exact keys: vin, year (integer), make, model, trim, licensePlate, licensePlateState (2-letter US state code). Return only the JSON object, nothing else.')
      const result = await api.postForm<{ text: string }>('/api/ai/interpret-image', fd)
      const data = extractJson(result.text)
      const rawVin = typeof data.vin === 'string' ? data.vin.toUpperCase().trim() : extractVin(result.text)
      const rawState = typeof data.licensePlateState === 'string' ? data.licensePlateState : ''
      const state = normalizeState(rawState)
      patch({
        vin: rawVin || form.vin,
        year: data.year ? String(data.year) : form.year,
        make: typeof data.make === 'string' ? data.make : form.make,
        model: typeof data.model === 'string' ? data.model : form.model,
        trim: typeof data.trim === 'string' ? data.trim : form.trim,
        licensePlate: typeof data.licensePlate === 'string' ? data.licensePlate.toUpperCase() : form.licensePlate,
        licensePlateState: state || form.licensePlateState,
      })
      if (rawVin) await decodeVin(rawVin)
      setMessage('Registration read — review fields below.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read registration')
    } finally {
      setLoading(false)
    }
  }

  async function scanInsurance(file: File) {
    setLoading(true)
    setMessage('Reading insurance...')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('prompt', 'This is a vehicle insurance document. Extract as a JSON object with keys: provider, policyNumber, vin, effectiveDate (YYYY-MM-DD), expirationDate (YYYY-MM-DD). Return only the JSON object.')
      const result = await api.postForm<{ text: string }>('/api/ai/interpret-image', fd)
      const data = extractJson(result.text)
      const parts = [
        data.provider ? `Provider: ${data.provider}` : '',
        data.policyNumber ? `Policy #${data.policyNumber}` : '',
        data.effectiveDate ? `Eff: ${data.effectiveDate}` : '',
        data.expirationDate ? `Exp: ${data.expirationDate}` : '',
      ].filter(Boolean)
      setInsuranceNotes(parts.join(' · '))
      if (!form.vin && typeof data.vin === 'string') {
        const rawVin = data.vin.toUpperCase().trim()
        patch({ vin: rawVin })
        await decodeVin(rawVin)
      }
      setMessage('Insurance read.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read insurance')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!form.vin.trim()) { setMessage('VIN is required.'); return }
    const check = validateVin(form.vin)
    if (!check.valid) { setMessage(`VIN issue: ${check.reason}`); return }
    setLoading(true)
    setMessage('Creating vehicle...')
    try {
      const vehicle = await api.post<Vehicle>('/api/vehicles', {
        vin: form.vin.trim().toUpperCase(),
        year: form.year ? Number(form.year) : null,
        make: form.make || null,
        model: form.model || null,
        trim: form.trim || null,
        color: form.color || null,
        licensePlate: form.licensePlate || null,
        licensePlateState: form.licensePlateState || null,
        status: 'Active',
        currentOdometer: form.currentOdometer ? Number(form.currentOdometer) : null,
        fleetPositionNumber: fleetId || null,
        notes: insuranceNotes || null,
      })
      onCreated(vehicle)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create vehicle')
      setLoading(false)
    }
  }

  return (
    <div className="camera-modal" role="dialog" aria-modal="true" aria-label="Add Vehicle">
      <div className="add-vehicle-panel">
        <div className="add-veh-header">
          <strong>Add Vehicle</strong>
          <button className="secondary-button" type="button" onClick={onClose} disabled={loading}>Cancel</button>
        </div>

        <div className="add-veh-scans">
          <button
            type="button"
            className="add-veh-scan-btn"
            disabled={loading}
            onClick={() => regInputRef.current?.click()}
          >
            <span className="add-veh-scan-icon">📄</span>
            <span>Scan Registration</span>
          </button>
          <button
            type="button"
            className="add-veh-scan-btn"
            disabled={loading}
            onClick={() => insInputRef.current?.click()}
          >
            <span className="add-veh-scan-icon">📄</span>
            <span>Scan Insurance</span>
          </button>
        </div>

        {/* Hidden file inputs trigger camera on mobile */}
        <input
          ref={regInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void scanRegistration(f)
            e.target.value = ''
          }}
        />
        <input
          ref={insInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void scanInsurance(f)
            e.target.value = ''
          }}
        />

        {message && <p className="add-veh-message">{message}</p>}
        {insuranceNotes && <p className="add-veh-insurance-notes">{insuranceNotes}</p>}

        <div className="add-veh-form">
          {/* VIN */}
          <label className="add-veh-full">
            <span>VIN</span>
            <input
              value={form.vin}
              maxLength={17}
              autoCapitalize="characters"
              placeholder="17-character VIN"
              onChange={(e) => { patch({ vin: e.target.value.toUpperCase() }); setVinValidation(null) }}
              onBlur={() => { if (form.vin.length === 17) void decodeVin(form.vin) }}
            />
            {vinValidation && !vinValidation.valid && (
              <span className="vin-confirm-check vin-check-warn">⚠ {vinValidation.reason}</span>
            )}
            {vinValidation?.valid && (
              <span className="vin-confirm-check vin-check-ok">✓ VIN checksum valid</span>
            )}
          </label>

          {/* Year + Make */}
          <div className="add-veh-row">
            <label>
              <span>Year</span>
              <input
                value={form.year}
                maxLength={4}
                placeholder="e.g. 2019"
                onChange={(e) => patch({ year: e.target.value.replace(/\D/g, '') })}
              />
            </label>
            <label>
              <span>Make</span>
              <input value={form.make} placeholder="e.g. Chevrolet" onChange={(e) => patch({ make: e.target.value })} />
            </label>
          </div>

          {/* Model + Trim */}
          <div className="add-veh-row">
            <label>
              <span>Model</span>
              <input value={form.model} placeholder="e.g. Equinox" onChange={(e) => patch({ model: e.target.value })} />
            </label>
            <label>
              <span>Trim</span>
              <input value={form.trim} placeholder="e.g. LT" onChange={(e) => patch({ trim: e.target.value })} />
            </label>
          </div>

          {/* Color + Odometer */}
          <div className="add-veh-row">
            <label>
              <span>Color</span>
              <input value={form.color} placeholder="e.g. Copper" onChange={(e) => patch({ color: e.target.value })} />
            </label>
            <label>
              <span>Odometer</span>
              <input
                type="number"
                min={0}
                value={form.currentOdometer}
                placeholder="Miles"
                onChange={(e) => patch({ currentOdometer: e.target.value })}
              />
            </label>
          </div>

          {/* Plate + State */}
          <div className="add-veh-row">
            <label>
              <span>License Plate</span>
              <input
                value={form.licensePlate}
                placeholder="e.g. EXQ0769"
                onChange={(e) => patch({ licensePlate: e.target.value.toUpperCase() })}
              />
            </label>
            <label>
              <span>State</span>
              <select value={form.licensePlateState} onChange={(e) => patch({ licensePlateState: e.target.value })}>
                <option value="">— select —</option>
                {US_STATE_CODES.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Fleet ID */}
          <label className="add-veh-full">
            <span>Fleet ID {computedFleetId && !form.fleetIdOverride ? <em className="add-veh-auto">(auto: {computedFleetId})</em> : '(override)'}</span>
            <input
              value={form.fleetIdOverride}
              placeholder={computedFleetId || 'Fill year/color/model/plate to auto-generate'}
              onChange={(e) => patch({ fleetIdOverride: e.target.value.toUpperCase() })}
            />
            {computedFleetId && !form.fleetIdOverride && (
              <span className="add-veh-fleet-preview">{computedFleetId}</span>
            )}
          </label>
        </div>

        <div className="add-veh-actions">
          <button type="button" className="secondary-button" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="button" disabled={loading || !form.vin.trim()} onClick={() => void handleCreate()}>
            Create Vehicle
          </button>
        </div>
      </div>
    </div>
  )
}
