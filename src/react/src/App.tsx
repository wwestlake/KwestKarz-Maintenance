import { useEffect, useMemo, useRef, useState } from 'react'
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

type LockBox = {
  id: string
  boxNumber: number
  serialNumber?: string
  combo: string
  style: string
  status: string
  notes?: string
  currentVehicleId?: string
  currentVehicleVin?: string
  currentVehicleLabel?: string
  assignedAt?: string
}

type AIResponse = {
  text: string
  model: string
}

type VinScanResponse = {
  vin?: unknown
  aiText?: unknown
  model?: unknown
}

type VinLatestScanResponse = {
  vin?: string
  loggedAt?: string
}

type ComplianceRecord = {
  id: string
  vehicleId: string
  recordType: string
  provider?: string
  policyNumber?: string
  documentNumber?: string
  plateNumber?: string
  plateState?: string
  vin?: string
  stickerMonth?: string
  stickerYear?: number
  serialNumber?: string
  effectiveDate?: string
  expirationDate?: string
  documentId?: string
  notes?: string
  dueStatus: string
  createdAt: string
  updatedAt: string
}

type CompliancePhotoScanResponse = {
  record: ComplianceRecord
  aiText: string
}

type Dashboard = {
  vehicle: Vehicle
  currentLockBox?: LockBox
  compliance: ComplianceRecord[]
  documents: DocumentRecord[]
  recentMaintenance: MaintenanceRecord[]
  nextDue?: {
    record: MaintenanceRecord
    dueStatus: string
  }
  aiContextSummary: string
}

type TirePressureSpec = {
  frontLeftPsi?: number
  frontRightPsi?: number
  rearLeftPsi?: number
  rearRightPsi?: number
  notes?: string
  photoDocumentId?: string
}

type TirePressureLog = {
  id: string
  measuredAt: string
  frontLeftPsi?: number
  frontRightPsi?: number
  rearLeftPsi?: number
  rearRightPsi?: number
  status: string
  notes?: string
  photoDocumentId?: string
}

type TirePressureSnapshot = {
  spec?: TirePressureSpec
  recentLogs: TirePressureLog[]
}

type TirePressureSpecScanResponse = {
  spec: TirePressureSpec
  aiText: string
  photoDocumentId?: string
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

type WorkflowStep = {
  id: string
  workflowId: string
  stepKey: string
  title: string
  status: string
  sortOrder: number
  data?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

type WorkflowInstance = {
  id: string
  workflowType: string
  title: string
  status: string
  vehicleId?: string
  currentStepKey: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  canceledAt?: string
  steps: WorkflowStep[]
}

type Obd2ReportUploadResponse = {
  workflow: WorkflowInstance
  documentId: string
  aiText: string
  extractedText: string
}

type AppArea = 'home' | 'inventory' | 'workflows' | 'maintenance' | 'compliance' | 'lockboxes' | 'settings'

const appAreas: { id: AppArea; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'lockboxes', label: 'Lock Boxes' },
  { id: 'settings', label: 'Settings' },
]

const workflowCatalog = [
  ['AddVehicle', 'Add Vehicle', 'VIN, plate, registration, insurance, lock box'],
  ['PreRentalInspection', 'Pre-Rental Inspection', 'Photos, mileage, fuel, tires, damage'],
  ['PostRentalInspection', 'Post-Rental Inspection', 'Return condition, mileage, fuel, issues'],
  ['MaintenanceIntake', 'Maintenance Intake', 'Receipt, service type, due dates, tire pressure'],
  ['TechnicalCheck', 'Technical Check', 'Under hood, fluids, battery, OBD2 report, road check'],
  ['DamageReview', 'Damage Review', 'Photos, notes, repair status, documents'],
  ['ComplianceRenewal', 'Compliance Renewal', 'Registration, insurance, plate verification'],
] as const

const areaTitles: Record<AppArea, string> = {
  home: 'Today',
  inventory: 'Inventory',
  workflows: 'Workflows',
  maintenance: 'Maintenance',
  compliance: 'Compliance',
  lockboxes: 'Lock Boxes',
  settings: 'Settings',
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

const maintenanceTypes = [
  'Oil Change',
  'Car Wash',
  'Full Detail',
  'Interior Detail',
  'Exterior Detail',
  'Mechanical Repair',
  'Damage Repair',
  'Body Work',
  'Paint / Touch Up',
  'Tires',
  'Tire Rotation',
  'Tire Repair',
  'Wheel Alignment',
  'Brake Inspection',
  'Brake Pads',
  'Brake Rotors',
  'Brake Fluid Flush',
  'Transmission Flush',
  'Coolant Flush',
  'Battery',
  'Alternator',
  'Starter',
  'Wipers',
  'Air Filter',
  'Cabin Filter',
  'Spark Plugs',
  'Suspension',
  'A/C Service',
  'Check Engine Diagnostic',
  'OBD2 Scan',
  'Emissions',
  'Inspection',
  'Registration',
  'Recall / Dealer Service',
  'GPS / Bouncie Install',
  'Lock Box',
  'Key / Fob',
  'Roadside',
  'Other',
]

const lockBoxStyles = ['Mechanical Keypad', 'Dial', 'Other']
const lockBoxStatuses = ['Available', 'Assigned', 'Lost', 'Retired']
const complianceTypes = ['Registration', 'Insurance', 'LicensePlate']
const selectedVehicleStorageKey = 'kwestkarz.selectedVehicleId'
const tirePanelStorageKey = 'kwestkarz.showTirePressurePanel'
const tireSpecScanPendingStorageKey = 'kwestkarz.tireSpecScanPending'
const vinScanClientStorageKey = 'kwestkarz.vinScanClientId'
const vinScanPendingStorageKey = 'kwestkarz.vinScanPending'
const vinScanStartedStorageKey = 'kwestkarz.vinScanStartedAt'
const complianceScanPendingStorageKey = 'kwestkarz.complianceScanPending'
const complianceScanTypeStorageKey = 'kwestkarz.complianceScanType'
const complianceScanVehicleStorageKey = 'kwestkarz.complianceScanVehicleId'
const complianceScanStartedStorageKey = 'kwestkarz.complianceScanStartedAt'

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
  async put<T>(path: string, body: unknown): Promise<T> {
    const response = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(await response.text())
    return response.json()
  },
}

function tryApplyReceiptDetails(text: string) {
  const costMatch = text.match(/(?:total|amount|paid|balance)\D{0,20}(\d{1,5}(?:\.\d{2})?)/i)
  const dateMatch = text.match(/\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b/)

  return {
    cost: costMatch?.[1],
    date: dateMatch?.[1],
  }
}

function extractVin(text: string) {
  const upper = text.toUpperCase()
  const directMatch = upper.match(/[A-HJ-NPR-Z0-9]{17}/)
  if (directMatch) return directMatch[0]

  const compact = upper.replace(/[^A-Z0-9]/g, '')
  return compact.match(/[A-HJ-NPR-Z0-9]{17}/)?.[0] ?? ''
}

function pressureValue(value: unknown) {
  if (typeof value === 'number' && value >= 15 && value <= 80) return value
  if (typeof value !== 'string') return undefined

  const match = value.match(/\b([1-9]\d)\b/)
  const number = Number(match?.[1] ?? '')
  return number >= 15 && number <= 80 ? number : undefined
}

function extractPressure(label: string, text: string) {
  const afterLabel = new RegExp(`(?:${label})[^0-9]{0,50}([1-9]\\d)\\s*(?:psi|psig)?`, 'i')
  const beforeLabel = new RegExp(`([1-9]\\d)\\s*(?:psi|psig)?[^a-z0-9]{0,30}(?:${label})`, 'i')
  return pressureValue(text.match(afterLabel)?.[1]) ?? pressureValue(text.match(beforeLabel)?.[1])
}

function firstPressures(text: string) {
  const explicitPsi = [...text.matchAll(/\b([1-9]\d)\s*(?:psi|psig)\b/gi)]
    .map((match) => Number(match[1]))
    .filter((value) => value >= 15 && value <= 80)

  if (explicitPsi.length > 0) return explicitPsi

  return [...text.matchAll(/\b([1-9]\d)\b/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value >= 15 && value <= 80)
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function formatComplianceType(type: string) {
  return type === 'LicensePlate' ? 'License Plate' : type
}

function complianceClass(status?: string) {
  if (status === 'Expired') return 'status-chip danger'
  if (status === 'Due Soon' || status === 'Missing Expiration') return 'status-chip warning'
  return 'status-chip good'
}

function normalizePlate(value?: string) {
  return value?.toUpperCase().replace(/[^A-Z0-9]/g, '') ?? ''
}

function complianceChecks(record: ComplianceRecord, dashboard: Dashboard) {
  const issues: string[] = []
  const ok: string[] = []
  const recordPlate = normalizePlate(record.plateNumber)
  const vehiclePlate = normalizePlate(dashboard.vehicle.licensePlate)
  const recordState = record.plateState?.toUpperCase().trim()
  const vehicleState = dashboard.vehicle.licensePlateState?.toUpperCase().trim()
  const recordVin = record.vin?.toUpperCase().trim()

  if (recordVin) {
    if (recordVin === dashboard.vehicle.vin) ok.push('VIN matches')
    else issues.push('VIN mismatch')
  }

  if (recordPlate && vehiclePlate) {
    if (recordPlate === vehiclePlate) ok.push('Vehicle plate matches')
    else issues.push('Vehicle plate mismatch')
  }

  if (recordState && vehicleState) {
    if (recordState === vehicleState) ok.push('State matches')
    else issues.push('State mismatch')
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

function getVinScanClientId() {
  const existing = localStorage.getItem(vinScanClientStorageKey)
  if (existing) return existing

  const next =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
  localStorage.setItem(vinScanClientStorageKey, next)
  return next
}

function App() {
  const [activeArea, setActiveArea] = useState<AppArea>('home')
  const [workflows, setWorkflows] = useState<WorkflowInstance[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('')
  const [selectedWorkflowStepKey, setSelectedWorkflowStepKey] = useState('')
  const [workflowStepNotes, setWorkflowStepNotes] = useState('')
  const [obd2ReportFile, setObd2ReportFile] = useState<File | null>(null)
  const [obd2ReportInsight, setObd2ReportInsight] = useState('')
  const vinCameraInputRef = useRef<HTMLInputElement | null>(null)
  const complianceCameraInputRef = useRef<HTMLInputElement | null>(null)
  const complianceFormRef = useRef<HTMLFormElement | null>(null)
  const tireSpecCameraInputRef = useRef<HTMLInputElement | null>(null)
  const tireLogCameraInputRef = useRef<HTMLInputElement | null>(null)
  const vinRecoveryActiveRef = useRef(false)
  const complianceRecoveryActiveRef = useRef(false)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [lockBoxes, setLockBoxes] = useState<LockBox[]>([])
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
  const [showMaintenanceTypes, setShowMaintenanceTypes] = useState(false)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptInsight, setReceiptInsight] = useState('')
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false)
  const [showTirePressurePanel, setShowTirePressurePanel] = useState(false)
  const [showLockBoxManager, setShowLockBoxManager] = useState(false)
  const [selectedLockBoxId, setSelectedLockBoxId] = useState('')
  const [editingLockBoxId, setEditingLockBoxId] = useState('')
  const [lockBoxForm, setLockBoxForm] = useState({
    serialNumber: '',
    combo: '',
    style: 'Mechanical Keypad',
    status: 'Available',
    notes: '',
  })
  const [complianceScanType, setComplianceScanType] = useState('Registration')
  const [editingComplianceId, setEditingComplianceId] = useState('')
  const [complianceForm, setComplianceForm] = useState({
    provider: '',
    policyNumber: '',
    documentNumber: '',
    plateNumber: '',
    plateState: '',
    vin: '',
    stickerMonth: '',
    stickerYear: '',
    serialNumber: '',
    effectiveDate: '',
    expirationDate: '',
    notes: '',
  })
  const [tirePressure, setTirePressure] = useState<TirePressureSnapshot>({ recentLogs: [] })
  const [tireSpecForm, setTireSpecForm] = useState({
    frontLeftPsi: '',
    frontRightPsi: '',
    rearLeftPsi: '',
    rearRightPsi: '',
    notes: '',
  })
  const [tireLogForm, setTireLogForm] = useState({
    frontLeftPsi: '',
    frontRightPsi: '',
    rearLeftPsi: '',
    rearRightPsi: '',
    notes: '',
  })
  const [tireLogPhotoFile, setTireLogPhotoFile] = useState<File | null>(null)
  const [tirePressureInsight, setTirePressureInsight] = useState('')
  const [message, setMessage] = useState('Ready')
  const [workingMessage, setWorkingMessage] = useState('')
  const [loading, setLoading] = useState(false)

  const normalizedVin = vin.trim().toUpperCase()

  const vehicleTitle = useMemo(() => {
    const vehicle = dashboard?.vehicle
    if (!vehicle) return 'No vehicle selected'
    return [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ')
  }, [dashboard])

  const editingComplianceRecord = useMemo(
    () => dashboard?.compliance.find((record) => record.id === editingComplianceId),
    [dashboard, editingComplianceId],
  )
  const selectedWorkflow = useMemo(
    () => workflows.find((workflow) => workflow.id === selectedWorkflowId) ?? null,
    [workflows, selectedWorkflowId],
  )
  const selectedWorkflowStep = useMemo(
    () => selectedWorkflow?.steps.find((step) => step.stepKey === selectedWorkflowStepKey) ?? null,
    [selectedWorkflow, selectedWorkflowStepKey],
  )
  const activeWorkflows = workflows.filter((workflow) => workflow.status !== 'Complete' && workflow.status !== 'Canceled')
  const selectedWorkflowStepDocumentId =
    typeof selectedWorkflowStep?.data?.documentId === 'string' ? selectedWorkflowStep.data.documentId : ''
  const selectedWorkflowStepAiText =
    typeof selectedWorkflowStep?.data?.aiText === 'string' ? selectedWorkflowStep.data.aiText : ''

  const workingIndicator = workingMessage ? (
    <div className="working-inline" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{workingMessage}</span>
    </div>
  ) : null

  useEffect(() => {
    restoreWorkspace()
    refreshLockBoxes()
    refreshWorkflows()

    if (localStorage.getItem(vinScanPendingStorageKey) === 'true') {
      recoverLatestVinScan()
    }

    if (localStorage.getItem(complianceScanPendingStorageKey) === 'true') {
      recoverLatestComplianceScan()
    }
  }, [])

  useEffect(() => {
    function refreshAfterCameraReturn() {
      const vehicleId = localStorage.getItem(selectedVehicleStorageKey)

      if (localStorage.getItem(vinScanPendingStorageKey) === 'true') {
        recoverLatestVinScan()
      }

      if (localStorage.getItem(complianceScanPendingStorageKey) === 'true') {
        recoverLatestComplianceScan()
      }

      if (!vehicleId) return

      if (localStorage.getItem(tirePanelStorageKey) === 'true') {
        setShowTirePressurePanel(true)
        loadTirePressure(vehicleId)
      }

      if (localStorage.getItem(tireSpecScanPendingStorageKey) === 'true') {
        pollTirePressureSpec(vehicleId)
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') refreshAfterCameraReturn()
    }

    window.addEventListener('focus', refreshAfterCameraReturn)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', refreshAfterCameraReturn)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  async function restoreWorkspace() {
    await refreshVehicles()

    const savedVehicleId = localStorage.getItem(selectedVehicleStorageKey)
    const savedTirePanel = localStorage.getItem(tirePanelStorageKey) === 'true'

    if (savedTirePanel) setShowTirePressurePanel(true)
    if (!savedVehicleId) return

    setLoading(true)
    setMessage('Restoring vehicle...')

    try {
      await loadDashboard(savedVehicleId)
      if (localStorage.getItem(tireSpecScanPendingStorageKey) === 'true') {
        await pollTirePressureSpec(savedVehicleId)
      }
      if (localStorage.getItem(complianceScanPendingStorageKey) !== 'true' && localStorage.getItem(vinScanPendingStorageKey) !== 'true') {
        setMessage('Vehicle restored')
      }
    } catch {
      localStorage.removeItem(selectedVehicleStorageKey)
      localStorage.removeItem(tirePanelStorageKey)
      setMessage('Ready')
    } finally {
      setLoading(false)
    }
  }

  async function refreshVehicles() {
    try {
      const nextVehicles = await api.get<Vehicle[]>('/api/vehicles')
      setVehicles(nextVehicles)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load vehicles')
    }
  }

  async function refreshLockBoxes() {
    try {
      const nextLockBoxes = await api.get<LockBox[]>('/api/lock-boxes')
      setLockBoxes(nextLockBoxes)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load lock boxes')
    }
  }

  async function refreshWorkflows() {
    try {
      const nextWorkflows = await api.get<WorkflowInstance[]>('/api/workflows?includeCompleted=false')
      setWorkflows(nextWorkflows)
      if (!selectedWorkflowId && nextWorkflows.length > 0) {
        setSelectedWorkflowId(nextWorkflows[0].id)
        setSelectedWorkflowStepKey(nextWorkflows[0].currentStepKey)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load workflows')
    }
  }

  async function loadDashboard(vehicleId: string) {
    const nextDashboard = await api.get<Dashboard>(`/api/vehicles/${vehicleId}/dashboard`)
    setDashboard(nextDashboard)
    setSelectedLockBoxId('')
    await loadTirePressure(vehicleId)
  }

  async function loadTirePressure(vehicleId: string) {
    const snapshot = await api.get<TirePressureSnapshot>(`/api/vehicles/${vehicleId}/tire-pressure`)
    setTirePressure(snapshot)
    setTireSpecForm({
      frontLeftPsi: snapshot.spec?.frontLeftPsi?.toString() ?? '',
      frontRightPsi: snapshot.spec?.frontRightPsi?.toString() ?? '',
      rearLeftPsi: snapshot.spec?.rearLeftPsi?.toString() ?? '',
      rearRightPsi: snapshot.spec?.rearRightPsi?.toString() ?? '',
      notes: snapshot.spec?.notes ?? '',
    })
  }

  async function pollTirePressureSpec(vehicleId: string) {
    setShowTirePressurePanel(true)
    localStorage.setItem(tirePanelStorageKey, 'true')

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const snapshot = await api.get<TirePressureSnapshot>(`/api/vehicles/${vehicleId}/tire-pressure`)
      setTirePressure(snapshot)
      setTireSpecForm({
        frontLeftPsi: snapshot.spec?.frontLeftPsi?.toString() ?? '',
        frontRightPsi: snapshot.spec?.frontRightPsi?.toString() ?? '',
        rearLeftPsi: snapshot.spec?.rearLeftPsi?.toString() ?? '',
        rearRightPsi: snapshot.spec?.rearRightPsi?.toString() ?? '',
        notes: snapshot.spec?.notes ?? '',
      })

      if (snapshot.spec) {
        localStorage.removeItem(tireSpecScanPendingStorageKey)
        setMessage('Tire pressure spec loaded')
        return
      }

      await wait(1500)
    }

    setMessage('Still waiting for tire scan result. Try Scan Plate again if needed.')
  }

  async function uploadVehicleDocument(vehicleId: string, file: File, description: string) {
    const form = new FormData()
    form.append('file', file)
    form.append('kind', 'Other')
    form.append('description', description)

    const response = await fetch(`/api/vehicles/${vehicleId}/documents`, {
      method: 'POST',
      body: form,
    })

    if (!response.ok) throw new Error(await response.text())
    return (await response.json()) as DocumentRecord
  }

  function startEditingCompliance(record: ComplianceRecord) {
    setEditingComplianceId(record.id)
    setComplianceForm({
      provider: record.provider ?? '',
      policyNumber: record.policyNumber ?? '',
      documentNumber: record.documentNumber ?? '',
      plateNumber: record.plateNumber ?? '',
      plateState: record.plateState ?? '',
      vin: record.vin ?? '',
      stickerMonth: record.stickerMonth ?? '',
      stickerYear: record.stickerYear?.toString() ?? '',
      serialNumber: record.serialNumber ?? '',
      effectiveDate: record.effectiveDate ?? '',
      expirationDate: record.expirationDate ?? '',
      notes: record.notes ?? '',
    })
    window.setTimeout(() => {
      complianceFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function markComplianceScanPending(recordType: string) {
    const vehicleId = dashboard?.vehicle.id ?? localStorage.getItem(selectedVehicleStorageKey) ?? ''
    localStorage.setItem(complianceScanPendingStorageKey, 'true')
    localStorage.setItem(complianceScanTypeStorageKey, recordType)
    localStorage.setItem(complianceScanVehicleStorageKey, vehicleId)
    localStorage.setItem(complianceScanStartedStorageKey, new Date().toISOString())
  }

  function clearComplianceScanPending() {
    localStorage.removeItem(complianceScanPendingStorageKey)
    localStorage.removeItem(complianceScanTypeStorageKey)
    localStorage.removeItem(complianceScanVehicleStorageKey)
    localStorage.removeItem(complianceScanStartedStorageKey)
  }

  function markVinScanPending() {
    getVinScanClientId()
    localStorage.setItem(vinScanPendingStorageKey, 'true')
    localStorage.setItem(vinScanStartedStorageKey, new Date().toISOString())
    const scanMessage = 'Reading VIN photo...'
    setMessage(scanMessage)
    setWorkingMessage(scanMessage)
  }

  function clearVinScanPending() {
    localStorage.removeItem(vinScanPendingStorageKey)
    localStorage.removeItem(vinScanStartedStorageKey)
  }

  function openVinCamera() {
    markVinScanPending()
    if (vinCameraInputRef.current) {
      vinCameraInputRef.current.value = ''
      vinCameraInputRef.current.click()
    }
  }

  function openComplianceCamera(recordType: string) {
    setComplianceScanType(recordType)
    markComplianceScanPending(recordType)
    const scanMessage = `Waiting for ${formatComplianceType(recordType)} photo...`
    setMessage(scanMessage)
    setWorkingMessage(scanMessage)
    if (complianceCameraInputRef.current) {
      complianceCameraInputRef.current.value = ''
      complianceCameraInputRef.current.click()
    }
  }

  async function recoverLatestComplianceScan() {
    if (complianceRecoveryActiveRef.current) return
    complianceRecoveryActiveRef.current = true

    const recordType = localStorage.getItem(complianceScanTypeStorageKey) || 'Compliance'
    const vehicleId = localStorage.getItem(complianceScanVehicleStorageKey) || localStorage.getItem(selectedVehicleStorageKey)
    const startedAt = Date.parse(localStorage.getItem(complianceScanStartedStorageKey) || '')

    if (!vehicleId) {
      clearComplianceScanPending()
      complianceRecoveryActiveRef.current = false
      return
    }

    try {
      localStorage.setItem(selectedVehicleStorageKey, vehicleId)
      for (let attempt = 0; attempt < 45; attempt += 1) {
        try {
          const waitMessage = `Waiting for ${formatComplianceType(recordType)} scan result...`
          setMessage(waitMessage)
          setWorkingMessage(waitMessage)
          const nextDashboard = await api.get<Dashboard>(`/api/vehicles/${vehicleId}/dashboard`)
          setDashboard(nextDashboard)
          const record = nextDashboard.compliance.find((item) => item.recordType === recordType)
          const updatedAt = Date.parse(record?.updatedAt ?? '')

          if (record && (!Number.isFinite(startedAt) || updatedAt >= startedAt)) {
            clearComplianceScanPending()
            startEditingCompliance(record)
            setWorkingMessage('')
            setMessage(`${formatComplianceType(record.recordType)} read. Review and save corrections if needed.`)
            return
          }
        } catch {
          // Recovery keeps polling because mobile camera uploads can finish after the page regains focus.
        }

        await wait(2000)
      }

      if (localStorage.getItem(complianceScanPendingStorageKey) === 'true') {
        clearComplianceScanPending()
        setWorkingMessage('')
        setMessage(`${formatComplianceType(recordType)} scan timed out. Try again closer and steady.`)
      }
    } finally {
      complianceRecoveryActiveRef.current = false
    }
  }

  async function scanCompliancePhoto(file: File) {
    const vehicleId =
      dashboard?.vehicle.id ??
      localStorage.getItem(complianceScanVehicleStorageKey) ??
      localStorage.getItem(selectedVehicleStorageKey)
    const recordType = localStorage.getItem(complianceScanTypeStorageKey) || complianceScanType

    if (!vehicleId) {
      setMessage('No vehicle selected for compliance scan.')
      return
    }

    setLoading(true)
    const scanMessage = `Reading ${formatComplianceType(recordType)} photo...`
    setMessage(scanMessage)
    setWorkingMessage(scanMessage)

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('recordType', recordType)
      markComplianceScanPending(recordType)

      const response = await fetch(`/api/vehicles/${vehicleId}/compliance/photo`, {
        method: 'POST',
        body: form,
      })

      if (!response.ok) throw new Error(await response.text())

      const scan = (await response.json()) as CompliancePhotoScanResponse
      clearComplianceScanPending()
      localStorage.setItem(selectedVehicleStorageKey, vehicleId)
      await loadDashboard(vehicleId)
      startEditingCompliance(scan.record)
      setWorkingMessage('')
      setMessage(`${formatComplianceType(scan.record.recordType)} read. Review and save corrections if needed.`)
    } catch (error) {
      clearComplianceScanPending()
      setWorkingMessage('')
      setMessage(error instanceof Error ? error.message : 'Could not read compliance photo')
    } finally {
      setLoading(false)
    }
  }

  async function saveComplianceRecord(event: FormEvent) {
    event.preventDefault()
    if (!dashboard || !editingComplianceId) return

    setLoading(true)
    setMessage('Saving compliance details...')

    try {
      await api.put<ComplianceRecord>(`/api/vehicles/${dashboard.vehicle.id}/compliance/${editingComplianceId}`, {
        provider: complianceForm.provider || null,
        policyNumber: complianceForm.policyNumber || null,
        documentNumber: complianceForm.documentNumber || null,
        plateNumber: complianceForm.plateNumber || null,
        plateState: complianceForm.plateState || null,
        vin: complianceForm.vin || null,
        stickerMonth: complianceForm.stickerMonth || null,
        stickerYear: complianceForm.stickerYear ? Number(complianceForm.stickerYear) : null,
        serialNumber: complianceForm.serialNumber || null,
        effectiveDate: complianceForm.effectiveDate || null,
        expirationDate: complianceForm.expirationDate || null,
        notes: complianceForm.notes || null,
      })
      setEditingComplianceId('')
      await loadDashboard(dashboard.vehicle.id)
      setMessage('Compliance details saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save compliance details')
    } finally {
      setLoading(false)
    }
  }

  async function openVehicle(vehicle: Vehicle) {
    setActiveArea('inventory')
    setLoading(true)
    setMessage('Loading vehicle...')
    setDecoded(null)
    setVin(vehicle.vin)
    setShowMaintenanceForm(false)
    localStorage.setItem(selectedVehicleStorageKey, vehicle.id)

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
    setActiveArea('inventory')
    setDashboard(null)
    setDecoded(null)
    setVin('')
    setShowMaintenanceForm(false)
    setShowTirePressurePanel(false)
    setShowLockBoxManager(false)
    setEditingLockBoxId('')
    setEditingComplianceId('')
    localStorage.removeItem(selectedVehicleStorageKey)
    localStorage.removeItem(tirePanelStorageKey)
    setMessage('Ready')
  }

  async function lookupVehicle(event?: FormEvent) {
    event?.preventDefault()
    await lookupVehicleByVin(normalizedVin)
  }

  async function applyScannedVin(scannedVin: string) {
    clearVinScanPending()
    setWorkingMessage('')
    setVin(scannedVin)
    setMessage(`VIN read: ${scannedVin}`)

    try {
      await lookupVehicleByVin(scannedVin)
    } catch (error) {
      setMessage(error instanceof Error ? `VIN read, but lookup failed: ${error.message}` : 'VIN read, but lookup failed')
    }
  }

  async function recoverLatestVinScan() {
    if (vinRecoveryActiveRef.current) return
    vinRecoveryActiveRef.current = true
    const clientId = getVinScanClientId()
    const startedAt = Date.parse(localStorage.getItem(vinScanStartedStorageKey) || '')

    try {
      for (let attempt = 0; attempt < 45; attempt += 1) {
        try {
          if (attempt === 0) {
            setMessage('Waiting for VIN scan result...')
            setWorkingMessage('Waiting for VIN scan result...')
          }
          const latest = await api.get<VinLatestScanResponse>(`/api/vin/latest-scan/${encodeURIComponent(clientId)}`)
          const scannedVin = latest.vin?.trim().toUpperCase()
          const loggedAt = Date.parse(latest.loggedAt ?? '')
          const isCurrentAttempt = !Number.isFinite(startedAt) || (Number.isFinite(loggedAt) && loggedAt >= startedAt)

          if (scannedVin && isCurrentAttempt) {
            await applyScannedVin(scannedVin)
            return
          }
        } catch {
          // Camera return recovery is best effort; the active scan handler will show errors.
        }

        await wait(2000)
      }

      if (localStorage.getItem(vinScanPendingStorageKey) === 'true') {
        clearVinScanPending()
        setWorkingMessage('')
        setMessage('VIN scan timed out. Try the door jamb label again, closer and steady.')
      }
    } finally {
      vinRecoveryActiveRef.current = false
    }
  }

  async function lookupVehicleByVin(vinToLookup: string) {
    const nextVin = vinToLookup.trim().toUpperCase()
    if (!nextVin) return

    setLoading(true)
    setMessage('Looking up vehicle...')
    setDashboard(null)
    setDecoded(null)
    setVin(nextVin)

    try {
      const vehicle = await api.get<Vehicle>(`/api/vehicles/by-vin/${encodeURIComponent(nextVin)}`)
      localStorage.setItem(selectedVehicleStorageKey, vehicle.id)
      await loadDashboard(vehicle.id)
      setMessage('Vehicle loaded')
    } catch {
      setMessage('VIN not found. Decoding basics...')
      const decode = await api.get<VinDecode>(`/api/vin/${encodeURIComponent(nextVin)}/decode`)
      setDecoded(decode)
      setVehicleForm({
        ...emptyVehicleForm,
        vin: nextVin,
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

  async function scanVinFromPhoto(file: File) {
    setLoading(true)
    const scanMessage = 'Reading VIN photo...'
    setMessage(scanMessage)
    setWorkingMessage(scanMessage)

    try {
      const form = new FormData()
      const clientId = getVinScanClientId()
      form.append('file', file)
      form.append('clientId', clientId)
      if (localStorage.getItem(vinScanPendingStorageKey) !== 'true') markVinScanPending()

      const response = await fetch('/api/vin/scan-photo', {
        method: 'POST',
        body: form,
      })

      const responseText = await response.text()
      if (!response.ok) throw new Error(responseText)

      const scan = JSON.parse(responseText) as VinScanResponse
      const apiVin = typeof scan.vin === 'string' ? scan.vin : ''
      const aiText = typeof scan.aiText === 'string' ? scan.aiText : ''
      const scannedVin = apiVin.trim().toUpperCase() || extractVin(aiText)

      if (!scannedVin) {
        clearVinScanPending()
        setWorkingMessage('')
        setMessage('No VIN found in photo. Try closer, flatter lighting, and fill the frame with the VIN.')
        return
      }

      await applyScannedVin(scannedVin)
    } catch (error) {
      clearVinScanPending()
      setWorkingMessage('')
      setMessage(error instanceof Error ? error.message : 'Could not read VIN photo')
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
      setShowMaintenanceForm(false)
      localStorage.setItem(selectedVehicleStorageKey, vehicle.id)
      await loadDashboard(vehicle.id)
      await refreshVehicles()
      await refreshLockBoxes()
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

      if (receiptFile) {
        const form = new FormData()
        form.append('file', receiptFile)
        form.append('kind', 'Receipt')
        form.append('description', `${maintenanceForm.eventType} receipt`)

        const response = await fetch(`/api/vehicles/${dashboard.vehicle.id}/documents`, {
          method: 'POST',
          body: form,
        })

        if (!response.ok) throw new Error(await response.text())
      }

      await loadDashboard(dashboard.vehicle.id)
      await refreshVehicles()
      await refreshLockBoxes()
      setReceiptFile(null)
      setReceiptInsight('')
      setShowMaintenanceForm(false)
      setMessage('Maintenance logged')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not log maintenance')
    } finally {
      setLoading(false)
    }
  }

  async function readReceipt() {
    if (!dashboard || !receiptFile) return

    setLoading(true)
    setMessage('Reading receipt...')

    try {
      const form = new FormData()
      form.append('file', receiptFile)
      form.append('vehicleVin', dashboard.vehicle.vin)
      form.append(
        'prompt',
        'Read this maintenance receipt. Extract vendor, date, total cost, odometer if visible, maintenance type, and line items. Return concise plain text.',
      )

      const response = await fetch('/api/ai/interpret-image', {
        method: 'POST',
        body: form,
      })

      if (!response.ok) throw new Error(await response.text())

      const ai = (await response.json()) as AIResponse
      const applied = tryApplyReceiptDetails(ai.text)

      setReceiptInsight(ai.text)
      setMaintenanceForm((current) => ({
        ...current,
        cost: current.cost || applied.cost || '',
        datePerformed: current.datePerformed || applied.date || current.datePerformed,
        notes: [current.notes, `Receipt readout:\n${ai.text}`].filter(Boolean).join('\n\n'),
      }))
      setMessage('Receipt read. Review fields before saving.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read receipt')
    } finally {
      setLoading(false)
    }
  }

  async function readTireSpecPhoto(file: File) {
    if (!dashboard) return

    setLoading(true)
    setMessage('Reading tire placard...')
    localStorage.setItem(tireSpecScanPendingStorageKey, 'true')

    try {
      const form = new FormData()
      form.append('file', file)

      const response = await fetch(`/api/vehicles/${dashboard.vehicle.id}/tire-pressure/spec/photo`, {
        method: 'POST',
        body: form,
      })

      if (!response.ok) {
        const errorText = await response.text()
        try {
          const parsed = JSON.parse(errorText) as { error?: string; aiText?: string }
          if (parsed.aiText) {
            setShowTirePressurePanel(true)
            localStorage.setItem(tirePanelStorageKey, 'true')
            setTirePressureInsight(parsed.aiText)
            setTireSpecForm((current) => ({ ...current, notes: parsed.aiText ?? current.notes }))
          }
          throw new Error(parsed.error || errorText)
        } catch (error) {
          if (error instanceof Error && error.message !== errorText) throw error
          throw new Error(errorText)
        }
      }

      const result = (await response.json()) as TirePressureSpecScanResponse
      const nextSpecForm = {
        frontLeftPsi: result.spec.frontLeftPsi?.toString() ?? '',
        frontRightPsi: result.spec.frontRightPsi?.toString() ?? '',
        rearLeftPsi: result.spec.rearLeftPsi?.toString() ?? '',
        rearRightPsi: result.spec.rearRightPsi?.toString() ?? '',
        notes: result.aiText,
      }

      setShowTirePressurePanel(true)
      localStorage.setItem(tirePanelStorageKey, 'true')
      setTirePressureInsight(result.aiText)
      setTireSpecForm(nextSpecForm)
      setTirePressure((current) => ({ ...current, spec: result.spec }))
      localStorage.removeItem(tireSpecScanPendingStorageKey)
      setMessage('Tire pressure spec saved. Review it before relying on it.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read tire placard')
    } finally {
      setLoading(false)
    }
  }

  async function readTireLogPhoto(file: File) {
    if (!dashboard) return

    setLoading(true)
    setMessage('Reading tire pressure readings...')

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('vehicleVin', dashboard.vehicle.vin)
      form.append(
        'prompt',
        'Read actual tire pressure readings from this image. Return PSI values using labels frontLeftPsi, frontRightPsi, rearLeftPsi, rearRightPsi. If only handwritten/listed values are visible, infer positions from labels if possible.',
      )

      const response = await fetch('/api/ai/interpret-image', { method: 'POST', body: form })
      if (!response.ok) throw new Error(await response.text())

      const ai = (await response.json()) as AIResponse
      const numbers = firstPressures(ai.text)
      const nextForm = {
        frontLeftPsi: (extractPressure('frontLeft|front left|fl', ai.text) ?? numbers[0] ?? '').toString(),
        frontRightPsi: (extractPressure('frontRight|front right|fr', ai.text) ?? numbers[1] ?? '').toString(),
        rearLeftPsi: (extractPressure('rearLeft|rear left|rl', ai.text) ?? numbers[2] ?? '').toString(),
        rearRightPsi: (extractPressure('rearRight|rear right|rr', ai.text) ?? numbers[3] ?? '').toString(),
        notes: ai.text,
      }

      setTireLogForm(nextForm)
      setTireLogPhotoFile(file)
      setTirePressureInsight(ai.text)
      setMessage('Tire readings filled. Review before saving.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read tire pressure photo')
    } finally {
      setLoading(false)
    }
  }

  async function saveTireSpec(event: FormEvent) {
    event.preventDefault()
    if (!dashboard) return

    setLoading(true)
    setMessage('Saving tire pressure spec...')

    try {
      await api.put<TirePressureSpec>(`/api/vehicles/${dashboard.vehicle.id}/tire-pressure/spec`, {
        frontLeftPsi: tireSpecForm.frontLeftPsi ? Number(tireSpecForm.frontLeftPsi) : null,
        frontRightPsi: tireSpecForm.frontRightPsi ? Number(tireSpecForm.frontRightPsi) : null,
        rearLeftPsi: tireSpecForm.rearLeftPsi ? Number(tireSpecForm.rearLeftPsi) : null,
        rearRightPsi: tireSpecForm.rearRightPsi ? Number(tireSpecForm.rearRightPsi) : null,
        notes: tireSpecForm.notes || null,
        photoDocumentId: tirePressure.spec?.photoDocumentId ?? null,
      })
      await loadTirePressure(dashboard.vehicle.id)
      setMessage('Tire pressure spec saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save tire pressure spec')
    } finally {
      setLoading(false)
    }
  }

  async function saveTireLog(event: FormEvent) {
    event.preventDefault()
    if (!dashboard) return

    setLoading(true)
    setMessage('Saving tire pressure log...')

    try {
      const document = tireLogPhotoFile
        ? await uploadVehicleDocument(dashboard.vehicle.id, tireLogPhotoFile, 'Tire pressure readings photo')
        : null

      await api.post<TirePressureLog>(`/api/vehicles/${dashboard.vehicle.id}/tire-pressure/logs`, {
        measuredAt: new Date().toISOString(),
        frontLeftPsi: tireLogForm.frontLeftPsi ? Number(tireLogForm.frontLeftPsi) : null,
        frontRightPsi: tireLogForm.frontRightPsi ? Number(tireLogForm.frontRightPsi) : null,
        rearLeftPsi: tireLogForm.rearLeftPsi ? Number(tireLogForm.rearLeftPsi) : null,
        rearRightPsi: tireLogForm.rearRightPsi ? Number(tireLogForm.rearRightPsi) : null,
        notes: tireLogForm.notes || null,
        photoDocumentId: document?.id ?? null,
      })
      await loadTirePressure(dashboard.vehicle.id)
      setTireLogForm({ frontLeftPsi: '', frontRightPsi: '', rearLeftPsi: '', rearRightPsi: '', notes: '' })
      setTireLogPhotoFile(null)
      setMessage('Tire pressure log saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save tire pressure log')
    } finally {
      setLoading(false)
    }
  }

  function startEditingLockBox(lockBox: LockBox) {
    setEditingLockBoxId(lockBox.id)
    setLockBoxForm({
      serialNumber: lockBox.serialNumber ?? '',
      combo: lockBox.combo,
      style: lockBox.style,
      status: lockBox.status,
      notes: lockBox.notes ?? '',
    })
  }

  async function saveLockBox(event: FormEvent) {
    event.preventDefault()
    if (!editingLockBoxId) return

    setLoading(true)
    setMessage('Saving lock box...')

    try {
      await api.put<LockBox>(`/api/lock-boxes/${editingLockBoxId}`, {
        serialNumber: lockBoxForm.serialNumber || null,
        combo: lockBoxForm.combo,
        style: lockBoxForm.style,
        status: lockBoxForm.status,
        notes: lockBoxForm.notes || null,
      })
      await refreshLockBoxes()
      if (dashboard) await loadDashboard(dashboard.vehicle.id)
      setEditingLockBoxId('')
      setMessage('Lock box saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save lock box')
    } finally {
      setLoading(false)
    }
  }

  async function assignLockBox() {
    if (!dashboard || !selectedLockBoxId) return

    setLoading(true)
    setMessage('Assigning lock box...')

    try {
      await api.post<LockBox>(`/api/lock-boxes/${selectedLockBoxId}/assign`, {
        vehicleId: dashboard.vehicle.id,
        notes: null,
      })
      await loadDashboard(dashboard.vehicle.id)
      await refreshLockBoxes()
      setMessage('Lock box assigned')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not assign lock box')
    } finally {
      setLoading(false)
    }
  }

  async function unassignCurrentLockBox() {
    if (!dashboard?.currentLockBox) return

    setLoading(true)
    setMessage('Removing lock box assignment...')

    try {
      await api.post<LockBox>(`/api/lock-boxes/${dashboard.currentLockBox.id}/unassign`, {
        notes: null,
      })
      await loadDashboard(dashboard.vehicle.id)
      await refreshLockBoxes()
      setMessage('Lock box unassigned')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not unassign lock box')
    } finally {
      setLoading(false)
    }
  }

  function selectWorkflow(workflow: WorkflowInstance) {
    setSelectedWorkflowId(workflow.id)
    setSelectedWorkflowStepKey(workflow.currentStepKey)
    const step = workflow.steps.find((item) => item.stepKey === workflow.currentStepKey)
    const notes = typeof step?.data?.notes === 'string' ? step.data.notes : ''
    setWorkflowStepNotes(notes)
    setObd2ReportFile(null)
    setObd2ReportInsight(typeof step?.data?.aiText === 'string' ? step.data.aiText : '')
  }

  function selectWorkflowStep(step: WorkflowStep) {
    setSelectedWorkflowStepKey(step.stepKey)
    setWorkflowStepNotes(typeof step.data?.notes === 'string' ? step.data.notes : '')
    setObd2ReportFile(null)
    setObd2ReportInsight(typeof step.data?.aiText === 'string' ? step.data.aiText : '')
  }

  async function startWorkflow(workflowType: string) {
    setLoading(true)
    setMessage('Starting workflow...')

    try {
      const workflow = await api.post<WorkflowInstance>('/api/workflows', {
        workflowType,
        vehicleId: dashboard?.vehicle.id ?? null,
        title: null,
      })
      setActiveArea('workflows')
      setWorkflows((current) => [workflow, ...current])
      selectWorkflow(workflow)
      setMessage('Workflow started')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not start workflow')
    } finally {
      setLoading(false)
    }
  }

  async function saveWorkflowStep(status: string) {
    if (!selectedWorkflow || !selectedWorkflowStep) return

    setLoading(true)
    setMessage('Saving workflow step...')

    try {
      const workflow = await api.put<WorkflowInstance>(
        `/api/workflows/${selectedWorkflow.id}/steps/${selectedWorkflowStep.stepKey}`,
        {
          status,
          makeCurrent: true,
          data: {
            ...(selectedWorkflowStep.data ?? {}),
            notes: workflowStepNotes,
          },
        },
      )
      setWorkflows((current) => current.map((item) => (item.id === workflow.id ? workflow : item)))
      selectWorkflow(workflow)
      setSelectedWorkflowStepKey(selectedWorkflowStep.stepKey)
      setMessage(status === 'Complete' ? 'Step marked complete' : 'Workflow step saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save workflow step')
    } finally {
      setLoading(false)
    }
  }

  async function uploadObd2Report() {
    if (!selectedWorkflow || !selectedWorkflowStep || !obd2ReportFile) return

    setLoading(true)
    setMessage('Reading OBD2 report...')
    setWorkingMessage('Reading OBD2 report...')

    try {
      const form = new FormData()
      form.append('file', obd2ReportFile)

      const response = await fetch(`/api/workflows/${selectedWorkflow.id}/steps/${selectedWorkflowStep.stepKey}/obd2-report`, {
        method: 'POST',
        body: form,
      })

      if (!response.ok) throw new Error(await response.text())

      const result = (await response.json()) as Obd2ReportUploadResponse
      setWorkflows((current) => current.map((item) => (item.id === result.workflow.id ? result.workflow : item)))
      setSelectedWorkflowId(result.workflow.id)
      setSelectedWorkflowStepKey(selectedWorkflowStep.stepKey)
      setObd2ReportFile(null)
      setObd2ReportInsight(result.aiText)
      setMessage('OBD2 report read. Review the findings.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read OBD2 report')
    } finally {
      setWorkingMessage('')
      setLoading(false)
    }
  }

  async function updateWorkflowStatus(status: string) {
    if (!selectedWorkflow) return

    setLoading(true)
    setMessage('Updating workflow...')

    try {
      const workflow = await api.put<WorkflowInstance>(`/api/workflows/${selectedWorkflow.id}/status`, {
        status,
        currentStepKey: selectedWorkflowStepKey || selectedWorkflow.currentStepKey,
      })
      await refreshWorkflows()
      if (status === 'Complete' || status === 'Canceled') {
        setSelectedWorkflowId('')
        setSelectedWorkflowStepKey('')
        setWorkflowStepNotes('')
      } else {
        selectWorkflow(workflow)
      }
      setMessage(`Workflow ${status.toLowerCase()}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update workflow')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">KwestKarz Maintenance</p>
          <h1>{areaTitles[activeArea]}</h1>
        </div>
        <span className={loading ? 'status busy' : 'status'}>{message}</span>
      </header>
      <nav className="app-nav" aria-label="Main areas">
        {appAreas.map((area) => (
          <button
            key={area.id}
            className={activeArea === area.id ? 'nav-button selected' : 'nav-button'}
            type="button"
            onClick={() => setActiveArea(area.id)}
          >
            {area.label}
          </button>
        ))}
      </nav>
      {workingMessage && (
        <div className="working-overlay" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>{workingMessage}</span>
        </div>
      )}

      {activeArea === 'home' && (
        <section className="area-grid">
          <div className="panel area-panel">
            <div className="section-heading">
              <h2>Fleet Snapshot</h2>
              <p>{vehicles.length} vehicles</p>
            </div>
            <div className="metrics">
              <div>
                <span>Active</span>
                <strong>{vehicles.filter((vehicle) => vehicle.status === 'Active').length}</strong>
              </div>
              <div>
                <span>Lock Boxes</span>
                <strong>{lockBoxes.length}</strong>
              </div>
              <div>
                <span>Available Boxes</span>
                <strong>{lockBoxes.filter((box) => box.status === 'Available' && !box.currentVehicleId).length}</strong>
              </div>
            </div>
            <div className="quick-actions">
              <button className="primary-action" type="button" onClick={() => setActiveArea('workflows')}>
                Start Workflow
              </button>
              <button className="secondary-button" type="button" onClick={() => setActiveArea('inventory')}>
                Open Inventory
              </button>
            </div>
          </div>

          <div className="panel area-panel">
            <div className="section-heading">
              <h2>Active Workflows</h2>
              <p>{activeWorkflows.length}</p>
            </div>
            <div className="record-list">
              {activeWorkflows.length === 0 && <p className="empty">No active workflows.</p>}
              {activeWorkflows.slice(0, 4).map((workflow) => (
                <button
                  key={workflow.id}
                  className="vehicle-list-item"
                  type="button"
                  onClick={() => {
                    setActiveArea('workflows')
                    selectWorkflow(workflow)
                  }}
                >
                  <span>{workflow.title}</span>
                  <small>{workflow.status} - {workflow.steps.find((step) => step.stepKey === workflow.currentStepKey)?.title ?? workflow.currentStepKey}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="panel area-panel">
            <div className="section-heading">
              <h2>Recent Vehicles</h2>
              <p>{vehicles.slice(0, 4).length}</p>
            </div>
            <div className="vehicle-list">
              {vehicles.slice(0, 4).map((vehicle) => {
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
          </div>
        </section>
      )}

      {activeArea === 'workflows' && (
        <>
          <section className="area-grid workflow-grid">
            {workflowCatalog.map(([workflowType, title, detail]) => (
              <button key={workflowType} className="workflow-card" type="button" disabled={loading} onClick={() => startWorkflow(workflowType)}>
                <strong>{title}</strong>
                <span>{detail}</span>
              </button>
            ))}
          </section>

          <section className="area-grid">
            <div className="panel area-panel">
              <div className="section-heading">
                <h2>Active</h2>
                <p>{activeWorkflows.length} workflows</p>
              </div>
              <div className="record-list">
                {activeWorkflows.length === 0 && <p className="empty">No active workflows.</p>}
                {activeWorkflows.map((workflow) => (
                  <button
                    key={workflow.id}
                    className={selectedWorkflowId === workflow.id ? 'vehicle-list-item selected-row' : 'vehicle-list-item'}
                    type="button"
                    onClick={() => selectWorkflow(workflow)}
                  >
                    <span>{workflow.title}</span>
                    <small>{workflow.status} - {workflow.steps.find((step) => step.stepKey === workflow.currentStepKey)?.title ?? workflow.currentStepKey}</small>
                  </button>
                ))}
              </div>
            </div>

            <div className="panel area-panel">
              <div className="section-heading">
                <h2>{selectedWorkflow?.title ?? 'Workflow'}</h2>
                <p>{selectedWorkflow?.status ?? 'Select one'}</p>
              </div>
              {!selectedWorkflow && <p className="empty">Start or select a workflow to continue.</p>}
              {selectedWorkflow && (
                <>
                  <div className="workflow-step-list">
                    {selectedWorkflow.steps.map((step) => (
                      <button
                        key={step.id}
                        className={selectedWorkflowStepKey === step.stepKey ? 'workflow-step selected' : 'workflow-step'}
                        type="button"
                        onClick={() => selectWorkflowStep(step)}
                      >
                        <strong>{step.title}</strong>
                        <span>{step.status}</span>
                      </button>
                    ))}
                  </div>

                  {selectedWorkflowStep && (
                    <div className="workflow-editor">
                      <div className="section-heading compact-heading">
                        <h2>{selectedWorkflowStep.title}</h2>
                        <p>{selectedWorkflowStep.status}</p>
                      </div>
                      <label>
                        <span>Notes / draft data</span>
                        <textarea
                          value={workflowStepNotes}
                          onChange={(event) => setWorkflowStepNotes(event.target.value)}
                          placeholder="Save anything learned on this step. Fields and scanners will plug in here as we build each workflow."
                        />
                      </label>
                      {selectedWorkflowStep.stepKey === 'obd2Scan' && (
                        <div className="receipt-panel">
                          <label>
                            <span>RepairSolutions2 / Innova PDF</span>
                            <input
                              type="file"
                              accept="application/pdf,.pdf"
                              onChange={(event) => setObd2ReportFile(event.target.files?.[0] ?? null)}
                            />
                          </label>
                          <button className="secondary-button" type="button" disabled={!obd2ReportFile || loading} onClick={uploadObd2Report}>
                            Read OBD2 Report
                          </button>
                          {selectedWorkflowStepDocumentId && (
                            <a className="secondary-button" href={`/api/documents/${selectedWorkflowStepDocumentId}/content`} target="_blank" rel="noreferrer">
                              View PDF
                            </a>
                          )}
                          {(obd2ReportInsight || selectedWorkflowStepAiText) && (
                            <pre className="receipt-insight">{obd2ReportInsight || selectedWorkflowStepAiText}</pre>
                          )}
                        </div>
                      )}
                      <div className="workflow-actions">
                        <button type="button" disabled={loading} onClick={() => saveWorkflowStep('InProgress')}>
                          Save Draft
                        </button>
                        <button className="secondary-button" type="button" disabled={loading} onClick={() => saveWorkflowStep('NeedsReview')}>
                          Needs Review
                        </button>
                        <button className="secondary-button" type="button" disabled={loading} onClick={() => saveWorkflowStep('Complete')}>
                          Mark Complete
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="workflow-actions">
                    <button className="secondary-button" type="button" disabled={loading} onClick={() => updateWorkflowStatus('Waiting')}>
                      Continue Later
                    </button>
                    <button className="secondary-button" type="button" disabled={loading} onClick={() => updateWorkflowStatus('Canceled')}>
                      Cancel Workflow
                    </button>
                    <button className="primary-action" type="button" disabled={loading} onClick={() => updateWorkflowStatus('Complete')}>
                      Complete Workflow
                    </button>
                  </div>
                </>
              )}
            </div>
          </section>
        </>
      )}

      {activeArea === 'maintenance' && (
        <section className="panel area-panel">
          <div className="section-heading">
            <h2>Maintenance</h2>
            <button className="primary-action" type="button" onClick={() => setActiveArea('inventory')}>
              Open Vehicle
            </button>
          </div>
          <div className="record-list">
            {vehicles.map((vehicle) => (
              <button key={vehicle.id} className="vehicle-list-item" type="button" onClick={() => openVehicle(vehicle)}>
                <span>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin}</span>
                <small>{vehicle.currentOdometer?.toLocaleString() ?? 'No miles'} - {vehicle.status}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeArea === 'compliance' && (
        <section className="panel area-panel">
          <div className="section-heading">
            <h2>Compliance</h2>
            <p>{vehicles.length} vehicles</p>
          </div>
          <div className="record-list">
            {vehicles.map((vehicle) => (
              <button key={vehicle.id} className="vehicle-list-item" type="button" onClick={() => openVehicle(vehicle)}>
                <span>{[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.vin}</span>
                <small>{vehicle.licensePlate ? `${vehicle.licensePlateState ?? ''} ${vehicle.licensePlate}` : vehicle.vin}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {activeArea === 'lockboxes' && (
        <section className="panel area-panel">
          <div className="section-heading">
            <h2>Lock Boxes</h2>
            <p>{lockBoxes.length} boxes</p>
          </div>
          <div className="lockbox-list">
            {lockBoxes.map((lockBox) => (
              <article key={lockBox.id} className="lockbox-card">
                <div>
                  <strong>Box {lockBox.boxNumber}</strong>
                  <span>{lockBox.style} - {lockBox.status}</span>
                  <p>Combo: {lockBox.combo || 'Not set'}</p>
                  <p>{lockBox.currentVehicleLabel ? `Assigned to ${lockBox.currentVehicleLabel}` : 'Unassigned'}</p>
                </div>
                <button className="secondary-button" type="button" onClick={() => startEditingLockBox(lockBox)}>
                  Edit
                </button>
              </article>
            ))}
          </div>
          {editingLockBoxId && (
            <form className="lockbox-form" onSubmit={saveLockBox}>
              <label>
                <span>Serial #</span>
                <input
                  value={lockBoxForm.serialNumber}
                  onChange={(event) => setLockBoxForm({ ...lockBoxForm, serialNumber: event.target.value })}
                />
              </label>
              <label>
                <span>Combo</span>
                <input
                  value={lockBoxForm.combo}
                  onChange={(event) => setLockBoxForm({ ...lockBoxForm, combo: event.target.value })}
                />
              </label>
              <label>
                <span>Style</span>
                <select
                  value={lockBoxForm.style}
                  onChange={(event) => setLockBoxForm({ ...lockBoxForm, style: event.target.value })}
                >
                  {lockBoxStyles.map((style) => (
                    <option key={style} value={style}>{style}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select
                  value={lockBoxForm.status}
                  onChange={(event) => setLockBoxForm({ ...lockBoxForm, status: event.target.value })}
                >
                  {lockBoxStatuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className="wide">
                <span>Notes</span>
                <textarea
                  value={lockBoxForm.notes}
                  onChange={(event) => setLockBoxForm({ ...lockBoxForm, notes: event.target.value })}
                />
              </label>
              <button type="submit" disabled={loading}>Save Lock Box</button>
              <button className="secondary-button" type="button" onClick={() => setEditingLockBoxId('')}>
                Cancel
              </button>
            </form>
          )}
        </section>
      )}

      {activeArea === 'settings' && (
        <section className="area-grid">
          <div className="panel area-panel">
            <div className="section-heading">
              <h2>Runtime</h2>
              <span className={loading ? 'status busy' : 'status'}>{message}</span>
            </div>
            <div className="metrics">
              <div>
                <span>Security</span>
                <strong>LAN Dev</strong>
              </div>
              <div>
                <span>AI Logs</span>
                <strong>On</strong>
              </div>
              <div>
                <span>API</span>
                <strong>Local</strong>
              </div>
            </div>
          </div>
        </section>
      )}

      {activeArea === 'inventory' && (
        <>
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
            <input
              ref={vinCameraInputRef}
              className="hidden-input"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) scanVinFromPhoto(file)
              }}
            />
            <button
              className="camera-button"
              type="button"
              disabled={loading}
              aria-label="Scan VIN with camera"
              title="Scan VIN with camera"
              onClick={openVinCamera}
            >
              <span aria-hidden="true">📷</span>
            </button>
            <button type="submit" disabled={loading || normalizedVin.length < 11}>
              Find
            </button>
          </div>
        </form>
      </section>

      {!dashboard && !decoded && (
        <>
        <section className="panel fleet-panel">
          <div className="section-heading">
            <h2>Fleet</h2>
            <div className="heading-actions">
              <p>{vehicles.length} vehicles</p>
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setShowLockBoxManager(!showLockBoxManager)
                  setEditingLockBoxId('')
                }}
              >
                {showLockBoxManager ? 'Hide Lock Boxes' : 'Manage Lock Boxes'}
              </button>
            </div>
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
        {showLockBoxManager && (
        <section className="panel fleet-panel">
          <div className="section-heading">
            <h2>Manage Lock Boxes</h2>
            <p>{lockBoxes.length} boxes</p>
          </div>
          <div className="lockbox-list">
            {lockBoxes.map((lockBox) => (
              <article key={lockBox.id} className="lockbox-card">
                <div>
                  <strong>Box {lockBox.boxNumber}</strong>
                  <span>{lockBox.style} - {lockBox.status}</span>
                  <p>Combo: {lockBox.combo || 'Not set'}</p>
                  <p>{lockBox.currentVehicleLabel ? `Assigned to ${lockBox.currentVehicleLabel}` : 'Unassigned'}</p>
                </div>
                <button className="secondary-button" type="button" onClick={() => startEditingLockBox(lockBox)}>
                  Edit
                </button>
              </article>
            ))}
          </div>
          {editingLockBoxId && (
            <form className="lockbox-form" onSubmit={saveLockBox}>
              <label>
                <span>Serial #</span>
                <input
                  value={lockBoxForm.serialNumber}
                  onChange={(event) => setLockBoxForm({ ...lockBoxForm, serialNumber: event.target.value })}
                />
              </label>
              <label>
                <span>Combo</span>
                <input
                  value={lockBoxForm.combo}
                  onChange={(event) => setLockBoxForm({ ...lockBoxForm, combo: event.target.value })}
                />
              </label>
              <label>
                <span>Style</span>
                <select
                  value={lockBoxForm.style}
                  onChange={(event) => setLockBoxForm({ ...lockBoxForm, style: event.target.value })}
                >
                  {lockBoxStyles.map((style) => (
                    <option key={style} value={style}>{style}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Status</span>
                <select
                  value={lockBoxForm.status}
                  onChange={(event) => setLockBoxForm({ ...lockBoxForm, status: event.target.value })}
                >
                  {lockBoxStatuses.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className="wide">
                <span>Notes</span>
                <textarea
                  value={lockBoxForm.notes}
                  onChange={(event) => setLockBoxForm({ ...lockBoxForm, notes: event.target.value })}
                />
              </label>
              <button type="submit" disabled={loading}>Save Lock Box</button>
              <button className="secondary-button" type="button" onClick={() => setEditingLockBoxId('')}>
                Cancel
              </button>
            </form>
          )}
        </section>
        )}
        </>
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
              <button className="primary-action" type="button" onClick={() => setShowMaintenanceForm(true)}>
                Add Maintenance
              </button>
              <button
                className={showTirePressurePanel ? 'switch-button switch-on' : 'switch-button'}
                type="button"
                aria-pressed={showTirePressurePanel}
                onClick={() => {
                  const nextValue = !showTirePressurePanel
                  setShowTirePressurePanel(nextValue)
                  localStorage.setItem(tirePanelStorageKey, nextValue ? 'true' : 'false')
                }}
              >
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
                Tire Pressure
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
              <h2>Lock Box</h2>
              <p>{dashboard.currentLockBox ? `Box ${dashboard.currentLockBox.boxNumber}` : 'None assigned'}</p>
            </div>
            {dashboard.currentLockBox ? (
              <div className="lockbox-current">
                <div>
                  <span>Combo</span>
                  <strong>{dashboard.currentLockBox.combo || 'Not set'}</strong>
                </div>
                <div>
                  <span>Style</span>
                  <strong>{dashboard.currentLockBox.style}</strong>
                </div>
                <div>
                  <span>Status</span>
                  <strong>{dashboard.currentLockBox.status}</strong>
                </div>
                <button className="secondary-button" type="button" onClick={() => startEditingLockBox(dashboard.currentLockBox!)}>
                  Edit Details
                </button>
                <button className="secondary-button" type="button" disabled={loading} onClick={unassignCurrentLockBox}>
                  Remove From Car
                </button>
              </div>
            ) : (
              <div className="assign-row">
                <select value={selectedLockBoxId} onChange={(event) => setSelectedLockBoxId(event.target.value)}>
                  <option value="">Choose an available box</option>
                  {lockBoxes
                    .filter((lockBox) => lockBox.status === 'Available' && !lockBox.currentVehicleId)
                    .map((lockBox) => (
                      <option key={lockBox.id} value={lockBox.id}>
                        Box {lockBox.boxNumber} - {lockBox.style} - Combo {lockBox.combo || 'not set'}
                      </option>
                    ))}
                </select>
                <button type="button" disabled={!selectedLockBoxId || loading} onClick={assignLockBox}>
                  Assign
                </button>
              </div>
            )}
            {editingLockBoxId && (
              <form className="lockbox-form compact" onSubmit={saveLockBox}>
                <label>
                  <span>Serial #</span>
                  <input
                    value={lockBoxForm.serialNumber}
                    onChange={(event) => setLockBoxForm({ ...lockBoxForm, serialNumber: event.target.value })}
                  />
                </label>
                <label>
                  <span>Combo</span>
                  <input
                    value={lockBoxForm.combo}
                    onChange={(event) => setLockBoxForm({ ...lockBoxForm, combo: event.target.value })}
                  />
                </label>
                <label>
                  <span>Style</span>
                  <select
                    value={lockBoxForm.style}
                    onChange={(event) => setLockBoxForm({ ...lockBoxForm, style: event.target.value })}
                  >
                    {lockBoxStyles.map((style) => (
                      <option key={style} value={style}>{style}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={lockBoxForm.status}
                    onChange={(event) => setLockBoxForm({ ...lockBoxForm, status: event.target.value })}
                  >
                    {lockBoxStatuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <label className="wide">
                  <span>Notes</span>
                  <textarea
                    value={lockBoxForm.notes}
                    onChange={(event) => setLockBoxForm({ ...lockBoxForm, notes: event.target.value })}
                  />
                </label>
                <button type="submit" disabled={loading}>Save Lock Box</button>
                <button className="secondary-button" type="button" onClick={() => setEditingLockBoxId('')}>
                  Cancel
                </button>
              </form>
            )}
          </div>

          <div className="panel compliance-panel">
            <div className="section-heading">
              <h2>Compliance</h2>
              <p>
                {dashboard.compliance.filter((record) => record.dueStatus === 'Expired' || record.dueStatus === 'Due Soon').length} alerts
              </p>
            </div>
            {workingIndicator}
            <input
              ref={complianceCameraInputRef}
              className="hidden-input"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ''
                if (file) scanCompliancePhoto(file)
              }}
            />
            <div className="compliance-actions">
              {complianceTypes.map((type) => (
                <button
                  key={type}
                  className="secondary-button"
                  type="button"
                  disabled={loading}
                  onClick={() => openComplianceCamera(type)}
                >
                  Scan {formatComplianceType(type)}
                </button>
              ))}
            </div>
            <div className="record-list">
              {complianceTypes.map((type) => {
                const record = dashboard.compliance.find((item) => item.recordType === type)
                const checks = record ? complianceChecks(record, dashboard) : { issues: [], ok: [] }
                return (
                  <article key={type} className="record compliance-record">
                    <div className="record-heading">
                      <strong>{formatComplianceType(type)}</strong>
                      <span className={complianceClass(record?.dueStatus)}>{record?.dueStatus ?? 'Missing'}</span>
                    </div>
                    {record ? (
                      <>
                        <p>
                          {record.expirationDate ? `Expires ${record.expirationDate}` : 'No expiration saved'}
                          {record.plateNumber ? ` - Plate ${record.plateNumber}` : ''}
                        </p>
                        <span>
                          {[record.provider, record.policyNumber, record.documentNumber, record.plateState, record.vin].filter(Boolean).join(' - ') || 'Details not filled'}
                        </span>
                        {(record.stickerMonth || record.stickerYear || record.serialNumber) && (
                          <p>
                            {[record.stickerMonth, record.stickerYear ? `Tab ${record.stickerYear}` : '', record.serialNumber ? `Serial ${record.serialNumber}` : ''].filter(Boolean).join(' - ')}
                          </p>
                        )}
                        {(checks.issues.length > 0 || checks.ok.length > 0) && (
                          <div className="match-list">
                            {checks.issues.map((issue) => (
                              <span key={issue} className="status-chip danger">{issue}</span>
                            ))}
                            {checks.ok.map((item) => (
                              <span key={item} className="status-chip good">{item}</span>
                            ))}
                          </div>
                        )}
                        <div className="record-actions">
                          {record.documentId && (
                            <a className="secondary-button" href={`/api/documents/${record.documentId}/content`} target="_blank" rel="noreferrer">
                              View Photo
                            </a>
                          )}
                          <button className="secondary-button" type="button" onClick={() => startEditingCompliance(record)}>
                            Edit
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="empty">No {formatComplianceType(type).toLowerCase()} saved.</p>
                    )}
                  </article>
                )
              })}
            </div>
            {editingComplianceId && (
              <form ref={complianceFormRef} className="compliance-form compact" onSubmit={saveComplianceRecord}>
                <div className="wide form-heading">
                  <strong>Editing {formatComplianceType(editingComplianceRecord?.recordType ?? 'Compliance')}</strong>
                  <span>Review scanned fields before saving.</span>
                </div>
                <label>
                  <span>Provider</span>
                  <input
                    value={complianceForm.provider}
                    onChange={(event) => setComplianceForm({ ...complianceForm, provider: event.target.value })}
                  />
                </label>
                <label>
                  <span>Policy #</span>
                  <input
                    value={complianceForm.policyNumber}
                    onChange={(event) => setComplianceForm({ ...complianceForm, policyNumber: event.target.value })}
                  />
                </label>
                <label>
                  <span>Document #</span>
                  <input
                    value={complianceForm.documentNumber}
                    onChange={(event) => setComplianceForm({ ...complianceForm, documentNumber: event.target.value })}
                  />
                </label>
                <label>
                  <span>Plate #</span>
                  <input
                    value={complianceForm.plateNumber}
                    onChange={(event) => setComplianceForm({ ...complianceForm, plateNumber: event.target.value.toUpperCase() })}
                  />
                </label>
                <label>
                  <span>State</span>
                  <input
                    value={complianceForm.plateState}
                    onChange={(event) => setComplianceForm({ ...complianceForm, plateState: event.target.value.toUpperCase() })}
                  />
                </label>
                <label>
                  <span>VIN</span>
                  <input
                    value={complianceForm.vin}
                    onChange={(event) => setComplianceForm({ ...complianceForm, vin: event.target.value.toUpperCase() })}
                  />
                </label>
                <label>
                  <span>Tab Month</span>
                  <input
                    value={complianceForm.stickerMonth}
                    onChange={(event) => setComplianceForm({ ...complianceForm, stickerMonth: event.target.value.toUpperCase() })}
                  />
                </label>
                <label>
                  <span>Tab Year</span>
                  <input
                    inputMode="numeric"
                    value={complianceForm.stickerYear}
                    onChange={(event) => setComplianceForm({ ...complianceForm, stickerYear: event.target.value.replace(/\D/g, '') })}
                  />
                </label>
                <label>
                  <span>Serial / Control #</span>
                  <input
                    value={complianceForm.serialNumber}
                    onChange={(event) => setComplianceForm({ ...complianceForm, serialNumber: event.target.value.toUpperCase() })}
                  />
                </label>
                <label>
                  <span>Effective</span>
                  <input
                    type="date"
                    value={complianceForm.effectiveDate}
                    onChange={(event) => setComplianceForm({ ...complianceForm, effectiveDate: event.target.value })}
                  />
                </label>
                <label>
                  <span>Expiration</span>
                  <input
                    type="date"
                    value={complianceForm.expirationDate}
                    onChange={(event) => setComplianceForm({ ...complianceForm, expirationDate: event.target.value })}
                  />
                </label>
                <label className="wide">
                  <span>Notes</span>
                  <textarea
                    value={complianceForm.notes}
                    onChange={(event) => setComplianceForm({ ...complianceForm, notes: event.target.value })}
                  />
                </label>
                <button type="submit" disabled={loading}>Save Compliance</button>
                <button className="secondary-button" type="button" onClick={() => setEditingComplianceId('')}>
                  Cancel
                </button>
              </form>
            )}
          </div>

          {showTirePressurePanel && (
            <div className="panel tire-pressure-panel">
            <div className="section-heading">
              <h2>Tire Pressure</h2>
                <p>{tirePressure.spec ? `FL ${tirePressure.spec.frontLeftPsi ?? '?'} / FR ${tirePressure.spec.frontRightPsi ?? '?'} / RL ${tirePressure.spec.rearLeftPsi ?? '?'} / RR ${tirePressure.spec.rearRightPsi ?? '?'} PSI` : 'No factory spec saved'}</p>
              </div>
              {workingIndicator}

              <input
                ref={tireSpecCameraInputRef}
                className="hidden-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) readTireSpecPhoto(file)
                }}
              />
              <input
                ref={tireLogCameraInputRef}
                className="hidden-input"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  if (file) readTireLogPhoto(file)
                }}
              />

              <div className="tire-grid">
                <form className="tire-card" onSubmit={saveTireSpec}>
                  <div className="section-heading compact-heading">
                    <h2>Factory Spec</h2>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setShowTirePressurePanel(true)
                        localStorage.setItem(tirePanelStorageKey, 'true')
                        localStorage.setItem(tireSpecScanPendingStorageKey, 'true')
                        tireSpecCameraInputRef.current?.click()
                      }}
                    >
                      Scan Plate
                    </button>
                  </div>
                  <label>
                    <span>Front Left</span>
                    <input
                      inputMode="numeric"
                      value={tireSpecForm.frontLeftPsi}
                      onChange={(event) => setTireSpecForm({ ...tireSpecForm, frontLeftPsi: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>Front Right</span>
                    <input
                      inputMode="numeric"
                      value={tireSpecForm.frontRightPsi}
                      onChange={(event) => setTireSpecForm({ ...tireSpecForm, frontRightPsi: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>Rear Left</span>
                    <input
                      inputMode="numeric"
                      value={tireSpecForm.rearLeftPsi}
                      onChange={(event) => setTireSpecForm({ ...tireSpecForm, rearLeftPsi: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>Rear Right</span>
                    <input
                      inputMode="numeric"
                      value={tireSpecForm.rearRightPsi}
                      onChange={(event) => setTireSpecForm({ ...tireSpecForm, rearRightPsi: event.target.value })}
                    />
                  </label>
                  <label className="wide">
                    <span>Notes</span>
                    <textarea value={tireSpecForm.notes} onChange={(event) => setTireSpecForm({ ...tireSpecForm, notes: event.target.value })} />
                  </label>
                  <button type="submit" disabled={loading}>Save Spec</button>
                </form>

                <form className="tire-card" onSubmit={saveTireLog}>
                  <div className="section-heading compact-heading">
                    <h2>Actual Readings</h2>
                    <button className="secondary-button" type="button" disabled={loading} onClick={() => tireLogCameraInputRef.current?.click()}>
                      Scan Readings
                    </button>
                  </div>
                  <label>
                    <span>Front Left</span>
                    <input inputMode="numeric" value={tireLogForm.frontLeftPsi} onChange={(event) => setTireLogForm({ ...tireLogForm, frontLeftPsi: event.target.value })} />
                  </label>
                  <label>
                    <span>Front Right</span>
                    <input inputMode="numeric" value={tireLogForm.frontRightPsi} onChange={(event) => setTireLogForm({ ...tireLogForm, frontRightPsi: event.target.value })} />
                  </label>
                  <label>
                    <span>Rear Left</span>
                    <input inputMode="numeric" value={tireLogForm.rearLeftPsi} onChange={(event) => setTireLogForm({ ...tireLogForm, rearLeftPsi: event.target.value })} />
                  </label>
                  <label>
                    <span>Rear Right</span>
                    <input inputMode="numeric" value={tireLogForm.rearRightPsi} onChange={(event) => setTireLogForm({ ...tireLogForm, rearRightPsi: event.target.value })} />
                  </label>
                  <label className="wide">
                    <span>Notes</span>
                    <textarea value={tireLogForm.notes} onChange={(event) => setTireLogForm({ ...tireLogForm, notes: event.target.value })} />
                  </label>
                  <button type="submit" disabled={loading}>Save Pressure Log</button>
                </form>
              </div>

              {tirePressureInsight && (
                <div className="wide">
                  <p className="context">Last tire scan readout</p>
                  <pre className="receipt-insight">{tirePressureInsight}</pre>
                </div>
              )}

              <div className="record-list tire-log-list">
                {tirePressure.recentLogs.length === 0 && <p className="empty">No tire pressure logs yet.</p>}
                {tirePressure.recentLogs.map((log) => (
                  <article key={log.id} className={`record tire-log status-${log.status.toLowerCase()}`}>
                    <strong>{log.status}</strong>
                    <span>{new Date(log.measuredAt).toLocaleString()}</span>
                    <p>
                      FL {log.frontLeftPsi ?? '?'} / FR {log.frontRightPsi ?? '?'} / RL {log.rearLeftPsi ?? '?'} / RR {log.rearRightPsi ?? '?'} PSI
                    </p>
                  </article>
                ))}
              </div>
            </div>
          )}

          {showMaintenanceForm && (
          <div className="panel">
            <div className="section-heading">
              <h2>Log Maintenance</h2>
              <button className="secondary-button" type="button" onClick={() => setShowMaintenanceForm(false)}>
                Cancel
              </button>
            </div>
            <form className="maintenance-form" onSubmit={logMaintenance}>
              <div className="quick-actions wide">
                <button className="type-picker-button" type="button" onClick={() => setShowMaintenanceTypes(!showMaintenanceTypes)}>
                  Maintenance Type
                </button>
                <button
                  className={maintenanceForm.eventType === 'Oil Change' ? 'action-chip selected' : 'action-chip'}
                  type="button"
                  onClick={() => setMaintenanceForm({ ...maintenanceForm, eventType: 'Oil Change' })}
                >
                  Oil Change
                </button>
                <button
                  className={maintenanceForm.eventType === 'Car Wash' ? 'action-chip selected' : 'action-chip'}
                  type="button"
                  onClick={() => setMaintenanceForm({ ...maintenanceForm, eventType: 'Car Wash' })}
                >
                  Car Wash
                </button>
                <button
                  className={maintenanceForm.eventType === 'Mechanical Repair' ? 'action-chip selected' : 'action-chip'}
                  type="button"
                  onClick={() => setMaintenanceForm({ ...maintenanceForm, eventType: 'Mechanical Repair' })}
                >
                  Repair
                </button>
              </div>
              {showMaintenanceTypes && (
                <div className="type-picker wide">
                  {maintenanceTypes.map((type) => (
                    <button
                      key={type}
                      className={maintenanceForm.eventType === type ? 'type-option selected' : 'type-option'}
                      type="button"
                      onClick={() => {
                        setMaintenanceForm({ ...maintenanceForm, eventType: type })
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
              <div className="receipt-panel wide">
                <label>
                  <span>Receipt / Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
                  />
                </label>
                <button type="button" className="secondary-button" disabled={!receiptFile || loading} onClick={readReceipt}>
                  Read Receipt
                </button>
                {receiptInsight && <pre className="receipt-insight">{receiptInsight}</pre>}
              </div>
              <button type="submit" disabled={loading}>
                Save Maintenance
              </button>
            </form>
          </div>
          )}

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
        </>
      )}
    </main>
  )
}

export default App
