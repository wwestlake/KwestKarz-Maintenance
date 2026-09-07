// Quote all CSV cells and prevent spreadsheet formulas in user-entered labels.
export function csvCell(value: string | number): string {
  const raw = String(value)
  const safe = typeof value === 'string' && /^[\s]*[=+@-]/.test(raw) ? `'${raw}` : raw
  return `"${safe.replaceAll('"', '""')}"`
}
