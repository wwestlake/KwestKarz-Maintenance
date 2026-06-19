import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Vehicle = {
  id: string
  vin: string
  year?: number
  make?: string
  model?: string
  trim?: string
  color?: string
  licensePlate?: string
  licensePlateState?: string
  status: string
  currentOdometer?: number
  fleetPositionNumber?: string
  notes?: string
}

type MaintenanceRecord = {
  id: string
  eventType: string
  datePerformed: string
  odometer?: number
  performedBy?: string
  cost?: number
  nextDueDate?: string
  nextDueOdometer?: number
  notes?: string
}

type DocumentRecord = {
  id: string
  kind: string
  originalFileName: string
  contentType: string
  sizeBytes: number
  description?: string
  createdAt: string
}

type Dashboard = {
  vehicle: Vehicle
  documents: DocumentRecord[]
  recentMaintenance: MaintenanceRecord[]
  nextDue?: {
    record: MaintenanceRecord
    dueStatus: string
  }
  aiContextSummary: string
}

type VinDecode = {
  vin: string
  year?: number
  make?: string
  model?: string
  trim?: string
  bodyClass?: string
  errorText?: string
}

type CreateVehicleForm = {
  vin: string
  year: string
  make: string
  model: string
  trim: string
  color: string
  licensePlate: string
  licensePlateState: string
  currentOdometer: string
  fleetPositionNumber: string
  notes: string
}

const emptyVehicleForm: CreateVehicleForm = {
  vin: '',
  year: '',
  make: '',
  model: '',
  trim: '',
  color: '',
  licensePlate: '',
  licensePlateState: '',
  currentOdometer: '',
  fleetPositionNumber: '',
  notes: '',
}

const maintenanceActions = [
  'Oil Change',
  'Tire Rotation',
  'Brake Inspection',
  'Battery',
  'Detail',
  'Inspection',
  'Registration',
  'Repair',
]

const api = {
  async get<T>(path: string): Promise<T> {
    const response = await fetch(path)
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  },
  async post<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  },
}

function App() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vin, setVin] = useState('')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [decoded, setDecoded] = useState<VinDecode | null>(null)
  const [vehicleForm, setVehicleForm] = useState<CreateVehicleForm>(emptyVehicleForm)
  const [maintenanceForm, setMaintenanceForm] = useState({
    eventType: 'Oil Change',
    datePerformed: new Date().toISOString().slice(0, 10),
    odometer: '',
    performedBy: '',
    cost: '',
    nextDueDate: '',
    nextDueOdometer: '',
    notes: '',
  })
  const [message, setMessage] = useState('Ready')
  const [loading, setLoading] = useState(false)

  const normalizedVin = vin.trim().toUpperCase()

  const vehicleTitle = useMemo(() => {
    const vehicle = dashboard?.vehicle
    if (!vehicle) return 'No vehicle selected'
    return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')
  }, [dashboard])

  useEffect(() => {
    refreshVehicles()
  }, [])

  async function refreshVehicles() {
    try {
      const nextVehicles = await api.get<Vehicle[]>('/api/vehicles')
      setVehicles(nextVehicles)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load vehicles')
    }
  }

  async function loadDashboard(vehicleId: string) {
    const nextDashboard = await api.get<Dashboard>(`/api/vehicles/${vehicleId}/dashboard`)
    setDashboard(nextDashboard)
  }

  async function openVehicle(vehicle: Vehicle) {
    setLoading(true)
    setMessage('Loading vehicle...')
    setDecoded(null)
    setVin(vehicle.vin)

    try {
      await loadDashboard(vehicle.id)
      setMessage('Vehicle loaded')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load vehicle')
    } finally {
      setLoading(false)
    }
  }

  function showFleet() {
    setDashboard(null)
    setDecoded(null)
    setVin('')
    setMessage('Ready')
  }

  async function lookupVehicle(event?: FormEvent) {
    event?.preventDefault()
    if (!normalizedVin) return

    setLoading(true)
    setMessage('Looking up vehicle...')
    setDashboard(null)
    setDecoded(null)

    try {
      const vehicle = await api.get<Vehicle>(`/api/vehicles/by-vin/${encodeURIComponent(normalizedVin)}`)
      await loadDashboard(vehicle.id)
      setMessage('Vehicle loaded')
    } catch {
      setMessage('VIN not found. Decoding basics...')
      const decode = await api.get<VinDecode>(`/api/vin/${encodeURIComponent(normalizedVin)}/decode`)
      setDecoded(decode)
      setVehicleForm({
        ...emptyVehicleForm,
        vin: normalizedVin,
        year: decode.year?.toString() ?? '',
        make: decode.make ?? '',
        model: decode.model ?? '',
        trim: decode.trim ?? '',
      })
      setMessage('Decoded VIN. Confirm details to create the vehicle.')
    } finally {
      setLoading(false)
    }
  }

  async function createVehicle(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setMessage('Creating vehicle...')

    try {
      const vehicle = await api.post<Vehicle>('/api/vehicles', {
        vin: vehicleForm.vin.trim().toUpperCase(),
        year: vehicleForm.year ? Number(vehicleForm.year) : null,
        make: vehicleForm.make || null,
        model: vehicleForm.model || null,
        trim: vehicleForm.trim || null,
        color: vehicleForm.color || null,
        licensePlate: vehicleForm.licensePlate || null,
        licensePlateState: vehicleForm.licensePlateState || null,
        status: 'Active',
        currentOdometer: vehicleForm.currentOdometer ? Number(vehicleForm.currentOdometer) : null,
        fleetPositionNumber: vehicleForm.fleetPositionNumber || null,
        notes: vehicleForm.notes || null,
      })

      setVin(vehicle.vin)
      setDecoded(null)
      await loadDashboard(vehicle.id)
      await refreshVehicles()
      setMessage('Vehicle created')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not create vehicle')
    } finally {
      setLoading(false)
    }
  }

  async function logMaintenance(event: FormEvent) {
    event.preventDefault()
    if (!dashboard) return

    setLoading(true)
    setMessage('Logging maintenance...')

    try {
      await api.post<MaintenanceRecord>(`/api/vehicles/${dashboard.vehicle.id}/maintenance`, {
        eventType: maintenanceForm.eventType,
        datePerformed: maintenanceForm.datePerformed,
        odometer: maintenanceForm.odometer ? Number(maintenanceForm.odometer) : null,
        performedBy: maintenanceForm.performedBy || null,
        cost: maintenanceForm.cost ? Number(maintenanceForm.cost) : null,
        nextDueDate: maintenanceForm.nextDueDate || null,
        nextDueOdometer: maintenanceForm.nextDueOdometer ? Number(maintenanceForm.nextDueOdometer) : null,
        notes: maintenanceForm.notes || null,
      })
      await loadDashboard(dashboard.vehicle.id)
      await refreshVehicles()
      setMessage('Maintenance logged')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not log maintenance')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">KwestKarz Maintenance</p>
          <h1>Vehicle Workbench</h1>
        </div>
        <span className={loading ? 'status busy' : 'status'}>{message}</span>
      </header>

      <section className="lookup-band">
        <form className="lookup-form" onSubmit={lookupVehicle}>
          <label htmlFor="vin">VIN Lookup / Add Vehicle</label>
          <div className="lookup-row">
            <input
              id="vin"
              value={vin}
              onChange={(event) => setVin(event.target.value.toUpperCase())}
              placeholder="Scan or enter VIN"
              autoCapitalize="characters"
            />
            <button type="submit" disabled={loading || normalizedVin.length < 11}>
              Find
            </button>
          </div>
        </form>
      </section>

      {!dashboard && !decoded && (
        <section className="panel fleet-panel">
          <div className="section-heading">
            <h2>Fleet</h2>
            <p>{vehicles.length} vehicles</p>
          </div>
          <div className="vehicle-list">
            {vehicles.length === 0 && <p className="empty">No vehicles yet. Scan or enter a VIN to add one.</p>}
            {vehicles.map((vehicle) => {
              const title = [vehicle.fleetPositionNumber, vehicle.year, vehicle.make, vehicle.model]
                .filter(Boolean)
                .join(' ')

              return (
                <button key={vehicle.id} className="vehicle-list-item" type="button" onClick={() => openVehicle(vehicle)}>
                  <span>{title || vehicle.vin}</span>
                  <small>
                    {vehicle.vin} - {vehicle.currentOdometer?.toLocaleString() ?? 'No miles'} - {vehicle.status}
                  </small>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {decoded && (
        <section className="panel">
          <div className="section-heading">
            <h2>Create Vehicle</h2>
            <p>{decoded.errorText}</p>
          </div>
          <form className="vehicle-form" onSubmit={createVehicle}>
            {[
              ['vin', 'VIN'],
              ['year', 'Year'],
              ['make', 'Make'],
              ['model', 'Model'],
              ['trim', 'Trim'],
              ['color', 'Color'],
              ['licensePlate', 'Plate'],
              ['licensePlateState', 'State'],
              ['currentOdometer', 'Odometer'],
              ['fleetPositionNumber', 'Fleet #'],
            ].map(([key, label]) => (
              <label key={key}>
                <span>{label}</span>
                <input
                  value={vehicleForm[key as keyof CreateVehicleForm]}
                  onChange={(event) => setVehicleForm({ ...vehicleForm, [key]: event.target.value })}
                />
              </label>
            ))}
            <label className="wide">
              <span>Notes</span>
              <textarea
                value={vehicleForm.notes}
                onChange={(event) => setVehicleForm({ ...vehicleForm, notes: event.target.value })}
              />
            </label>
            <button type="submit" disabled={loading}>
              Create Vehicle
            </button>
          </form>
        </section>
      )}

      {dashboard && (
        <section className="dashboard-grid">
          <div className="summary-panel">
            <div className="section-heading">
              <div>
                <h2>{vehicleTitle}</h2>
                <p>{dashboard.vehicle.vin}</p>
              </div>
              <button className="secondary-button" type="button" onClick={showFleet}>
                Fleet
              </button>
            </div>
            <div className="metrics">
              <div>
                <span>Status</span>
                <strong>{dashboard.vehicle.status}</strong>
              </div>
              <div>
                <span>Odometer</span>
                <strong>{dashboard.vehicle.currentOdometer?.toLocaleString() ?? 'Unknown'}</strong>
              </div>
              <div>
                <span>Next Due</span>
                <strong>{dashboard.nextDue?.dueStatus ?? 'None'}</strong>
              </div>
            </div>
            <p className="context">{dashboard.aiContextSummary}</p>
          </div>

          <div className="panel">
            <div className="section-heading">
              <h2>Log Maintenance</h2>
              <p>Record the work while you are standing by the car.</p>
            </div>
            <form className="maintenance-form" onSubmit={logMaintenance}>
              <div className="quick-actions wide">
                {maintenanceActions.map((action) => (
                  <button
                    key={action}
                    className={maintenanceForm.eventType === action ? 'action-chip selected' : 'action-chip'}
                    type="button"
                    onClick={() => setMaintenanceForm({ ...maintenanceForm, eventType: action })}
                  >
                    {action}
                  </button>
                ))}
              </div>
              <label>
                <span>Event</span>
                <input
                  value={maintenanceForm.eventType}
                  onChange={(event) => setMaintenanceForm({ ...maintenanceForm, eventType: event.target.value })}
                />
              </label>
              <label>
                <span>Date</span>
                <input
                  type="date"
                  value={maintenanceForm.datePerformed}
                  onChange={(event) => setMaintenanceForm({ ...maintenanceForm, datePerformed: event.target.value })}
                />
              </label>
              <label>
                <span>Odometer</span>
                <input
                  inputMode="numeric"
                  value={maintenanceForm.odometer}
                  onChange={(event) => setMaintenanceForm({ ...maintenanceForm, odometer: event.target.value })}
                />
              </label>
              <label>
                <span>Cost</span>
                <input
                  inputMode="decimal"
                  value={maintenanceForm.cost}
                  onChange={(event) => setMaintenanceForm({ ...maintenanceForm, cost: event.target.value })}
                />
              </label>
              <label>
                <span>Next Due Date</span>
                <input
                  type="date"
                  value={maintenanceForm.nextDueDate}
                  onChange={(event) => setMaintenanceForm({ ...maintenanceForm, nextDueDate: event.target.value })}
                />
              </label>
              <label>
                <span>Next Due Miles</span>
                <input
                  inputMode="numeric"
                  value={maintenanceForm.nextDueOdometer}
                  onChange={(event) => setMaintenanceForm({ ...maintenanceForm, nextDueOdometer: event.target.value })}
                />
              </label>
              <label className="wide">
                <span>Notes</span>
                <textarea
                  value={maintenanceForm.notes}
                  onChange={(event) => setMaintenanceForm({ ...maintenanceForm, notes: event.target.value })}
                />
              </label>
              <button type="submit" disabled={loading}>
                Save Maintenance
              </button>
            </form>
          </div>

          <div className="panel">
            <div className="section-heading">
              <h2>Recent Maintenance</h2>
              <p>{dashboard.recentMaintenance.length} records</p>
            </div>
            <div className="record-list">
              {dashboard.recentMaintenance.length === 0 && <p className="empty">No maintenance logged yet.</p>}
              {dashboard.recentMaintenance.map((record) => (
                <article key={record.id} className="record">
                  <strong>{record.eventType}</strong>
                  <span>{record.datePerformed}</span>
                  <p>
                    {record.odometer ? `${record.odometer.toLocaleString()} miles` : 'Mileage not recorded'}
                    {record.cost ? ` - $${record.cost.toFixed(2)}` : ''}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="section-heading">
              <h2>Documents</h2>
              <p>{dashboard.documents.length} attachments</p>
            </div>
            <div className="record-list">
              {dashboard.documents.length === 0 && <p className="empty">Receipts and photos will show here.</p>}
              {dashboard.documents.map((document) => (
                <article key={document.id} className="record">
                  <strong>{document.kind}</strong>
                  <span>{document.originalFileName}</span>
                  <p>{Math.round(document.sizeBytes / 1024)} KB</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}

export default App
