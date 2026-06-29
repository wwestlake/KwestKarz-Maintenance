import type { FormEvent } from 'react'
import type { BankStatementImportRecord } from '../types'

type Props = {
  bankImportFile: File | null
  bankImportResult: BankStatementImportRecord | null
  bankImportHistory: BankStatementImportRecord[]
  loading: boolean
  statementYear: string
  bankName: string
  accountNumber: string
  accountNickname: string
  notes: string
  onStatementYearChange: (value: string) => void
  onBankNameChange: (value: string) => void
  onAccountNumberChange: (value: string) => void
  onAccountNicknameChange: (value: string) => void
  onNotesChange: (value: string) => void
  onFileChange: (file: File | null) => void
  onImport: (event: FormEvent) => void
}

export function BankStatementImportPanel({
  bankImportFile,
  bankImportResult,
  bankImportHistory,
  loading,
  statementYear,
  bankName,
  accountNumber,
  accountNickname,
  notes,
  onStatementYearChange,
  onBankNameChange,
  onAccountNumberChange,
  onAccountNicknameChange,
  onNotesChange,
  onFileChange,
  onImport,
}: Props) {
  return (
    <div className="panel area-panel">
      <div className="section-heading">
        <div>
          <h2>Bank Statement Import</h2>
          <p>Admin-only CSV upload for MSGCU now and Chase later. The raw rows are stored for bank-specific mapping.</p>
        </div>
      </div>
      <form className="import-form" onSubmit={onImport}>
        <label>
          <span>Statement Year</span>
          <input
            type="number"
            min="2000"
            max="2100"
            value={statementYear}
            onChange={(event) => onStatementYearChange(event.target.value)}
          />
        </label>
        <label>
          <span>Bank</span>
          <select value={bankName} onChange={(event) => onBankNameChange(event.target.value)}>
            <option value="MSGCU">MSGCU</option>
            <option value="Chase">Chase</option>
            <option value="Other">Other</option>
          </select>
        </label>
        <label>
          <span>Account Number</span>
          <input
            value={accountNumber}
            placeholder="Full account number or last 4"
            onChange={(event) => onAccountNumberChange(event.target.value)}
          />
        </label>
        <label>
          <span>Account Nickname</span>
          <input
            value={accountNickname}
            placeholder="Operating, savings, reserve..."
            onChange={(event) => onAccountNicknameChange(event.target.value)}
          />
        </label>
        <label>
          <span>Notes</span>
          <textarea
            value={notes}
            placeholder="Optional import note"
            onChange={(event) => onNotesChange(event.target.value)}
          />
        </label>
        <label>
          <span>Bank CSV</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
        </label>
        <button type="submit" disabled={loading || !bankImportFile || !bankName.trim() || !accountNumber.trim()}>
          Import Statements
        </button>
      </form>
      {bankImportResult && (
        <div className="import-summary">
          <div><span>Rows</span><strong>{bankImportResult.rowCount}</strong></div>
          <div><span>Stored</span><strong>{bankImportResult.storedRowCount}</strong></div>
          <div><span>Year</span><strong>{bankImportResult.statementYear}</strong></div>
          <div><span>Bank</span><strong>{bankImportResult.bankName}</strong></div>
          <div><span>Account</span><strong>{bankImportResult.accountNumber}</strong></div>
        </div>
      )}
      {bankImportResult && (
        <div className="record-list">
          <article className="record">
            <strong>{bankImportResult.originalFileName}</strong>
            <span>{bankImportResult.statementYear} · {bankImportResult.bankName} - {bankImportResult.accountNumber}</span>
            <p>
              Imported {new Date(bankImportResult.importedAt).toLocaleString()}
              {bankImportResult.accountNickname ? ` - ${bankImportResult.accountNickname}` : ''}
            </p>
          </article>
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <div className="section-heading">
          <div>
            <h3>Bank Import History</h3>
            <p>{bankImportHistory.length} imports recorded</p>
          </div>
        </div>
        {bankImportHistory.length === 0 ? (
          <p className="empty">Upload a bank CSV to start the import trail.</p>
        ) : (
          <div className="record-list">
            {Object.entries(
              bankImportHistory.reduce<Record<string, BankStatementImportRecord[]>>((acc, record) => {
                const key = String(record.statementYear)
                acc[key] = acc[key] ?? []
                acc[key].push(record)
                return acc
              }, {}),
            )
              .sort((a, b) => Number(b[0]) - Number(a[0]))
              .map(([year, items]) => (
                <article key={year} className="record">
                  <div className="record-heading">
                    <strong>{year}</strong>
                    <span>{items.length} imports</span>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Bank</th>
                        <th>Account</th>
                        <th>File</th>
                        <th>Imported</th>
                        <th>Rows</th>
                        <th>Stored</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((imp) => (
                        <tr key={imp.id}>
                          <td>{imp.bankName}</td>
                          <td>{imp.accountNumber}</td>
                          <td>{imp.originalFileName}</td>
                          <td>{new Date(imp.importedAt).toLocaleDateString()}</td>
                          <td>{imp.rowCount}</td>
                          <td>{imp.storedRowCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </article>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
