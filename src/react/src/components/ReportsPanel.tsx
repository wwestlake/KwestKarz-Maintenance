import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { api } from '../api'
import { csvCell } from '../reportCsv'

export type VehicleReportRow = {
  vehicleId?: string | null
  label: string
  vin?: string | null
  licensePlate?: string | null
  status: string
  currentOdometer?: number | null
  tripCount: number
  completedTrips: number
  cancelledTrips: number
  tripEarnings: number
  missingEarnings: number
  completedMiles: number
  missingMiles: number
  ledgerIncome: number
  ledgerExpenses: number
  ledgerEntries: number
  maintenanceCount: number
  maintenanceCost: number
  missingMaintenanceCosts: number
}

export type VehicleReport = {
  periodStart: string
  periodEnd: string
  generatedAt: string
  rows: VehicleReportRow[]
}

type ReportKind = 'trips' | 'ledger' | 'maintenance' | 'inventory'
type Column = { label: string; value: (row: VehicleReportRow) => string | number; money?: boolean }
const columns: Record<ReportKind, Column[]> = {
  trips: [
    { label: 'Trips', value: r => r.tripCount },
    { label: 'Completed', value: r => r.completedTrips },
    { label: 'Cancelled', value: r => r.cancelledTrips },
    { label: 'Trip earnings', value: r => r.tripEarnings, money: true },
    { label: 'Completed miles', value: r => r.completedMiles },
    { label: 'Missing earnings', value: r => r.missingEarnings },
    { label: 'Missing mileage', value: r => r.missingMiles },
  ],
  ledger: [
    { label: 'Entries', value: r => r.ledgerEntries },
    { label: 'Income', value: r => r.ledgerIncome, money: true },
    { label: 'Expenses', value: r => r.ledgerExpenses, money: true },
    { label: 'Ledger net', value: r => r.ledgerIncome - r.ledgerExpenses, money: true },
  ],
  maintenance: [
    { label: 'Services', value: r => r.maintenanceCount },
    { label: 'Recorded cost', value: r => r.maintenanceCost, money: true },
    { label: 'Missing costs', value: r => r.missingMaintenanceCosts },
  ],
  inventory: [
    { label: 'Status now', value: r => r.status },
    { label: 'Odometer now', value: r => r.currentOdometer ?? 'Not recorded' },
  ],
}
const notes: Record<ReportKind, string> = {
  trips: 'Trips are included by start date in Michigan time. Earnings include all trip statuses, including cancellations. Mileage includes completed trips only. Trips without a start date are excluded. Missing values are counted below; totals include only recorded amounts.',
  ledger: 'Income and expenses use ledger entry dates. Ledger net is income minus expenses recorded in the ledger. It does not add Turo earnings or maintenance costs from other sources, which may overlap.',
  maintenance: 'Services use the date performed. Recorded cost excludes missing costs. These costs may also appear in the ledger; they are not added to ledger expenses.',
  inventory: 'Status and odometer show the latest saved vehicle information, regardless of the selected reporting period.',
}
const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const localDate = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function ReportsPanel({ onOpenVehicle }: { onOpenVehicle: (id: string) => void }) {
  const [from, setFrom] = useState(() => `${new Date().getFullYear()}-01-01`)
  const [to, setTo] = useState(localDate)
  const [period, setPeriod] = useState(() => ({ from, to, revision: 0 }))
  const [kind, setKind] = useState<ReportKind>('trips')
  const [vehicleId, setVehicleId] = useState('all')
  const [report, setReport] = useState<VehicleReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api.get<VehicleReport>(`/api/reports/vehicles?${new URLSearchParams({ from: period.from, to: period.to })}`)
      .then(result => { if (active) { setReport(result); setError('') } })
      .catch(() => { if (active) { setReport(null); setError('Could not load reports. Check your connection and try again. Reports require an admin or manager account.') } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [period])

  function runReport(event: FormEvent) {
    event.preventDefault()
    if (!from || !to || from > to) { setError('Choose a valid date range with From on or before To.'); return }
    setLoading(true)
    setError('')
    setPeriod(current => ({ from, to, revision: current.revision + 1 }))
  }

  const rows = (report?.rows ?? []).filter(row => vehicleId === 'all' || (row.vehicleId ?? 'unassigned') === vehicleId)
    .filter(row => kind !== 'inventory' || row.vehicleId)
  const sum = (get: (r: VehicleReportRow) => number) => rows.reduce((total, row) => total + get(row), 0)
  const dirty = from !== period.from || to !== period.to
  const selectedColumns = columns[kind]

  function exportCsv() {
    if (!report || loading || dirty) return
    const header = ['From', 'To', 'Generated at', 'Vehicle', 'VIN', 'Plate', ...selectedColumns.map(column => column.label)]
    const data = rows.map(row => [report.periodStart, report.periodEnd, report.generatedAt, row.label, row.vin ?? '', row.licensePlate ?? '', ...selectedColumns.map(column => column.value(row))])
    const csv = [header, ...data].map(row => row.map(csvCell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `kwestkarz-${kind}-${report.periodStart}-to-${report.periodEnd}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return <section className="panel reports-panel" aria-label="Vehicle reports">
    <div className="section-heading">
      <div><h2>Reports</h2><p className="hint-text">Compare your cars or select one vehicle to review its numbers.</p></div>
      <button type="button" className="secondary-button" onClick={exportCsv} disabled={!report || loading || dirty || rows.length === 0}>Download CSV</button>
    </div>
    <form className="reports-filters" onSubmit={runReport}>
      <label>From<input type="date" required value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} /></label>
      <label>To<input type="date" required value={to} min={from || undefined} onChange={e => setTo(e.target.value)} /></label>
      <label>Report<select value={kind} onChange={e => setKind(e.target.value as ReportKind)}>
        <option value="trips">Trip performance</option><option value="ledger">Income &amp; expenses</option>
        <option value="maintenance">Maintenance costs</option><option value="inventory">Fleet inventory</option>
      </select></label>
      <label>Vehicle<select value={vehicleId} onChange={e => setVehicleId(e.target.value)}>
        <option value="all">All vehicles</option>
        {(report?.rows ?? []).map(row => <option key={row.vehicleId ?? 'unassigned'} value={row.vehicleId ?? 'unassigned'}>
          {row.label}{row.licensePlate ? ` · ${row.licensePlate}` : row.vin ? ` · ${row.vin.slice(-6)}` : ''}
        </option>)}
      </select></label>
      <button type="submit" disabled={loading}>{loading ? 'Loading…' : 'Run report'}</button>
    </form>
    {dirty && <p className="hint-text" role="status">Dates changed. Run report to update the results and download.</p>}
    {error && <p role="alert" className="reports-error">{error}</p>}
    {loading && <p role="status">Loading report…</p>}
    {!loading && report && <>
      <p className="hint-text">{report.periodStart} through {report.periodEnd} · Updated {new Date(report.generatedAt).toLocaleString()}</p>
      <p className="hint-text">{notes[kind]} Unassigned records are shown separately in the fleet totals.</p>
      <div className="reports-totals">
        {kind === 'trips' && <><div><span>Trips</span><strong>{sum(r => r.tripCount).toLocaleString()}</strong></div><div><span>Recorded trip earnings</span><strong>{money(sum(r => r.tripEarnings))}</strong></div><div><span>Completed miles</span><strong>{sum(r => r.completedMiles).toLocaleString()}</strong></div></>}
        {kind === 'ledger' && <><div><span>Ledger income</span><strong>{money(sum(r => r.ledgerIncome))}</strong></div><div><span>Ledger expenses</span><strong>{money(sum(r => r.ledgerExpenses))}</strong></div><div><span>Ledger net</span><strong>{money(sum(r => r.ledgerIncome - r.ledgerExpenses))}</strong></div></>}
        {kind === 'maintenance' && <><div><span>Services</span><strong>{sum(r => r.maintenanceCount).toLocaleString()}</strong></div><div><span>Recorded cost</span><strong>{money(sum(r => r.maintenanceCost))}</strong></div><div><span>Missing costs</span><strong>{sum(r => r.missingMaintenanceCosts)}</strong></div></>}
        {kind === 'inventory' && <div><span>Vehicles</span><strong>{rows.length}</strong></div>}
      </div>
      {rows.length === 0 ? <p className="empty">No vehicles match this selection.</p> : <div className="reports-table-wrap" tabIndex={0} role="region" aria-label="Report results; scroll for more columns">
        <table className="data-table">
          <caption>{kind === 'inventory' ? 'Current fleet inventory' : `${kind === 'trips' ? 'Trip performance' : kind === 'ledger' ? 'Income and expenses' : 'Maintenance costs'} by vehicle`}</caption>
          <thead><tr><th scope="col">Vehicle</th><th scope="col">Plate / VIN</th>{selectedColumns.map(column => <th scope="col" key={column.label}>{column.label}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.vehicleId ?? 'unassigned'}>
            <th scope="row">{row.vehicleId ? <button className="secondary-button" type="button" onClick={() => onOpenVehicle(row.vehicleId!)}>{row.label}</button> : row.label}</th>
            <td>{row.licensePlate ?? '—'}<small className="reports-vin">{row.vin ?? 'No linked vehicle'}</small></td>
            {selectedColumns.map(column => { const value = column.value(row); return <td key={column.label}>{column.money ? money(Number(value)) : typeof value === 'number' ? value.toLocaleString() : value}</td> })}
          </tr>)}</tbody>
          {kind !== 'inventory' && <tfoot><tr><th scope="row" colSpan={2}>Selected total</th>{selectedColumns.map(column => <td key={column.label}>{column.money ? money(sum(r => Number(column.value(r)))) : sum(r => Number(column.value(r))).toLocaleString()}</td>)}</tr></tfoot>}
        </table>
      </div>}
      {kind !== 'inventory' && rows.length > 0 && sum(r => kind === 'trips' ? r.tripCount : kind === 'ledger' ? r.ledgerEntries : r.maintenanceCount) === 0 && <p className="empty">No {kind === 'trips' ? 'trips' : kind === 'ledger' ? 'ledger entries' : 'maintenance records'} recorded for this selection and period.</p>}
    </>}
  </section>
}
