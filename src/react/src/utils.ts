import type { ComplianceRecord, Dashboard } from './types'

export function tryApplyReceiptDetails(text: string) {
  const costMatch = text.match(/(?:total|amount|paid|balance)\D{0,20}(\d{1,5}(?:\.\d{2})?)/i)
  const dateMatch = text.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/)
  return { cost: costMatch?.[1], date: dateMatch?.[1] }
}

export function extractVin(text: string) {
  const upper = text.toUpperCase()
  const directMatch = upper.match(/[A-HJ-NPR-Z0-9]{17}/)
  if (directMatch) return directMatch[0]
  const compact = upper.replace(/[^A-Z0-9]/g, '')
  return compact.match(/[A-HJ-NPR-Z0-9]{17}/)?.[0] ?? ''
}

const VIN_XLAT: Record<string, number> = {
  '0':0,'1':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
  'A':1,'B':2,'C':3,'D':4,'E':5,'F':6,'G':7,'H':8,
  'J':1,'K':2,'L':3,'M':4,'N':5,'P':7,'R':9,
  'S':2,'T':3,'U':4,'V':5,'W':6,'X':7,'Y':8,'Z':9,
}
const VIN_WEIGHTS = [8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2]

export function validateVin(vin: string): { valid: boolean; reason?: string } {
  const v = vin.trim().toUpperCase()
  if (v.length !== 17) return { valid: false, reason: `${v.length} of 17 characters` }
  if (/[IOQ]/.test(v)) return { valid: false, reason: 'contains I, O, or Q (not allowed in VINs — possible misread)' }
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return { valid: false, reason: 'contains invalid characters' }
  const sum = v.split('').reduce((acc, ch, i) => acc + (VIN_XLAT[ch] ?? 0) * VIN_WEIGHTS[i], 0)
  const rem = sum % 11
  const expected = rem === 10 ? 'X' : rem.toString()
  if (v[8] !== expected) return { valid: false, reason: `check digit should be ${expected}, got ${v[8]} — possible misread` }
  return { valid: true }
}

export function pressureValue(value: unknown) {
  if (typeof value === 'number' && value >= 15 && value <= 80) return value
  if (typeof value !== 'string') return undefined
  const match = value.match(/\b([1-9]\d)\b/)
  const number = Number(match?.[1] ?? '')
  return number >= 15 && number <= 80 ? number : undefined
}

export function extractPressure(label: string, text: string) {
  const afterLabel = new RegExp(`(?:${label})[^0-9]{0,50}([1-9]\\d)\\s*(?:psi|psig)?`, 'i')
  const beforeLabel = new RegExp(`([1-9]\\d)\\s*(?:psi|psig)?[^a-z0-9]{0,30}(?:${label})`, 'i')
  return pressureValue(text.match(afterLabel)?.[1]) ?? pressureValue(text.match(beforeLabel)?.[1])
}

export function firstPressures(text: string) {
  const explicitPsi = [...text.matchAll(/\b([1-9]\d)\s*(?:psi|psig)\b/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => value >= 15 && value <= 80)
  if (explicitPsi.length > 0) return explicitPsi
  return [...text.matchAll(/\b([1-9]\d)\b/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value >= 15 && value <= 80)
}

export function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export function formatComplianceType(type: string) {
  return type === 'LicensePlate' ? 'License Plate' : type
}

export function complianceClass(status?: string) {
  if (status === 'Expired') return 'status-chip danger'
  if (status === 'Due Soon' || status === 'Missing Expiration') return 'status-chip warning'
  return 'status-chip good'
}

export function normalizePlate(value?: string) {
  return value?.toUpperCase().replace(/[^A-Z0-9]/g, '') ?? ''
}

export const stateCodes: Record<string, string> = {
  ALABAMA: 'AL', ALASKA: 'AK', ARIZONA: 'AZ', ARKANSAS: 'AR', CALIFORNIA: 'CA',
  COLORADO: 'CO', CONNECTICUT: 'CT', DELAWARE: 'DE', FLORIDA: 'FL', GEORGIA: 'GA',
  HAWAII: 'HI', IDAHO: 'ID', ILLINOIS: 'IL', INDIANA: 'IN', IOWA: 'IA',
  KANSAS: 'KS', KENTUCKY: 'KY', LOUISIANA: 'LA', MAINE: 'ME', MARYLAND: 'MD',
  MASSACHUSETTS: 'MA', MICHIGAN: 'MI', MINNESOTA: 'MN', MISSISSIPPI: 'MS',
  MISSOURI: 'MO', MONTANA: 'MT', NEBRASKA: 'NE', NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ', 'NEW MEXICO': 'NM', 'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', OHIO: 'OH', OKLAHOMA: 'OK',
  OREGON: 'OR', PENNSYLVANIA: 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD', TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT',
  VERMONT: 'VT', VIRGINIA: 'VA', WASHINGTON: 'WA', 'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI', WYOMING: 'WY', 'DISTRICT OF COLUMBIA': 'DC',
}

export function normalizeState(value?: string) {
  const normalized = value?.toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim() ?? ''
  if (normalized.length === 2) return normalized
  return stateCodes[normalized] ?? normalized
}

export function complianceChecks(record: ComplianceRecord, dashboard: Dashboard) {
  const issues: string[] = []
  const ok: string[] = []
  const recordPlate = normalizePlate(record.plateNumber)
  const vehiclePlate = normalizePlate(dashboard.vehicle.licensePlate)
  const recordState = normalizeState(record.plateState)
  const vehicleState = normalizeState(dashboard.vehicle.licensePlateState)
  const recordVin = record.vin?.toUpperCase().trim()

  if (recordVin) {
    if (recordVin === dashboard.vehicle.vin) ok.push(`VIN matches: ${recordVin}`)
    else issues.push(`VIN mismatch: ${recordVin} vs vehicle ${dashboard.vehicle.vin}`)
  }
  if (recordPlate && vehiclePlate) {
    if (recordPlate === vehiclePlate) ok.push(`Vehicle plate matches: ${record.plateNumber} vs ${dashboard.vehicle.licensePlate}`)
    else issues.push(`Vehicle plate mismatch: ${record.plateNumber} vs vehicle ${dashboard.vehicle.licensePlate}`)
  }
  if (recordState && vehicleState) {
    if (recordState === vehicleState) ok.push(`State matches: ${record.plateState} vs ${dashboard.vehicle.licensePlateState}`)
    else issues.push(`State mismatch: ${record.plateState} vs vehicle ${dashboard.vehicle.licensePlateState}`)
  }
  for (const other of dashboard.compliance) {
    if (other.id === record.id) continue
    const otherPlate = normalizePlate(other.plateNumber)
    if (recordPlate && otherPlate) {
      if (recordPlate === otherPlate) ok.push(`${formatComplianceType(other.recordType)} plate matches`)
      else issues.push(`${formatComplianceType(other.recordType)} plate mismatch`)
    }
    const otherVin = other.vin?.toUpperCase().trim()
    if (recordVin && otherVin) {
      if (recordVin === otherVin) ok.push(`${formatComplianceType(other.recordType)} VIN matches`)
      else issues.push(`${formatComplianceType(other.recordType)} VIN mismatch`)
    }
  }
  return { issues: [...new Set(issues)], ok: [...new Set(ok)] }
}
