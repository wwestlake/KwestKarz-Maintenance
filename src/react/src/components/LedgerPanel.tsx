import { useEffect, useState } from 'react'
import { api } from '../api'

type Account = { id: string; code: string; name: string; accountType: string }

type LedgerEntry = {
  id: string
  entryDate: string
  description: string
  accountId: string
  accountCode: string
  accountName: string
  entryType: 'income' | 'expense'
  amount: number
  vehicleId?: string
  jobId?: string
  reference?: string
  paymentStatus?: 'unpaid' | 'paid'
  paidAt?: string
  paidBy?: string
  createdBy: string
  createdAt: string
}

type PnlLine = { accountCode: string; accountName: string; accountType: string; total: number }
type PnlReport = {
  periodStart: string; periodEnd: string
  income: PnlLine[]; expenses: PnlLine[]
  totalIncome: number; totalExpenses: number; netIncome: number
}

type Tab = 'ledger' | 'pnl' | 'earnings'

const thisMonthStart = () => {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}
const today = () => new Date().toISOString().slice(0, 10)

export function LedgerPanel() {
  const [tab, setTab] = useState<Tab>('ledger')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [earnings, setEarnings] = useState<LedgerEntry[]>([])
  const [pnl, setPnl] = useState<PnlReport | null>(null)
  const [error, setError] = useState('')
  const [acting, setActing] = useState<string | null>(null)

  // Ledger filters
  const [fromDate, setFromDate] = useState(thisMonthStart())
  const [toDate, setToDate] = useState(today())
  const [filterType, setFilterType] = useState('')
  const [filterAccount, setFilterAccount] = useState('')

  // Add entry form
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    entryDate: today(), description: '', accountId: '', entryType: 'expense', amount: '', reference: '', paymentStatus: ''
  })

  // P&L period
  const [pnlFrom, setPnlFrom] = useState(thisMonthStart())
  const [pnlTo, setPnlTo] = useState(today())

  useEffect(() => {
    api.get<Account[]>('/api/ledger/accounts').then(setAccounts).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'ledger') loadEntries()
    if (tab === 'pnl') loadPnl()
    if (tab === 'earnings') loadEarnings()
  }, [tab])

  async function loadEntries() {
    setError('')
    try {
      const params = new URLSearchParams()
      if (fromDate) params.set('from', fromDate)
      if (toDate) params.set('to', toDate)
      if (filterType) params.set('type', filterType)
      if (filterAccount) params.set('accountId', filterAccount)
      const data = await api.get<LedgerEntry[]>(`/api/ledger/entries?${params}`)
      setEntries(data)
    } catch { setError('Could not load ledger') }
  }

  async function loadPnl() {
    setError('')
    try {
      const data = await api.get<PnlReport>(`/api/ledger/pnl?from=${pnlFrom}&to=${pnlTo}`)
      setPnl(data)
    } catch { setError('Could not load P&L') }
  }

  async function loadEarnings() {
    setError('')
    try {
      const data = await api.get<LedgerEntry[]>('/api/ledger/worker-earnings')
      setEarnings(data)
    } catch { setError('Could not load worker earnings') }
  }

  async function addEntry(e: React.FormEvent) {
    e.preventDefault()
    if (!form.description || !form.accountId || !form.amount) return
    setActing('add')
    setError('')
    try {
      const selectedAccount = accounts.find(a => a.id === form.accountId)
      const isLaborAccount = selectedAccount?.code === '5000'
      await api.post('/api/ledger/entries', {
        entryDate: form.entryDate,
        description: form.description,
        accountId: form.accountId,
        entryType: form.entryType,
        amount: parseFloat(form.amount),
        reference: form.reference || null,
        paymentStatus: isLaborAccount ? (form.paymentStatus || 'unpaid') : null,
      })
      setForm({ entryDate: today(), description: '', accountId: '', entryType: 'expense', amount: '', reference: '', paymentStatus: '' })
      setShowForm(false)
      await loadEntries()
    } catch { setError('Could not save entry') }
    finally { setActing(null) }
  }

  async function markPaid(entryId: string) {
    setActing(entryId)
    setError('')
    try {
      await api.post(`/api/ledger/entries/${entryId}/mark-paid`, {})
      setEarnings(prev => prev.map(e => e.id === entryId ? { ...e, paymentStatus: 'paid' as const } : e))
    } catch { setError('Could not mark paid') }
    finally { setActing(null) }
  }

  // Running balance for ledger
  const runningEntries = [...entries].reverse().reduce<(LedgerEntry & { balance: number })[]>((acc, entry) => {
    const prev = acc[acc.length - 1]?.balance ?? 0
    const delta = entry.entryType === 'income' ? entry.amount : -entry.amount
    return [...acc, { ...entry, balance: prev + delta }]
  }, []).reverse()

  const totalIncome = entries.filter(e => e.entryType === 'income').reduce((s, e) => s + e.amount, 0)
  const totalExpenses = entries.filter(e => e.entryType === 'expense').reduce((s, e) => s + e.amount, 0)

  const unpaidEarnings = earnings.filter(e => e.paymentStatus === 'unpaid')
  const paidEarnings = earnings.filter(e => e.paymentStatus === 'paid')

  return (
    <section className="area-grid">
      {/* Tab bar */}
      <div className="panel area-panel">
        <div className="section-heading"><h2>Books</h2></div>
        {error && <p className="hint-text" style={{ color: 'var(--color-danger,#e53)' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {(['ledger', 'pnl', 'earnings'] as Tab[]).map(t => (
            <button key={t} className={tab === t ? 'btn-primary' : 'btn-secondary'} onClick={() => setTab(t)}>
              {t === 'ledger' ? 'Ledger' : t === 'pnl' ? 'P & L' : 'Worker Earnings'}
            </button>
          ))}
        </div>
      </div>

      {/* ── LEDGER TAB ── */}
      {tab === 'ledger' && (
        <>
          <div className="panel area-panel">
            <div className="section-heading"><h2>Filter</h2></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label>From</label>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              </div>
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label>To</label>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
              </div>
              <div className="form-row" style={{ flex: 1, minWidth: 120 }}>
                <label>Type</label>
                <select value={filterType} onChange={e => setFilterType(e.target.value)}>
                  <option value="">All</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
              <div className="form-row" style={{ flex: 2, minWidth: 160 }}>
                <label>Account</label>
                <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
                  <option value="">All accounts</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </div>
              <button className="btn-primary" onClick={loadEntries}>Search</button>
            </div>
            <button className="btn-secondary" style={{ marginTop: 12 }} onClick={() => setShowForm(s => !s)}>
              {showForm ? 'Cancel' : '+ Add Entry'}
            </button>
            {showForm && (
              <form onSubmit={addEntry} style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  <div className="form-row" style={{ flex: 1, minWidth: 130 }}>
                    <label>Date</label>
                    <input type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} required />
                  </div>
                  <div className="form-row" style={{ flex: 1, minWidth: 100 }}>
                    <label>Type</label>
                    <select value={form.entryType} onChange={e => setForm(f => ({ ...f, entryType: e.target.value }))}>
                      <option value="income">Income</option>
                      <option value="expense">Expense</option>
                    </select>
                  </div>
                  <div className="form-row" style={{ flex: 2, minWidth: 180 }}>
                    <label>Account</label>
                    <select value={form.accountId} onChange={e => setForm(f => ({ ...f, accountId: e.target.value }))} required>
                      <option value="">Select account...</option>
                      {accounts.filter(a => a.accountType === form.entryType).map(a =>
                        <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                  </div>
                  <div className="form-row" style={{ flex: 1, minWidth: 100 }}>
                    <label>Amount ($)</label>
                    <input type="number" min="0.01" step="0.01" value={form.amount}
                      onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
                  </div>
                </div>
                <div className="form-row">
                  <label>Description</label>
                  <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} required />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div className="form-row" style={{ flex: 1 }}>
                    <label>Reference</label>
                    <input type="text" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Invoice #, receipt, etc." />
                  </div>
                  {accounts.find(a => a.id === form.accountId)?.code === '5000' && (
                    <div className="form-row" style={{ flex: 1 }}>
                      <label>Payment Status</label>
                      <select value={form.paymentStatus} onChange={e => setForm(f => ({ ...f, paymentStatus: e.target.value }))}>
                        <option value="unpaid">Unpaid</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>
                  )}
                </div>
                <button className="btn-primary" type="submit" disabled={acting === 'add'}>
                  {acting === 'add' ? 'Saving...' : 'Save Entry'}
                </button>
              </form>
            )}
          </div>

          <div className="panel area-panel">
            <div className="section-heading">
              <h2>Ledger</h2>
              <div style={{ display: 'flex', gap: 16 }}>
                <span style={{ color: 'var(--color-ok, green)' }}>In: ${totalIncome.toFixed(2)}</span>
                <span style={{ color: 'var(--color-danger, #e53)' }}>Out: ${totalExpenses.toFixed(2)}</span>
                <strong style={{ color: (totalIncome - totalExpenses) >= 0 ? 'var(--color-ok,green)' : 'var(--color-danger,#e53)' }}>
                  Net: ${(totalIncome - totalExpenses).toFixed(2)}
                </strong>
              </div>
            </div>
            {entries.length === 0
              ? <p className="hint-text">No entries for this period.</p>
              : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Description</th>
                      <th>Account</th>
                      <th>Ref</th>
                      <th style={{ textAlign: 'right' }}>Income</th>
                      <th style={{ textAlign: 'right' }}>Expense</th>
                      <th style={{ textAlign: 'right' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runningEntries.map(e => (
                      <tr key={e.id}>
                        <td>{e.entryDate}</td>
                        <td>{e.description}</td>
                        <td>{e.accountCode} — {e.accountName}</td>
                        <td>{e.reference ?? '—'}</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-ok,green)' }}>
                          {e.entryType === 'income' ? `$${e.amount.toFixed(2)}` : ''}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--color-danger,#e53)' }}>
                          {e.entryType === 'expense' ? `$${e.amount.toFixed(2)}` : ''}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: e.balance >= 0 ? 'var(--color-ok,green)' : 'var(--color-danger,#e53)' }}>
                          ${e.balance.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>
        </>
      )}

      {/* ── P&L TAB ── */}
      {tab === 'pnl' && (
        <div className="panel area-panel">
          <div className="section-heading"><h2>Profit & Loss</h2></div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'flex-end' }}>
            <div className="form-row">
              <label>From</label>
              <input type="date" value={pnlFrom} onChange={e => setPnlFrom(e.target.value)} />
            </div>
            <div className="form-row">
              <label>To</label>
              <input type="date" value={pnlTo} onChange={e => setPnlTo(e.target.value)} />
            </div>
            <button className="btn-primary" onClick={loadPnl}>Run</button>
          </div>
          {pnl && (
            <>
              <table className="data-table">
                <thead><tr><th>Code</th><th>Account</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  <tr><td colSpan={3} style={{ fontWeight: 700, paddingTop: 8 }}>INCOME</td></tr>
                  {pnl.income.map(l => (
                    <tr key={l.accountCode}>
                      <td>{l.accountCode}</td>
                      <td>{l.accountName}</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-ok,green)' }}>${l.total.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={2}>Total Income</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-ok,green)' }}>${pnl.totalIncome.toFixed(2)}</td>
                  </tr>
                  <tr><td colSpan={3} style={{ fontWeight: 700, paddingTop: 12 }}>EXPENSES</td></tr>
                  {pnl.expenses.map(l => (
                    <tr key={l.accountCode}>
                      <td>{l.accountCode}</td>
                      <td>{l.accountName}</td>
                      <td style={{ textAlign: 'right', color: 'var(--color-danger,#e53)' }}>${l.total.toFixed(2)}</td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 700 }}>
                    <td colSpan={2}>Total Expenses</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-danger,#e53)' }}>${pnl.totalExpenses.toFixed(2)}</td>
                  </tr>
                  <tr style={{ fontWeight: 700, fontSize: '1.1em', borderTop: '2px solid var(--color-border)' }}>
                    <td colSpan={2}>NET INCOME</td>
                    <td style={{ textAlign: 'right', color: pnl.netIncome >= 0 ? 'var(--color-ok,green)' : 'var(--color-danger,#e53)' }}>
                      ${pnl.netIncome.toFixed(2)}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="hint-text" style={{ marginTop: 8 }}>Period: {pnl.periodStart} through {pnl.periodEnd}</p>
            </>
          )}
        </div>
      )}

      {/* ── WORKER EARNINGS TAB ── */}
      {tab === 'earnings' && (
        <>
          {unpaidEarnings.length > 0 && (
            <div className="panel area-panel">
              <div className="section-heading">
                <h2>Unpaid</h2>
                <strong style={{ color: 'var(--color-danger,#e53)' }}>
                  ${unpaidEarnings.reduce((s, e) => s + e.amount, 0).toFixed(2)} owed
                </strong>
              </div>
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Description</th><th>Created By</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr>
                </thead>
                <tbody>
                  {unpaidEarnings.map(e => (
                    <tr key={e.id}>
                      <td>{e.entryDate}</td>
                      <td>{e.description}</td>
                      <td>{e.createdBy}</td>
                      <td style={{ textAlign: 'right' }}>${e.amount.toFixed(2)}</td>
                      <td>
                        <button className="btn-primary" onClick={() => markPaid(e.id)} disabled={acting === e.id}>
                          {acting === e.id ? '...' : 'Mark Paid'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {paidEarnings.length > 0 && (
            <div className="panel area-panel">
              <div className="section-heading">
                <h2>Paid</h2>
                <span className="tag">${paidEarnings.reduce((s, e) => s + e.amount, 0).toFixed(2)} paid out</span>
              </div>
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Description</th><th>Paid By</th><th>Paid On</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
                </thead>
                <tbody>
                  {paidEarnings.map(e => (
                    <tr key={e.id}>
                      <td>{e.entryDate}</td>
                      <td>{e.description}</td>
                      <td>{e.paidBy ?? '—'}</td>
                      <td>{e.paidAt ? new Date(e.paidAt).toLocaleDateString() : '—'}</td>
                      <td style={{ textAlign: 'right' }}>${e.amount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {earnings.length === 0 && (
            <div className="panel area-panel">
              <p className="hint-text">No worker earnings yet. They appear automatically when jobs are completed.</p>
            </div>
          )}
        </>
      )}
    </section>
  )
}
