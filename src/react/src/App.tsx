import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { WorkflowDashboard } from './components/WorkflowDashboard'
import { GuidedCameraModal } from './components/GuidedCameraModal'
import { VehicleEditPanel } from './components/VehicleEditPanel'
import { TuroImportPanel } from './components/TuroImportPanel'
import { PendingApprovalsPanel } from './components/PendingApprovalsPanel'
import { JobsPanel } from './components/JobsPanel'
import { LedgerPanel } from './components/LedgerPanel'
import { MaintenanceTemplateManager } from './components/MaintenanceTemplateManager'
import { FleetMaintenancePanel } from './components/FleetMaintenancePanel'
import { DocumentLibraryPanel } from './components/DocumentLibraryPanel'
import { MaintenanceForm } from './components/MaintenanceForm'
import { TirePressurePanel } from './components/TirePressurePanel'
import type {
  AppArea, GuidedCaptureConfig, Obd2ReportUploadResponse,
  WorkflowInstance, WorkflowStep,
  Vehicle, MaintenanceRecord, DocumentRecord, LockBox,
  AIResponse, VinScanResponse, VinLatestScanResponse,
  ComplianceRecord, PhotoScanJob, Dashboard,
  TirePressureSpec, TirePressureSnapshot, TirePressureSpecScanResponse,
  RentalInspection, TuroTripImportResponse, TuroMaintenanceSignal,
  TuroImportRecord, TuroTripRecord, WorkflowEvent, DiagnosticReport, ServiceSchedule,
  InspectionReport, TireFleetAlert,
  VinDecode, CreateVehicleForm, EditVehicleForm, NotifLogEntry,
} from './types'
import { api } from './api'
import { useAuth } from './AuthContext'
import {
  tryApplyReceiptDetails, extractVin, extractPressure, firstPressures,
  wait, formatComplianceType, complianceClass,
  complianceChecks,
} from './utils'
import { lockBoxStyles, lockBoxStatuses, complianceTypes, rentalInspectionPhotoSlots } from './constants'

// ─── local constants kept in App for nav/catalog references ──────────────────

const baseAreas: { id: AppArea; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'lockboxes', label: 'Lock Boxes' },
  { id: 'settings', label: 'Settings' },
]

const workflowCatalog = [
  ['AddVehicle', 'Add Vehicle', 'VIN, plate, registration, insurance, lock box'],
  ['RentalInspection', 'Rental Inspection', 'Pre, post, or both: photos, mileage, fuel, tires, damage'],
  ['MaintenanceIntake', 'Maintenance Intake', 'Receipt, service type, due dates, tire pressure'],
  ['TechnicalCheck', 'Technical Check', 'Under hood, fluids, battery, OBD2 report, road check'],
  ['DamageReview', 'Damage Review', 'Photos, notes, repair status, documents'],
  ['ComplianceRenewal', 'Compliance Renewal', 'Registration, insurance, plate verification'],
] as const

const areaTitles: Record<AppArea, string> = {
  home: 'Today',
  inventory: 'Inventory',
  workflows: 'Workflows',
  jobs: 'Jobs',
  ledger: 'Ledger',
  maintenance: 'Maintenance',
  compliance: 'Compliance',
  lockboxes: 'Lock Boxes',
  users: 'Users',
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

const activeAreaStorageKey = 'kwestkarz.activeArea'
const selectedWorkflowStorageKey = 'kwestkarz.selectedWorkflowId'
const selectedWorkflowStepStorageKey = 'kwestkarz.selectedWorkflowStepKey'
const selectedVehicleStorageKey = 'kwestkarz.selectedVehicleId'
const tirePanelStorageKey = 'kwestkarz.showTirePressurePanel'
const tireSpecScanPendingStorageKey = 'kwestkarz.tireSpecScanPending'
const vinScanClientStorageKey = 'kwestkarz.vinScanClientId'
const vinScanPendingStorageKey = 'kwestkarz.vinScanPending'
const vinScanStartedStorageKey = 'kwestkarz.vinScanStartedAt'
const vinScanTargetStorageKey = 'kwestkarz.vinScanTarget'
const complianceScanPendingStorageKey = 'kwestkarz.complianceScanPending'
const complianceScanTypeStorageKey = 'kwestkarz.complianceScanType'
const complianceScanVehicleStorageKey = 'kwestkarz.complianceScanVehicleId'
const complianceScanStartedStorageKey = 'kwestkarz.complianceScanStartedAt'
const complianceScanJobStorageKey = 'kwestkarz.complianceScanJobId'


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

function getStoredActiveArea(): AppArea {
  const stored = localStorage.getItem(activeAreaStorageKey)
  const allAreaIds: AppArea[] = [...baseAreas.map(a => a.id), 'users']
  return allAreaIds.includes(stored as AppArea) ? (stored as AppArea) : 'home'
}

function App() {
  const { profile, signOut } = useAuth()
  const [activeArea, setActiveArea] = useState<AppArea>(getStoredActiveArea)
  const [workflows, setWorkflows] = useState<WorkflowInstance[]>([])
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('')
  const [selectedWorkflowStepKey, setSelectedWorkflowStepKey] = useState('')
  const [rentalInspectionKind, setRentalInspectionKind] = useState('Pre')
  const [workflowStepNotes, setWorkflowStepNotes] = useState('')
  const [obd2ReportFile, setObd2ReportFile] = useState<File | null>(null)
  const [obd2ReportInsight, setObd2ReportInsight] = useState('')
  const [workflowReceiptFile, setWorkflowReceiptFile] = useState<File | null>(null)
  const [workflowReceiptInsight, setWorkflowReceiptInsight] = useState('')
  const [workflowReceiptDocumentId, setWorkflowReceiptDocumentId] = useState<string | null>(null)
  const [damageEstimateAmount, setDamageEstimateAmount] = useState('')
  const [damageEstimateVendor, setDamageEstimateVendor] = useState('')
  const [damageRepairStatus, setDamageRepairStatus] = useState('Pending')
  const [workflowEvents, setWorkflowEvents] = useState<WorkflowEvent[]>([])
  const vinCameraInputRef = useRef<HTMLInputElement | null>(null)
  const workflowVinCameraInputRef = useRef<HTMLInputElement | null>(null)
  const workflowEditorRef = useRef<HTMLDivElement | null>(null)
  const complianceCameraInputRef = useRef<HTMLInputElement | null>(null)
  const complianceFormRef = useRef<HTMLFormElement | null>(null)
  const tireSpecCameraInputRef = useRef<HTMLInputElement | null>(null)
  const tireLogCameraInputRef = useRef<HTMLInputElement | null>(null)
  const guidedVideoRef = useRef<HTMLVideoElement | null>(null)
  const guidedCanvasRef = useRef<HTMLCanvasElement | null>(null)
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
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptInsight, setReceiptInsight] = useState('')
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false)
  const [showEditVehicle, setShowEditVehicle] = useState(false)
  const [editVehicleForm, setEditVehicleForm] = useState<EditVehicleForm>({
    color: '',
    licensePlate: '',
    licensePlateState: '',
    status: 'Active',
    currentOdometer: '',
    fleetPositionNumber: '',
    notes: '',
  })
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
  const [rentalInspection, setRentalInspection] = useState<RentalInspection | null>(null)
  const [rentalInspectionForm, setRentalInspectionForm] = useState({
    inspectionKind: 'Pre',
    odometer: '',
    fuelLevel: '',
    damageFound: '',
    notes: '',
  })
  const [rentalInspectionPhotoFiles, setRentalInspectionPhotoFiles] = useState<Record<string, File | null>>({})
  const [turoImportFile, setTuroImportFile] = useState<File | null>(null)
  const [turoImportResult, setTuroImportResult] = useState<TuroTripImportResponse | null>(null)
  const [turoMaintenanceSignals, setTuroMaintenanceSignals] = useState<TuroMaintenanceSignal[]>([])
  const [turoImportHistory, setTuroImportHistory] = useState<TuroImportRecord[]>([])
  const [notifyByEmail, setNotifyByEmail] = useState(false)
  const [notifyEmail, setNotifyEmail] = useState('')
  const [notifSaving, setNotifSaving] = useState(false)
  const [notifLog, setNotifLog] = useState<NotifLogEntry[]>([])
  const [vehicleTuroTrips, setVehicleTuroTrips] = useState<TuroTripRecord[]>([])
  const [showTuroTrips, setShowTuroTrips] = useState(false)
  const [diagnosticReports, setDiagnosticReports] = useState<DiagnosticReport[]>([])
  const [obd2UploadFile, setObd2UploadFile] = useState<File | null>(null)
  const [serviceSchedules, setServiceSchedules] = useState<ServiceSchedule[]>([])
  const [inspectionReport, setInspectionReport] = useState<InspectionReport | null>(null)
  const [tireAlerts, setTireAlerts] = useState<TireFleetAlert[]>([])
  const [operatorName, setOperatorName] = useState(() => localStorage.getItem('operatorName') ?? '')
  const [displayNameSaving, setDisplayNameSaving] = useState(false)
  const [message, setMessage] = useState('Ready')
  const [workingMessage, setWorkingMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [guidedCapture, setGuidedCapture] = useState<GuidedCaptureConfig | null>(null)
  const [guidedStream, setGuidedStream] = useState<MediaStream | null>(null)
  const [guidedPhotoUrl, setGuidedPhotoUrl] = useState('')
  const [guidedCameraError, setGuidedCameraError] = useState('')
  const [guidedCameraStarting, setGuidedCameraStarting] = useState(false)

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
  const selectedWorkflowStepIndex = selectedWorkflow && selectedWorkflowStep
    ? selectedWorkflow.steps.findIndex((step) => step.stepKey === selectedWorkflowStep.stepKey)
    : -1
  const activeWorkflows = workflows.filter((workflow) => workflow.status !== 'Complete' && workflow.status !== 'Canceled')
  const completedWorkflows = workflows.filter((workflow) => workflow.status === 'Complete')
  const selectedWorkflowStepDocumentId =
    typeof selectedWorkflowStep?.data?.documentId === 'string' ? selectedWorkflowStep.data.documentId : ''
  const selectedWorkflowStepAiText =
    typeof selectedWorkflowStep?.data?.aiText === 'string' ? selectedWorkflowStep.data.aiText : ''
  const isAddVehicleVinStep = selectedWorkflow?.workflowType === 'AddVehicle' && selectedWorkflowStep?.stepKey === 'vin'

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
    api.get<ServiceSchedule[]>('/api/maintenance/templates').then(setServiceSchedules).catch(() => {})
    api.get<TireFleetAlert[]>('/api/fleet/tire-alerts').then(setTireAlerts).catch(() => {})

    if (localStorage.getItem(vinScanPendingStorageKey) === 'true') {
      const startedAt = Date.parse(localStorage.getItem(vinScanStartedStorageKey) || '')
      // Stale if no valid timestamp OR started more than 2 minutes ago
      const isStale = !Number.isFinite(startedAt) || Date.now() - startedAt > 2 * 60 * 1000
      if (isStale) {
        localStorage.removeItem(vinScanPendingStorageKey)
        localStorage.removeItem(vinScanStartedStorageKey)
        localStorage.removeItem(vinScanTargetStorageKey)
      } else {
        recoverLatestVinScan(true, false, 3)
      }
    }

    if (localStorage.getItem(complianceScanPendingStorageKey) === 'true') {
      recoverLatestComplianceScan()
    }
    // Initial app restore should run once; recovery functions read current localStorage state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') {
        refreshWorkflows()
      }
    }

    document.addEventListener('visibilitychange', refreshOnReturn)
    window.addEventListener('focus', refreshWorkflows)

    return () => {
      document.removeEventListener('visibilitychange', refreshOnReturn)
      window.removeEventListener('focus', refreshWorkflows)
    }
    // Workflow refresh is intentionally event-driven; selectedWorkflowId keeps latest selection fallback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkflowId])

  useEffect(() => {
    localStorage.setItem(activeAreaStorageKey, activeArea)
  }, [activeArea])

  useEffect(() => {
    if (activeArea === 'settings') {
      loadTuroMaintenanceSignals()
      loadTuroImportHistory()
      loadNotifPrefs()
    }
    if (activeArea === 'users') {
      loadNotifLog()
    }
  }, [activeArea])

  useEffect(() => {
    if (selectedWorkflowId) localStorage.setItem(selectedWorkflowStorageKey, selectedWorkflowId)
    else localStorage.removeItem(selectedWorkflowStorageKey)
  }, [selectedWorkflowId])

  useEffect(() => {
    if (selectedWorkflowStepKey) localStorage.setItem(selectedWorkflowStepStorageKey, selectedWorkflowStepKey)
    else localStorage.removeItem(selectedWorkflowStepStorageKey)
  }, [selectedWorkflowStepKey])

  useEffect(() => {
    if (activeArea === 'workflows' && selectedWorkflowStep) {
      window.setTimeout(() => {
        workflowEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 0)
    }
  }, [activeArea, selectedWorkflowStep])

  useEffect(() => {
    if (selectedWorkflow?.workflowType !== 'RentalInspection') {
      return
    }

    loadRentalInspection(selectedWorkflow).catch((error) => {
      setMessage(error instanceof Error ? error.message : 'Could not load rental inspection')
    })
    // Rental inspection is loaded when a rental workflow becomes active; saves refresh it explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkflow?.id])

  useEffect(() => {
    if (isAddVehicleVinStep && !vin.trim() && localStorage.getItem(vinScanPendingStorageKey) === 'true') {
      recoverLatestVinScan(true)
    }
    // Recovery polling is guarded internally and should only respond to step/VIN changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddVehicleVinStep, vin])

  useEffect(() => {
    if (guidedVideoRef.current && guidedStream) {
      guidedVideoRef.current.srcObject = guidedStream
      guidedVideoRef.current.muted = true
      guidedVideoRef.current.playsInline = true
      guidedVideoRef.current.play().catch(() => undefined)
    }
  }, [guidedStream, guidedCapture])

  useEffect(() => {
    return () => {
      guidedStream?.getTracks().forEach((track) => track.stop())
      if (guidedPhotoUrl) URL.revokeObjectURL(guidedPhotoUrl)
    }
  }, [guidedStream, guidedPhotoUrl])

  useEffect(() => {
    function refreshAfterCameraReturn() {
      const vehicleId = localStorage.getItem(selectedVehicleStorageKey)

      if (localStorage.getItem(vinScanPendingStorageKey) === 'true') {
        recoverLatestVinScan(true)
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
    // Camera-return recovery is registered once and reads pending scan state from localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const nextWorkflows = await api.get<WorkflowInstance[]>('/api/workflows?includeCompleted=true')
      setWorkflows(nextWorkflows)
      const savedWorkflowId = localStorage.getItem(selectedWorkflowStorageKey)
      const savedStepKey = localStorage.getItem(selectedWorkflowStepStorageKey)
      const nextActiveWorkflows = nextWorkflows.filter((workflow) => workflow.status !== 'Complete' && workflow.status !== 'Canceled')
      const workflowToSelect =
        nextWorkflows.find((workflow) => workflow.id === savedWorkflowId) ??
        nextWorkflows.find((workflow) => workflow.id === selectedWorkflowId) ??
        nextActiveWorkflows[0]

      if (workflowToSelect) {
        const stepKey =
          workflowToSelect.steps.some((step) => step.stepKey === savedStepKey)
            ? savedStepKey!
            : workflowToSelect.currentStepKey
        setSelectedWorkflowId(workflowToSelect.id)
        setSelectedWorkflowStepKey(stepKey)
      }
      return nextWorkflows
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load workflows')
      return workflows
    }
  }

  async function loadDashboard(vehicleId: string) {
    const nextDashboard = await api.get<Dashboard>(`/api/vehicles/${vehicleId}/dashboard`)
    setDashboard(nextDashboard)
    setSelectedLockBoxId('')
    setShowTuroTrips(false)
    setVehicleTuroTrips([])
    await loadTirePressure(vehicleId)
    await loadDiagnosticReports(vehicleId)
  }

  function applyRentalInspectionForm(inspection: RentalInspection) {
    setRentalInspection(inspection)
    setRentalInspectionForm({
      inspectionKind: inspection.inspectionKind,
      odometer: inspection.odometer?.toString() ?? '',
      fuelLevel: inspection.fuelLevel ?? '',
      damageFound: inspection.damageFound === undefined ? '' : inspection.damageFound ? 'true' : 'false',
      notes: inspection.notes ?? '',
    })
  }

  async function loadRentalInspection(workflow = selectedWorkflow) {
    if (!workflow || workflow.workflowType !== 'RentalInspection') return null

    const inspection = await api.get<RentalInspection>(`/api/workflows/${workflow.id}/rental-inspection`)
    applyRentalInspectionForm(inspection)
    return inspection
  }

  async function loadInspectionReport(workflowId: string) {
    try {
      const report = await api.get<InspectionReport>(`/api/workflows/${workflowId}/rental-inspection/report`)
      setInspectionReport(report)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load inspection report')
    }
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
    localStorage.removeItem(complianceScanJobStorageKey)
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
    localStorage.removeItem(vinScanTargetStorageKey)
  }

  function openVinCamera() {
    localStorage.setItem(vinScanTargetStorageKey, 'inventory')
    openGuidedCamera({
      mode: 'vin',
      title: 'Scan VIN',
      instructions: 'Align the VIN inside the narrow frame. Use the dashboard plate or door jamb label.',
      overlay: 'vin',
    })
  }

  function openWorkflowVinCamera() {
    localStorage.setItem(vinScanTargetStorageKey, 'addVehicleWorkflow')
    openGuidedCamera({
      mode: 'workflowVin',
      title: 'Scan VIN',
      instructions: 'Align the VIN inside the narrow frame. This will continue the Add Vehicle workflow.',
      overlay: 'vin',
    })
  }

  function openComplianceCamera(recordType: string) {
    setComplianceScanType(recordType)
    openGuidedCamera({
      mode: 'compliance',
      recordType,
      title: `Scan ${formatComplianceType(recordType)}`,
      instructions: 'Align the document inside the frame. Use steady light and avoid glare.',
      overlay: 'document',
    })
  }

  function openNativeCapture(config: GuidedCaptureConfig) {
    if (config.mode === 'workflowVin' && workflowVinCameraInputRef.current) {
      workflowVinCameraInputRef.current.value = ''
      workflowVinCameraInputRef.current.click()
      closeGuidedCamera()
      return
    }

    if (config.mode === 'compliance' && complianceCameraInputRef.current) {
      complianceCameraInputRef.current.value = ''
      complianceCameraInputRef.current.click()
      closeGuidedCamera()
      return
    }

    if (vinCameraInputRef.current) {
      vinCameraInputRef.current.value = ''
      vinCameraInputRef.current.click()
      closeGuidedCamera()
    }
  }

  function stopGuidedCamera() {
    guidedStream?.getTracks().forEach((track) => track.stop())
    setGuidedStream(null)
  }

  function closeGuidedCamera() {
    stopGuidedCamera()
    if (guidedPhotoUrl) URL.revokeObjectURL(guidedPhotoUrl)
    setGuidedPhotoUrl('')
    setGuidedCameraError('')
    setGuidedCameraStarting(false)
    setGuidedCapture(null)
  }

  function cancelGuidedCamera() {
    if (guidedCapture?.mode === 'compliance') {
      clearComplianceScanPending()
    } else if (guidedCapture?.mode === 'vin' || guidedCapture?.mode === 'workflowVin') {
      clearVinScanPending()
    }

    setWorkingMessage('')
    setLoading(false)
    setMessage('Scan canceled')
    closeGuidedCamera()
  }

  async function openGuidedCamera(config: GuidedCaptureConfig) {
    if (guidedPhotoUrl) URL.revokeObjectURL(guidedPhotoUrl)
    setGuidedCapture(config)
    setGuidedPhotoUrl('')
    setGuidedCameraError('')
    setGuidedCameraStarting(true)
    stopGuidedCamera()

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera API is unavailable.')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })

      setGuidedStream(stream)
      setGuidedCameraStarting(false)
      window.setTimeout(() => {
        if (guidedVideoRef.current) {
          guidedVideoRef.current.srcObject = stream
          guidedVideoRef.current.muted = true
          guidedVideoRef.current.playsInline = true
          guidedVideoRef.current.play().catch(() => undefined)
        }
      }, 0)
    } catch {
      setGuidedCameraStarting(false)
      setGuidedCameraError('In-app camera is blocked on this browser or connection. Use the phone camera picker fallback.')
    }
  }

  async function retakeGuidedPhoto() {
    if (!guidedCapture) return
    const config = guidedCapture
    if (guidedPhotoUrl) URL.revokeObjectURL(guidedPhotoUrl)
    setGuidedPhotoUrl('')
    await openGuidedCamera(config)
  }

  function captureGuidedPhoto() {
    const video = guidedVideoRef.current
    const canvas = guidedCanvasRef.current
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      setGuidedCameraError('Camera preview is not ready yet. If the frame stays blank, use the phone camera fallback.')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setGuidedCameraError('Could not capture photo.')
          return
        }

        stopGuidedCamera()
        if (guidedPhotoUrl) URL.revokeObjectURL(guidedPhotoUrl)
        setGuidedPhotoUrl(URL.createObjectURL(blob))
      },
      'image/jpeg',
      0.92,
    )
  }

  async function useGuidedPhoto() {
    const canvas = guidedCanvasRef.current
    const config = guidedCapture
    if (!canvas || !config) return

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setGuidedCameraError('Could not prepare captured photo.')
          return
        }

        const file = new File([blob], `${config.mode}-${Date.now()}.jpg`, { type: 'image/jpeg' })
        closeGuidedCamera()

        if (config.mode === 'compliance') {
          scanCompliancePhoto(file)
        } else {
          scanVinFromPhoto(file)
        }
      },
      'image/jpeg',
      0.92,
    )
  }

  async function recoverLatestComplianceScan() {
    if (complianceRecoveryActiveRef.current) return
    complianceRecoveryActiveRef.current = true

    const recordType = localStorage.getItem(complianceScanTypeStorageKey) || 'Compliance'
    const vehicleId = localStorage.getItem(complianceScanVehicleStorageKey) || localStorage.getItem(selectedVehicleStorageKey)
    const jobId = localStorage.getItem(complianceScanJobStorageKey)

    if (!vehicleId) {
      clearComplianceScanPending()
      complianceRecoveryActiveRef.current = false
      return
    }

    if (!jobId) {
      clearComplianceScanPending()
      setWorkingMessage('')
      complianceRecoveryActiveRef.current = false
      return
    }

    try {
      localStorage.setItem(selectedVehicleStorageKey, vehicleId)
      await pollComplianceScanJob(vehicleId, jobId, recordType)
    } finally {
      complianceRecoveryActiveRef.current = false
    }
  }

  async function pollComplianceScanJob(vehicleId: string, jobId: string, fallbackRecordType: string) {
    localStorage.setItem(complianceScanPendingStorageKey, 'true')
    localStorage.setItem(complianceScanVehicleStorageKey, vehicleId)
    localStorage.setItem(complianceScanJobStorageKey, jobId)

    for (let attempt = 0; attempt < 90; attempt += 1) {
      const job = await api.get<PhotoScanJob>(`/api/vehicles/${vehicleId}/compliance/photo-jobs/${jobId}`)
      const recordType = job.recordType ?? fallbackRecordType
      const waitMessage = job.message || `Reading ${formatComplianceType(recordType)} photo...`
      setMessage(waitMessage)
      setWorkingMessage(waitMessage)

      if (job.status === 'Succeeded') {
        clearComplianceScanPending()
        localStorage.setItem(selectedVehicleStorageKey, vehicleId)
        const nextDashboard = await api.get<Dashboard>(`/api/vehicles/${vehicleId}/dashboard`)
        setDashboard(nextDashboard)
        const record =
          nextDashboard.compliance.find((item) => item.id === job.resultRecordId) ??
          nextDashboard.compliance.find((item) => item.recordType === recordType)

        if (job.scanType === 'ComplianceRecheck') {
          setWorkingMessage('')
          setMessage('Saved compliance images rechecked. Review the updated cards.')
        } else if (record) {
          startEditingCompliance(record)
          await completeMatchingWorkflowStep(record.recordType, {
            vehicleId,
            complianceRecordId: record.id,
            documentId: record.documentId ?? null,
          })
          setWorkingMessage('')
          setMessage(`${formatComplianceType(record.recordType)} read. Review and save corrections if needed.`)
        } else {
          setWorkingMessage('')
          setMessage(`${formatComplianceType(recordType)} scan finished, but the record was not found. Refresh the vehicle.`)
        }
        return
      }

      if (job.status === 'Failed') {
        clearComplianceScanPending()
        setWorkingMessage('')
        setMessage(job.error || `${formatComplianceType(recordType)} scan failed. Try again with a clearer photo.`)
        return
      }

      await wait(2000)
    }

    setWorkingMessage('')
    setMessage(`${formatComplianceType(fallbackRecordType)} scan is still running. Leave this page open or refresh to continue waiting.`)
  }

  async function recheckComplianceImages() {
    const vehicleId = dashboard?.vehicle.id ?? localStorage.getItem(selectedVehicleStorageKey)
    if (!vehicleId) return

    setLoading(true)
    setMessage('Queuing saved image recheck...')
    setWorkingMessage('Queuing saved image recheck...')

    try {
      const response = await fetch(`/api/vehicles/${vehicleId}/compliance/photo-jobs/recheck`, {
        method: 'POST',
      })

      if (!response.ok) throw new Error(await response.text())

      const job = (await response.json()) as PhotoScanJob
      localStorage.setItem(complianceScanJobStorageKey, job.id)
      await pollComplianceScanJob(vehicleId, job.id, 'All')
    } catch (error) {
      clearComplianceScanPending()
      setWorkingMessage('')
      setMessage(error instanceof Error ? error.message : 'Could not recheck saved images')
    } finally {
      setLoading(false)
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

      const response = await fetch(`/api/vehicles/${vehicleId}/compliance/photo-jobs`, {
        method: 'POST',
        body: form,
      })

      if (!response.ok) throw new Error(await response.text())

      const job = (await response.json()) as PhotoScanJob
      localStorage.setItem(complianceScanJobStorageKey, job.id)
      await pollComplianceScanJob(vehicleId, job.id, recordType)
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
    const complianceVin = complianceForm.vin.trim().toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '')

    if (complianceVin && complianceVin.length !== 17) {
      setMessage(`VIN must be 17 characters. Use vehicle VIN ${dashboard.vehicle.vin} if this document belongs to this car.`)
      return
    }

    setLoading(true)
    setMessage('Saving compliance details...')

    try {
      const savedRecord = await api.put<ComplianceRecord>(`/api/vehicles/${dashboard.vehicle.id}/compliance/${editingComplianceId}`, {
        provider: complianceForm.provider || null,
        policyNumber: complianceForm.policyNumber || null,
        documentNumber: complianceForm.documentNumber || null,
        plateNumber: complianceForm.plateNumber || null,
        plateState: complianceForm.plateState || null,
        vin: complianceVin || null,
        stickerMonth: complianceForm.stickerMonth || null,
        stickerYear: complianceForm.stickerYear ? Number(complianceForm.stickerYear) : null,
        serialNumber: complianceForm.serialNumber || null,
        effectiveDate: complianceForm.effectiveDate || null,
        expirationDate: complianceForm.expirationDate || null,
        notes: complianceForm.notes || null,
      })
      setEditingComplianceId('')
      await loadDashboard(dashboard.vehicle.id)
      await completeMatchingWorkflowStep(savedRecord.recordType, {
        vehicleId: dashboard.vehicle.id,
        complianceRecordId: savedRecord.id,
        documentId: savedRecord.documentId ?? null,
      })
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
    setShowEditVehicle(false)
    setShowTirePressurePanel(false)
    setShowLockBoxManager(false)
    setEditingLockBoxId('')
    setEditingComplianceId('')
    localStorage.removeItem(selectedVehicleStorageKey)
    localStorage.removeItem(tirePanelStorageKey)
    setMessage('Ready')
  }

  function startEditingVehicle() {
    const v = dashboard?.vehicle
    if (!v) return
    setEditVehicleForm({
      color: v.color ?? '',
      licensePlate: v.licensePlate ?? '',
      licensePlateState: v.licensePlateState ?? '',
      status: v.status,
      currentOdometer: v.currentOdometer?.toString() ?? '',
      fleetPositionNumber: v.fleetPositionNumber ?? '',
      notes: v.notes ?? '',
    })
    setShowEditVehicle(true)
  }

  async function saveVehicle(event: FormEvent) {
    event.preventDefault()
    if (!dashboard) return

    setLoading(true)
    setMessage('Saving vehicle...')

    try {
      const updated = await api.put<Vehicle>(`/api/vehicles/${dashboard.vehicle.id}`, {
        color: editVehicleForm.color || null,
        licensePlate: editVehicleForm.licensePlate || null,
        licensePlateState: editVehicleForm.licensePlateState || null,
        status: editVehicleForm.status || 'Active',
        currentOdometer: editVehicleForm.currentOdometer ? Number(editVehicleForm.currentOdometer) : null,
        currentOdometerRecordedAt: editVehicleForm.currentOdometer ? new Date().toISOString() : null,
        fleetPositionNumber: editVehicleForm.fleetPositionNumber || null,
        notes: editVehicleForm.notes || null,
      })
      setShowEditVehicle(false)
      await loadDashboard(updated.id)
      await refreshVehicles()
      setMessage('Vehicle saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save vehicle')
    } finally {
      setLoading(false)
    }
  }

  async function lookupVehicle(event?: FormEvent) {
    event?.preventDefault()
    await lookupVehicleByVin(normalizedVin)
  }

  async function resolveAddVehicleVinWorkflow() {
    const savedWorkflowId = localStorage.getItem(selectedWorkflowStorageKey)
    const localWorkflow =
      workflows.find((workflow) => workflow.id === selectedWorkflowId && workflow.workflowType === 'AddVehicle') ??
      workflows.find((workflow) => workflow.id === savedWorkflowId && workflow.workflowType === 'AddVehicle') ??
      workflows.find(
        (workflow) =>
          workflow.workflowType === 'AddVehicle' &&
          workflow.status !== 'Complete' &&
          workflow.status !== 'Canceled' &&
          workflow.steps.some((step) => step.stepKey === 'vin' && step.status !== 'Complete'),
      )

    if (localWorkflow) return localWorkflow

    const nextWorkflows = await api.get<WorkflowInstance[]>('/api/workflows?includeCompleted=false')
    setWorkflows(nextWorkflows)
    return (
      nextWorkflows.find((workflow) => workflow.id === savedWorkflowId && workflow.workflowType === 'AddVehicle') ??
      nextWorkflows.find(
        (workflow) =>
          workflow.workflowType === 'AddVehicle' &&
          workflow.status !== 'Complete' &&
          workflow.status !== 'Canceled' &&
          workflow.steps.some((step) => step.stepKey === 'vin' && step.status !== 'Complete'),
      ) ??
      null
    )
  }

  async function saveAddVehicleWorkflowVin(scannedVin: string) {
    const workflowToUpdate = await resolveAddVehicleVinWorkflow()
    if (!workflowToUpdate) return false

    let workflow = await api.put<WorkflowInstance>(`/api/workflows/${workflowToUpdate.id}/steps/vin`, {
      status: 'Complete',
      makeCurrent: true,
      data: {
        vin: scannedVin,
        notes: workflowStepNotes,
      },
    })
    workflow = await advanceWorkflowFromStep(workflow, 'vin')
    setWorkflows((current) => current.map((item) => (item.id === workflow.id ? workflow : item)))
    setSelectedWorkflowId(workflow.id)
    setSelectedWorkflowStepKey(workflow.currentStepKey)
    return true
  }

  async function applyScannedVin(scannedVin: string) {
    const scanTarget = localStorage.getItem(vinScanTargetStorageKey)
    clearVinScanPending()
    setWorkingMessage('')
    setVin(scannedVin)
    setMessage(`VIN read: ${scannedVin}`)

    try {
      if (scanTarget === 'addVehicleWorkflow' || scanTarget === 'inventory') {
        if (scanTarget === 'addVehicleWorkflow') {
          try {
            await saveAddVehicleWorkflowVin(scannedVin)
          } catch {
            localStorage.removeItem(selectedWorkflowStorageKey)
            localStorage.removeItem(selectedWorkflowStepStorageKey)
            setSelectedWorkflowId('')
            setSelectedWorkflowStepKey('')
          }
        }
        setActiveArea('inventory')
      }
      await lookupVehicleByVin(scannedVin)
    } catch (error) {
      setMessage(error instanceof Error ? `VIN read, but lookup failed: ${error.message}` : 'VIN read, but lookup failed')
    }
  }

  async function readLatestVinScan(clientId: string, allowAnyClient: boolean) {
    const latest = await api.get<VinLatestScanResponse>(`/api/vin/latest-scan/${encodeURIComponent(clientId)}`)
    if (latest.vin || !allowAnyClient) return latest
    return api.get<VinLatestScanResponse>('/api/vin/latest-scan')
  }

  async function recoverLatestVinScan(ignoreStartedAt = false, forceRestart = false, maxAttempts = 45) {
    if (vinRecoveryActiveRef.current && !forceRestart) return
    vinRecoveryActiveRef.current = true
    const clientId = getVinScanClientId()
    const startedAt = Date.parse(localStorage.getItem(vinScanStartedStorageKey) || '')

    try {
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        if (localStorage.getItem(vinScanPendingStorageKey) !== 'true') break
        try {
          if (attempt === 0) {
            setMessage('Waiting for VIN scan result...')
            setWorkingMessage('Waiting for VIN scan result...')
          }
          const latest = await readLatestVinScan(clientId, true)
          const scannedVin = latest.vin?.trim().toUpperCase()
          const loggedAt = Date.parse(latest.loggedAt ?? '')
          const isCurrentAttempt =
            ignoreStartedAt || !Number.isFinite(startedAt) || (Number.isFinite(loggedAt) && loggedAt >= startedAt)

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

  async function recoverVinScanNow() {
    getVinScanClientId()
    localStorage.setItem(vinScanPendingStorageKey, 'true')
    localStorage.setItem(vinScanTargetStorageKey, isAddVehicleVinStep ? 'addVehicleWorkflow' : 'inventory')
    setMessage('Checking last VIN scan...')
    setWorkingMessage('Checking last VIN scan...')
    await recoverLatestVinScan(true, true)
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

      const scanAbort = new AbortController()
      const scanTimeout = setTimeout(() => scanAbort.abort(), 30_000)
      let response: Response
      try {
        response = await fetch('/api/vin/scan-photo', {
          method: 'POST',
          body: form,
          signal: scanAbort.signal,
        })
      } finally {
        clearTimeout(scanTimeout)
      }

      const responseText = await response.text()
      if (!response.ok) throw new Error(responseText)

      const scan = JSON.parse(responseText) as VinScanResponse
      const apiVin = typeof scan.vin === 'string' ? scan.vin : ''
      const aiText = typeof scan.aiText === 'string' ? scan.aiText : ''
      const scannedVin = apiVin.trim().toUpperCase() || extractVin(aiText)

      if (!scannedVin) {
        const scanTarget = localStorage.getItem(vinScanTargetStorageKey)
        clearVinScanPending()
        setWorkingMessage('')
        if (scanTarget === 'addVehicleWorkflow') {
          setActiveArea('workflows')
          window.setTimeout(() => {
            workflowEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }, 0)
        }
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
      if (selectedWorkflow?.workflowType === 'AddVehicle') {
        const stepToComplete =
          selectedWorkflow.steps.find((step) => step.stepKey === 'vehicleBasics' && step.status !== 'Complete') ??
          selectedWorkflow.steps.find((step) => step.stepKey === 'vin' && step.status !== 'Complete')

        if (stepToComplete) {
          let workflow = await api.put<WorkflowInstance>(`/api/workflows/${selectedWorkflow.id}/steps/${stepToComplete.stepKey}`, {
            status: 'Complete',
            makeCurrent: true,
            data: {
              ...(stepToComplete.data ?? {}),
              vehicleId: vehicle.id,
              vin: vehicle.vin,
              notes: workflowStepNotes,
            },
          })
          workflow = await advanceWorkflowFromStep(workflow, stepToComplete.stepKey)
          setWorkflows((current) => current.map((item) => (item.id === workflow.id ? workflow : item)))
          selectWorkflow(workflow)
        }
      }
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
      const record = await api.post<MaintenanceRecord>(`/api/vehicles/${dashboard.vehicle.id}/maintenance`, {
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

        const response = await fetch(
          `/api/vehicles/${dashboard.vehicle.id}/maintenance/${record.id}/receipt`,
          { method: 'POST', body: form },
        )

        if (!response.ok) throw new Error(await response.text())

        const receiptResult = (await response.json()) as { document: DocumentRecord; aiText: string }
        setReceiptInsight(receiptResult.aiText)
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

      await api.post(`/api/vehicles/${dashboard.vehicle.id}/tire-pressure/logs`, {
        measuredAt: new Date().toISOString(),
        frontLeftPsi: tireLogForm.frontLeftPsi ? Number(tireLogForm.frontLeftPsi) : null,
        frontRightPsi: tireLogForm.frontRightPsi ? Number(tireLogForm.frontRightPsi) : null,
        rearLeftPsi: tireLogForm.rearLeftPsi ? Number(tireLogForm.rearLeftPsi) : null,
        rearRightPsi: tireLogForm.rearRightPsi ? Number(tireLogForm.rearRightPsi) : null,
        notes: tireLogForm.notes || null,
        photoDocumentId: document?.id ?? null,
      })
      await loadTirePressure(dashboard.vehicle.id)
      api.get<TireFleetAlert[]>('/api/fleet/tire-alerts').then(setTireAlerts).catch(() => {})
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
    setWorkflowReceiptFile(null)
    setWorkflowReceiptInsight('')
    setWorkflowReceiptDocumentId(null)
    setDamageEstimateAmount(typeof step?.data?.estimateAmount === 'string' ? step.data.estimateAmount : '')
    setDamageEstimateVendor(typeof step?.data?.estimateVendor === 'string' ? step.data.estimateVendor : '')
    setDamageRepairStatus(typeof step?.data?.repairStatus === 'string' ? step.data.repairStatus : 'Pending')
    setWorkflowEvents([])
    setInspectionReport(null)
    loadWorkflowEvents(workflow.id)
    window.setTimeout(() => {
      workflowEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function workflowVehicleId(workflow: WorkflowInstance) {
    const stepVehicleId = workflow.steps
      .map((step) => step.data?.vehicleId)
      .find((value): value is string => typeof value === 'string' && value.length > 0)

    return workflow.vehicleId ?? stepVehicleId ?? dashboard?.vehicle.id ?? localStorage.getItem(selectedVehicleStorageKey) ?? ''
  }

  async function openWorkflowVehicle(workflow: WorkflowInstance) {
    const vehicleId = workflowVehicleId(workflow)
    if (!vehicleId) {
      setActiveArea('inventory')
      setMessage('Choose or create the vehicle for this workflow first.')
      return false
    }

    localStorage.setItem(selectedVehicleStorageKey, vehicleId)
    await loadDashboard(vehicleId)
    return true
  }

  async function activateWorkflowStep(workflow: WorkflowInstance, step: WorkflowStep) {
    setLoading(true)
    setMessage(`Opening ${step.title}...`)

    try {
      const freshWorkflow = await api.get<WorkflowInstance>(`/api/workflows/${workflow.id}`)
      setWorkflows((current) => current.map((item) => (item.id === freshWorkflow.id ? freshWorkflow : item)))
      setSelectedWorkflowId(freshWorkflow.id)
      const freshStep = freshWorkflow.steps.find((item) => item.stepKey === step.stepKey) ?? step
      setSelectedWorkflowStepKey(freshStep.stepKey)
      setWorkflowStepNotes(typeof freshStep.data?.notes === 'string' ? freshStep.data.notes : '')
      setObd2ReportFile(null)
      setObd2ReportInsight(typeof freshStep.data?.aiText === 'string' ? freshStep.data.aiText : '')
      setWorkflowReceiptFile(null)
      setWorkflowReceiptInsight('')
      setDamageEstimateAmount(typeof freshStep.data?.estimateAmount === 'string' ? freshStep.data.estimateAmount : '')
      setDamageEstimateVendor(typeof freshStep.data?.estimateVendor === 'string' ? freshStep.data.estimateVendor : '')
      setDamageRepairStatus(typeof freshStep.data?.repairStatus === 'string' ? freshStep.data.repairStatus : 'Pending')

      if (freshWorkflow.workflowType === 'AddVehicle' && freshStep.stepKey === 'vin') {
        setActiveArea('workflows')
        window.setTimeout(openWorkflowVinCamera, 0)
        setMessage('Scan or enter the VIN.')
        return
      }

      if (['vehicle', 'vehicleBasics', 'licensePlate', 'photos', 'photosOdometer', 'odometerFuel', 'returnState', 'inspectionKind'].includes(freshStep.stepKey)) {
        setActiveArea('inventory')
        await openWorkflowVehicle(freshWorkflow)
        setMessage(`${freshStep.title}: update the vehicle details here.`)
        return
      }

      if (['registration', 'insurance', 'plate'].includes(freshStep.stepKey)) {
        setActiveArea('inventory')
        const hasVehicle = await openWorkflowVehicle(freshWorkflow)
        if (hasVehicle) {
          const recordType = freshStep.stepKey === 'registration' ? 'Registration' : freshStep.stepKey === 'insurance' ? 'Insurance' : 'LicensePlate'
          window.setTimeout(() => openComplianceCamera(recordType), 0)
          setMessage(`Scan or review ${formatComplianceType(recordType)}.`)
        }
        return
      }

      if (freshStep.stepKey === 'lockBox') {
        setActiveArea('inventory')
        await openWorkflowVehicle(freshWorkflow)
        setShowLockBoxManager(true)
        setMessage('Assign or review the lock box for this vehicle.')
        return
      }

      if (['service', 'receipt', 'followUp', 'repair', 'estimate'].includes(freshStep.stepKey)) {
        setActiveArea('inventory')
        await openWorkflowVehicle(freshWorkflow)
        setShowMaintenanceForm(true)
        setMessage(`${freshStep.title}: add or review maintenance details.`)
        return
      }

      if (freshStep.stepKey === 'tires') {
        setActiveArea('inventory')
        await openWorkflowVehicle(freshWorkflow)
        setShowTirePressurePanel(true)
        localStorage.setItem(tirePanelStorageKey, 'true')
        setMessage('Record or review tire pressure.')
        return
      }

      if (freshStep.stepKey === 'obd2Scan') {
        setActiveArea('workflows')
        window.setTimeout(() => {
          workflowEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 0)
        setMessage('Upload or review the OBD2 PDF report.')
        return
      }

      setActiveArea('workflows')
      window.setTimeout(() => {
        workflowEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 0)
      setMessage(`${freshStep.title}: add notes or mark the step when done.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not open workflow step')
    } finally {
      setLoading(false)
    }
  }

  async function startWorkflow(workflowType: string) {
    setLoading(true)
    setMessage('Starting workflow...')
    localStorage.removeItem(selectedWorkflowStorageKey)
    localStorage.removeItem(selectedWorkflowStepStorageKey)
    setSelectedWorkflowId('')
    setSelectedWorkflowStepKey('')

    try {
      const workflow = await api.post<WorkflowInstance>('/api/workflows', {
        workflowType,
        vehicleId: dashboard?.vehicle.id ?? null,
        title: workflowType === 'RentalInspection' ? `Rental Inspection (${rentalInspectionKind})` : null,
        inspectionKind: workflowType === 'RentalInspection' ? rentalInspectionKind : null,
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

  async function advanceWorkflowFromStep(workflow: WorkflowInstance, completedStepKey: string) {
    const completedStep = workflow.steps.find((step) => step.stepKey === completedStepKey)
    const nextStep = workflow.steps.find((step) => step.sortOrder === (completedStep?.sortOrder ?? -1) + 1)

    if (!nextStep) {
      return api.put<WorkflowInstance>(`/api/workflows/${workflow.id}/status`, {
        status: 'Complete',
        currentStepKey: completedStepKey,
      })
    }

    return api.put<WorkflowInstance>(`/api/workflows/${workflow.id}/steps/${nextStep.stepKey}`, {
      status: nextStep.status === 'Complete' ? nextStep.status : 'InProgress',
      makeCurrent: true,
      data: nextStep.data ?? {},
    })
  }

  function complianceStepMatches(stepKey: string, recordType: string) {
    return (
      (recordType === 'Registration' && stepKey === 'registration') ||
      (recordType === 'Insurance' && stepKey === 'insurance') ||
      (recordType === 'LicensePlate' && (stepKey === 'plate' || stepKey === 'licensePlate'))
    )
  }

  async function completeMatchingWorkflowStep(recordType: string, data: Record<string, unknown>) {
    const workflow = selectedWorkflow
    const step = selectedWorkflowStep
    if (!workflow || !step || !complianceStepMatches(step.stepKey, recordType)) return

    let updatedWorkflow = await api.put<WorkflowInstance>(`/api/workflows/${workflow.id}/steps/${step.stepKey}`, {
      status: 'Complete',
      makeCurrent: true,
      data: {
        ...(step.data ?? {}),
        ...data,
        notes: workflowStepNotes,
      },
    })

    updatedWorkflow = await advanceWorkflowFromStep(updatedWorkflow, step.stepKey)
    setWorkflows((current) => current.map((item) => (item.id === updatedWorkflow.id ? updatedWorkflow : item)))
    selectWorkflow(updatedWorkflow)
  }

  async function saveWorkflowStep(status: string) {
    if (!selectedWorkflow || !selectedWorkflowStep) return

    setLoading(true)
    setMessage('Saving workflow step...')

    try {
      const extraStepData: Record<string, string> = {}
      if (damageEstimateAmount) extraStepData.estimateAmount = damageEstimateAmount
      if (damageEstimateVendor) extraStepData.estimateVendor = damageEstimateVendor
      if (damageRepairStatus && damageRepairStatus !== 'Pending') extraStepData.repairStatus = damageRepairStatus
      if (workflowReceiptDocumentId) extraStepData.receiptDocumentId = workflowReceiptDocumentId

      let workflow = await api.put<WorkflowInstance>(
        `/api/workflows/${selectedWorkflow.id}/steps/${selectedWorkflowStep.stepKey}`,
        {
          status,
          makeCurrent: true,
          data: {
            ...(selectedWorkflowStep.data ?? {}),
            notes: workflowStepNotes,
            ...extraStepData,
          },
        },
      )
      if (status === 'Complete') {
        workflow = await advanceWorkflowFromStep(workflow, selectedWorkflowStep.stepKey)
      }
      setWorkflows((current) => current.map((item) => (item.id === workflow.id ? workflow : item)))
      selectWorkflow(workflow)
      setMessage(status === 'Complete' ? 'Step complete. Moved to next task.' : 'Workflow step saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save workflow step')
    } finally {
      setLoading(false)
    }
  }

  async function saveRentalInspectionDetails(advance = false) {
    if (!selectedWorkflow || selectedWorkflow.workflowType !== 'RentalInspection') return

    setLoading(true)
    setMessage('Saving inspection details...')

    try {
      const inspection = await api.put<RentalInspection>(`/api/workflows/${selectedWorkflow.id}/rental-inspection`, {
        vehicleId: dashboard?.vehicle.id ?? null,
        inspectionKind: rentalInspectionForm.inspectionKind || rentalInspectionKind,
        odometer: rentalInspectionForm.odometer ? Number(rentalInspectionForm.odometer) : null,
        fuelLevel: rentalInspectionForm.fuelLevel || null,
        damageFound: rentalInspectionForm.damageFound === '' ? null : rentalInspectionForm.damageFound === 'true',
        status: advance ? 'NeedsReview' : 'Draft',
        notes: rentalInspectionForm.notes || null,
      })
      applyRentalInspectionForm(inspection)
      const workflow = await api.get<WorkflowInstance>(`/api/workflows/${selectedWorkflow.id}`)
      setWorkflows((current) => current.map((item) => (item.id === workflow.id ? workflow : item)))
      if (advance && selectedWorkflowStep) {
        const completedWorkflow = await api.put<WorkflowInstance>(`/api/workflows/${selectedWorkflow.id}/steps/${selectedWorkflowStep.stepKey}`, {
          status: 'Complete',
          makeCurrent: true,
          data: {
            ...(selectedWorkflowStep.data ?? {}),
            inspectionId: inspection.id,
            vehicleId: inspection.vehicleId,
            notes: rentalInspectionForm.notes,
          },
        })
        const advancedWorkflow = await advanceWorkflowFromStep(completedWorkflow, selectedWorkflowStep.stepKey)
        setWorkflows((current) => current.map((item) => (item.id === advancedWorkflow.id ? advancedWorkflow : item)))
        selectWorkflow(advancedWorkflow)
        setMessage('Inspection details saved. Moved to next task.')
      } else {
        selectWorkflow(workflow)
        setMessage('Inspection details saved')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save inspection details')
    } finally {
      setLoading(false)
    }
  }

  async function uploadRentalInspectionPhoto(slotKey: string) {
    if (!selectedWorkflow || selectedWorkflow.workflowType !== 'RentalInspection') return
    const file = rentalInspectionPhotoFiles[slotKey]
    if (!file) {
      setMessage('Choose a photo before uploading.')
      return
    }

    setLoading(true)
    setMessage('Uploading inspection photo...')

    try {
      if (!rentalInspection) {
        await saveRentalInspectionDetails(false)
      }

      const form = new FormData()
      form.append('file', file)
      form.append('notes', rentalInspectionForm.notes)

      const response = await fetch(`/api/workflows/${selectedWorkflow.id}/rental-inspection/photos/${slotKey}`, {
        method: 'POST',
        body: form,
      })

      if (!response.ok) throw new Error(await response.text())
      const inspection = (await response.json()) as RentalInspection
      applyRentalInspectionForm(inspection)
      setRentalInspectionPhotoFiles((current) => ({ ...current, [slotKey]: null }))
      await refreshWorkflows()
      if (dashboard) await loadDashboard(dashboard.vehicle.id)
      setMessage('Inspection photo saved')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not upload inspection photo')
    } finally {
      setLoading(false)
    }
  }

  async function loadTuroMaintenanceSignals() {
    try {
      const signals = await api.get<TuroMaintenanceSignal[]>('/api/imports/turo-trip-earnings/maintenance-signals')
      setTuroMaintenanceSignals(signals)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load Turo maintenance signals')
    }
  }

  async function loadDiagnosticReports(vehicleId: string) {
    try {
      const reports = await api.get<DiagnosticReport[]>(`/api/vehicles/${vehicleId}/diagnostic-reports/`)
      setDiagnosticReports(reports)
    } catch {
      // non-critical; silently ignore
    }
  }

  async function uploadDiagnosticReport() {
    if (!obd2UploadFile || !dashboard) return
    setLoading(true)
    setMessage('Uploading OBD2 report…')
    try {
      const form = new FormData()
      form.append('file', obd2UploadFile)
      const report = await api.postForm<DiagnosticReport>(
        `/api/vehicles/${dashboard.vehicle.id}/diagnostic-reports/upload`,
        form
      )
      setDiagnosticReports((prev) => [report, ...prev])
      setObd2UploadFile(null)
      setMessage('OBD2 report stored and analysed.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed')
    } finally {
      setLoading(false)
    }
  }

  async function loadWorkflowEvents(workflowId: string) {
    try {
      const events = await api.get<WorkflowEvent[]>(`/api/workflows/${workflowId}/events`)
      setWorkflowEvents(events)
    } catch {
      // non-critical — timeline is decorative; silently ignore
    }
  }

  async function loadTuroImportHistory() {
    try {
      const history = await api.get<TuroImportRecord[]>('/api/imports/turo-trip-earnings')
      setTuroImportHistory(history)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load import history')
    }
  }

  async function saveDisplayName() {
    if (!operatorName.trim()) return
    setDisplayNameSaving(true)
    try {
      await api.put('/api/users/me/display-name', { displayName: operatorName.trim() })
      if (operatorName.trim()) localStorage.setItem('operatorName', operatorName.trim())
    } catch {
      alert('Could not save display name')
    } finally {
      setDisplayNameSaving(false)
    }
  }

  async function loadNotifPrefs() {
    try {
      const prefs = await api.get<{ notifyByEmail: boolean; emailAddress: string | null }>('/api/users/me/notifications')
      setNotifyByEmail(prefs.notifyByEmail)
      setNotifyEmail(prefs.emailAddress ?? '')
    } catch { /* silently ignore */ }
  }

  async function saveNotifPrefs() {
    setNotifSaving(true)
    try {
      await api.put('/api/users/me/notifications', {
        notifyByEmail,
        emailAddress: notifyByEmail && notifyEmail.trim() ? notifyEmail.trim() : null,
      })
    } catch {
      alert('Could not save notification preferences')
    } finally {
      setNotifSaving(false)
    }
  }

  async function loadNotifLog() {
    try {
      const log = await api.get<NotifLogEntry[]>('/api/notifications/log')
      setNotifLog(log)
    } catch { /* silently ignore */ }
  }

  async function loadVehicleTuroTrips(vehicleId: string) {
    setLoading(true)
    setMessage('Loading trip history...')
    try {
      const trips = await api.get<TuroTripRecord[]>(`/api/vehicles/${vehicleId}/turo-trips`)
      setVehicleTuroTrips(trips)
      setShowTuroTrips(true)
      setMessage(trips.length > 0 ? `${trips.length} trips loaded` : 'No trips found for this vehicle')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load trip history')
    } finally {
      setLoading(false)
    }
  }

  async function importTuroTripEarnings(event: FormEvent) {
    event.preventDefault()
    if (!turoImportFile) {
      setMessage('Choose the Turo trip earnings CSV first.')
      return
    }

    setLoading(true)
    setMessage('Importing Turo trips...')

    try {
      const form = new FormData()
      form.append('file', turoImportFile)
      const response = await fetch('/api/imports/turo-trip-earnings', {
        method: 'POST',
        body: form,
      })
      if (!response.ok) throw new Error(await response.text())
      const result = (await response.json()) as TuroTripImportResponse
      setTuroImportResult(result)
      setTuroImportFile(null)
      await refreshVehicles()
      await loadTuroMaintenanceSignals()
      setMessage(`Imported ${result.rowCount} rows: ${result.insertedCount} new, ${result.updatedCount} updated`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not import Turo trips')
    } finally {
      setLoading(false)
    }
  }

  async function continueAddVehicleVin() {
    if (!selectedWorkflow || !selectedWorkflowStep) return
    const nextVin = vin.trim().toUpperCase()

    if (nextVin.length < 11) {
      setMessage('Enter or scan a VIN first.')
      return
    }

    setLoading(true)
    setMessage('Saving VIN and opening inventory...')

    try {
      await saveAddVehicleWorkflowVin(nextVin)
      setActiveArea('inventory')
      await lookupVehicleByVin(nextVin)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not continue Add Vehicle workflow')
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

  async function readWorkflowReceipt() {
    if (!workflowReceiptFile || !selectedWorkflow?.vehicleId) return

    setLoading(true)
    setMessage('Reading receipt...')

    try {
      const form = new FormData()
      form.append('file', workflowReceiptFile)

      const response = await fetch(
        `/api/vehicles/${selectedWorkflow.vehicleId}/documents/receipt`,
        { method: 'POST', body: form },
      )
      if (!response.ok) throw new Error(await response.text())

      const result = (await response.json()) as { document: DocumentRecord; aiText: string }
      setWorkflowReceiptInsight(result.aiText)
      setWorkflowReceiptDocumentId(result.document.id)
      setWorkflowStepNotes([workflowStepNotes, `Receipt readout:\n${result.aiText}`].filter(Boolean).join('\n\n'))
      setMessage('Receipt stored and read. Review and save step.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not read receipt')
    } finally {
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
        {[
          ...baseAreas.slice(0, -1),
          ...(profile?.role === 'admin' ? [{ id: 'users' as AppArea, label: 'Users' }] : []),
          baseAreas[baseAreas.length - 1],
        ].map((area) => (
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
      {activeArea !== 'workflows' && selectedWorkflow && selectedWorkflowStep && (
        <section className="workflow-context-banner" aria-label="Active workflow context">
          <div>
            <span>Workflow mode</span>
            <strong>{selectedWorkflow.title}</strong>
            <p>
              Step {selectedWorkflowStepIndex + 1} of {selectedWorkflow.steps.length}: {selectedWorkflowStep.title}
            </p>
          </div>
          <div className="workflow-context-actions">
            <button className="secondary-button" type="button" disabled={loading} onClick={() => setActiveArea('workflows')}>
              View Steps
            </button>
            <button className="secondary-button" type="button" disabled={loading} onClick={() => saveWorkflowStep('Complete')}>
              Mark Step Done
            </button>
          </div>
        </section>
      )}
      {workingMessage && (
        <div className="working-overlay" role="status" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <span>{workingMessage}</span>
        </div>
      )}

      {guidedCapture && (
        <GuidedCameraModal
          guidedCapture={guidedCapture}
          guidedPhotoUrl={guidedPhotoUrl}
          guidedCameraStarting={guidedCameraStarting}
          guidedCameraError={guidedCameraError}
          guidedVideoRef={guidedVideoRef}
          guidedCanvasRef={guidedCanvasRef}
          onCancel={cancelGuidedCamera}
          onCapture={captureGuidedPhoto}
          onRetake={retakeGuidedPhoto}
          onUsePhoto={useGuidedPhoto}
          onNativeCapture={openNativeCapture}
          onRetryCamera={openGuidedCamera}
          onCameraReady={() => setGuidedCameraStarting(false)}
        />
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
              <div>
                <h2>Fleet Preview</h2>
                <p>Showing {Math.min(vehicles.length, 4)} of {vehicles.length}</p>
              </div>
              <button className="secondary-button" type="button" onClick={() => setActiveArea('inventory')}>
                Open Inventory
              </button>
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
        <WorkflowDashboard
          workflowCatalog={workflowCatalog}
          activeWorkflows={activeWorkflows}
          completedWorkflows={completedWorkflows}
          selectedWorkflow={selectedWorkflow}
          selectedWorkflowStep={selectedWorkflowStep}
          selectedWorkflowId={selectedWorkflowId}
          selectedWorkflowStepKey={selectedWorkflowStepKey}
          selectedWorkflowStepDocumentId={selectedWorkflowStepDocumentId}
          selectedWorkflowStepAiText={selectedWorkflowStepAiText}
          isAddVehicleVinStep={isAddVehicleVinStep}
          loading={loading}
          vin={vin}
          rentalInspectionKind={rentalInspectionKind}
          workflowStepNotes={workflowStepNotes}
          obd2ReportFile={obd2ReportFile}
          obd2ReportInsight={obd2ReportInsight}
          workflowReceiptFile={workflowReceiptFile}
          workflowReceiptInsight={workflowReceiptInsight}
          workflowReceiptDocumentId={workflowReceiptDocumentId}
          damageEstimateAmount={damageEstimateAmount}
          damageEstimateVendor={damageEstimateVendor}
          damageRepairStatus={damageRepairStatus}
          workflowEditorRef={workflowEditorRef}
          workflowVinCameraInputRef={workflowVinCameraInputRef}
          startWorkflow={startWorkflow}
          selectWorkflow={selectWorkflow}
          activateWorkflowStep={activateWorkflowStep}
          scanVinFromPhoto={scanVinFromPhoto}
          setVin={setVin}
          setRentalInspectionKind={setRentalInspectionKind}
          openWorkflowVinCamera={openWorkflowVinCamera}
          recoverVinScanNow={recoverVinScanNow}
          continueAddVehicleVin={continueAddVehicleVin}
          setWorkflowStepNotes={setWorkflowStepNotes}
          setObd2ReportFile={setObd2ReportFile}
          uploadObd2Report={uploadObd2Report}
          setWorkflowReceiptFile={setWorkflowReceiptFile}
          readWorkflowReceipt={readWorkflowReceipt}
          setDamageEstimateAmount={setDamageEstimateAmount}
          setDamageEstimateVendor={setDamageEstimateVendor}
          setDamageRepairStatus={setDamageRepairStatus}
          workflowEvents={workflowEvents}
          saveWorkflowStep={saveWorkflowStep}
          updateWorkflowStatus={updateWorkflowStatus}
        />
      )}

      {activeArea === 'maintenance' && (
        <section className="panel area-panel">
          <div className="section-heading">
            <h2>Fleet Maintenance</h2>
          </div>
          <FleetMaintenancePanel
            onOpenVehicle={(vehicleId) => {
              const v = vehicles.find((vehicle) => vehicle.id === vehicleId)
              if (v) openVehicle(v)
            }}
          />
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

      {activeArea === 'jobs' && <JobsPanel />}

      {activeArea === 'ledger' && <LedgerPanel />}

      {activeArea === 'users' && profile?.role === 'admin' && (
        <section className="area-grid">
          <PendingApprovalsPanel />
          {notifLog.length > 0 && (
            <div className="panel area-panel">
              <div className="section-heading">
                <h2>Notification Log</h2>
                <span className="tag">{notifLog.length}</span>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sent</th>
                    <th>Event</th>
                    <th>Channel</th>
                    <th>Recipient</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {notifLog.map(entry => (
                    <tr key={entry.id}>
                      <td>{new Date(entry.sentAt).toLocaleString()}</td>
                      <td>{entry.eventType}</td>
                      <td>{entry.channel}</td>
                      <td style={{ fontSize: 12 }}>{entry.recipient}</td>
                      <td>
                        <span className={entry.status === 'Sent' ? 'status' : 'status busy'}>
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
          <div className="panel area-panel">
            <div className="section-heading">
              <h2>Account</h2>
            </div>
            {profile && (
              <div className="metrics">
                <div><span>Phone</span><strong>{profile.phone}</strong></div>
                <div><span>Role</span><strong>{profile.role}</strong></div>
                <div><span>Status</span><strong>{profile.status}</strong></div>
              </div>
            )}
            <div className="form-row" style={{ marginTop: 12 }}>
              <label htmlFor="operatorName">Display Name</label>
              <input
                id="operatorName"
                type="text"
                value={operatorName}
                placeholder="e.g. Jane Smith"
                onChange={e => setOperatorName(e.target.value)}
              />
            </div>
            <button
              className="btn-secondary"
              style={{ marginTop: 6 }}
              disabled={displayNameSaving || !operatorName.trim()}
              onClick={saveDisplayName}
            >
              {displayNameSaving ? 'Saving…' : 'Save Display Name'}
            </button>
            <p className="hint-text">Your display name is shown on records you create and in notification emails.</p>
            <button className="btn-secondary" style={{ marginTop: 8 }} onClick={signOut}>
              Sign out
            </button>
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Job Notifications</h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={notifyByEmail}
                  onChange={e => setNotifyByEmail(e.target.checked)}
                />
                Email me when new jobs are posted
              </label>
              {notifyByEmail && (
                <div className="form-row" style={{ marginTop: 8 }}>
                  <label htmlFor="notifEmail">Notification Email</label>
                  <input
                    id="notifEmail"
                    type="email"
                    value={notifyEmail}
                    placeholder="your@email.com"
                    onChange={e => setNotifyEmail(e.target.value)}
                  />
                </div>
              )}
              <button
                className="btn-secondary"
                style={{ marginTop: 8 }}
                disabled={notifSaving}
                onClick={saveNotifPrefs}
              >
                {notifSaving ? 'Saving…' : 'Save Preferences'}
              </button>
            </div>
          </div>
          <MaintenanceTemplateManager />
          <TuroImportPanel
            turoImportFile={turoImportFile}
            turoImportResult={turoImportResult}
            turoMaintenanceSignals={turoMaintenanceSignals}
            loading={loading}
            onFileChange={setTuroImportFile}
            onImport={importTuroTripEarnings}
            onRefreshSignals={loadTuroMaintenanceSignals}
          />
          {turoImportHistory.length > 0 && (
            <div className="panel area-panel">
              <div className="section-heading">
                <h2>Import History</h2>
                <span className="tag">{turoImportHistory.length} imports</span>
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Imported</th>
                    <th>Rows</th>
                    <th>Inserted</th>
                    <th>Updated</th>
                    <th>Skipped</th>
                  </tr>
                </thead>
                <tbody>
                  {turoImportHistory.map(imp => (
                    <tr key={imp.id}>
                      <td>{imp.originalFileName}</td>
                      <td>{new Date(imp.importedAt).toLocaleDateString()}</td>
                      <td>{imp.rowCount}</td>
                      <td>{imp.insertedCount}</td>
                      <td>{imp.updatedCount}</td>
                      <td>{imp.skippedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
            <button className="secondary-button" type="button" disabled={loading} onClick={recoverVinScanNow}>
              Use Last Scan
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
        {tireAlerts.length > 0 && (
        <section className="panel fleet-panel">
          <div className="section-heading">
            <h2>Tire Pressure Alerts</h2>
            <p>{tireAlerts.filter((a) => a.latestStatus === 'Red' || a.latestStatus === 'Yellow' || !a.measuredAt).length} need attention</p>
          </div>
          <div className="tire-alerts-list">
            {tireAlerts.map((alert) => (
              <article key={alert.vehicleId} className={`record tire-alert-row tire-alert-${(alert.latestStatus ?? 'unknown').toLowerCase()}`}>
                <div>
                  <strong>{alert.vehicleLabel}</strong>
                  <span>{alert.vin}</span>
                </div>
                <div className="tire-alert-meta">
                  <span className={`tire-status-chip tire-${(alert.latestStatus ?? 'unknown').toLowerCase()}`}>
                    {alert.latestStatus ?? 'Never checked'}
                  </span>
                  {alert.psiSummary && <small>{alert.psiSummary} PSI</small>}
                  {alert.daysAgo != null
                    ? <small>{alert.daysAgo === 0 ? 'Today' : `${alert.daysAgo}d ago`}</small>
                    : <small className="overdue">No reading</small>}
                </div>
              </article>
            ))}
          </div>
        </section>
        )}
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
              <button className="secondary-button" type="button" onClick={startEditingVehicle}>
                Edit Vehicle
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
              <div>
                <span>Tires</span>
                <strong className={`tire-status-chip tire-${(dashboard.latestTireStatus ?? 'unknown').toLowerCase()}`}>
                  {dashboard.latestTireStatus ?? 'Not checked'}
                </strong>
              </div>
            </div>
            {(dashboard.latestTireStatus === 'Red' || dashboard.latestTireStatus === 'Yellow' || !dashboard.tireLastCheckedAt) && (
              <p className="tire-alert-hint">
                {dashboard.latestTireStatus === 'Red'
                  ? 'Tire pressure out of range — check now.'
                  : dashboard.latestTireStatus === 'Yellow'
                  ? 'Tire pressure slightly off — check soon.'
                  : 'No tire pressure readings recorded yet.'}
              </p>
            )}
            <p className="context">{dashboard.aiContextSummary}</p>
          </div>

          {showEditVehicle && (
            <VehicleEditPanel
              form={editVehicleForm}
              loading={loading}
              onChange={setEditVehicleForm}
              onSubmit={saveVehicle}
              onCancel={() => setShowEditVehicle(false)}
            />
          )}

          {selectedWorkflow?.workflowType === 'RentalInspection' && (
            <div className="panel rental-inspection-panel">
              <div className="section-heading">
                <div>
                  <h2>Rental Inspection</h2>
                  <p>
                    {selectedWorkflowStep
                      ? `Step ${selectedWorkflowStepIndex + 1} of ${selectedWorkflow.steps.length}: ${selectedWorkflowStep.title}`
                      : selectedWorkflow.title}
                  </p>
                </div>
                <button className="secondary-button" type="button" disabled={loading} onClick={() => setActiveArea('workflows')}>
                  View Flow
                </button>
              </div>
              {workingIndicator}
              <div className="workflow-guidance rental-guidance">
                <div>
                  <span>Current instruction</span>
                  <strong>
                    {selectedWorkflowStep?.stepKey === 'inspectionKind' && 'Confirm whether this is pre-trip, post-trip, or both close together.'}
                    {selectedWorkflowStep?.stepKey === 'vehicle' && 'Confirm this inspection is attached to the correct vehicle before entering condition details.'}
                    {selectedWorkflowStep?.stepKey === 'odometerFuel' && 'Record the odometer and fuel/charge level, then save and continue.'}
                    {selectedWorkflowStep?.stepKey === 'photos' && 'Capture the required condition photos. Retake any slot by choosing a new photo and uploading again.'}
                    {selectedWorkflowStep?.stepKey === 'tires' && 'Open tire pressure and save an actual tire reading log.'}
                    {selectedWorkflowStep?.stepKey === 'damage' && 'Mark whether damage was found and attach a close-up photo if needed.'}
                    {selectedWorkflowStep?.stepKey === 'review' && 'Review the inspection, then complete the workflow when the steps look right.'}
                    {!selectedWorkflowStep && 'Continue the rental inspection from the workflow list.'}
                  </strong>
                </div>
              </div>
              <form className="rental-inspection-form compact" onSubmit={(event) => {
                event.preventDefault()
                saveRentalInspectionDetails(selectedWorkflowStep?.stepKey === 'odometerFuel')
              }}>
                <label>
                  <span>Inspection Type</span>
                  <select
                    value={rentalInspectionForm.inspectionKind}
                    onChange={(event) => setRentalInspectionForm({ ...rentalInspectionForm, inspectionKind: event.target.value })}
                  >
                    <option value="Pre">Pre</option>
                    <option value="Post">Post</option>
                    <option value="Both">Both</option>
                  </select>
                </label>
                <label>
                  <span>Odometer</span>
                  <input
                    inputMode="numeric"
                    value={rentalInspectionForm.odometer}
                    onChange={(event) => setRentalInspectionForm({ ...rentalInspectionForm, odometer: event.target.value.replace(/\D/g, '') })}
                  />
                </label>
                <label>
                  <span>Fuel / Charge</span>
                  <input
                    value={rentalInspectionForm.fuelLevel}
                    placeholder="Full, 7/8, 62%, etc."
                    onChange={(event) => setRentalInspectionForm({ ...rentalInspectionForm, fuelLevel: event.target.value })}
                  />
                </label>
                <label>
                  <span>Damage Found</span>
                  <select
                    value={rentalInspectionForm.damageFound}
                    onChange={(event) => setRentalInspectionForm({ ...rentalInspectionForm, damageFound: event.target.value })}
                  >
                    <option value="">Not checked</option>
                    <option value="false">No visible damage</option>
                    <option value="true">Damage found</option>
                  </select>
                </label>
                <label className="wide">
                  <span>Inspection Notes</span>
                  <textarea
                    value={rentalInspectionForm.notes}
                    onChange={(event) => setRentalInspectionForm({ ...rentalInspectionForm, notes: event.target.value })}
                  />
                </label>
                <div className="form-actions wide">
                  <button type="submit" disabled={loading}>Save Inspection</button>
                  <button className="secondary-button" type="button" disabled={loading} onClick={() => saveRentalInspectionDetails(true)}>
                    Save + Continue
                  </button>
                </div>
              </form>

              <div className="inspection-photo-grid">
                {rentalInspectionPhotoSlots.map(([slotKey, label]) => {
                  const savedPhoto = rentalInspection?.photos.find((photo) => photo.slotKey === slotKey)
                  return (
                    <div key={slotKey} className={savedPhoto ? 'inspection-photo-slot complete' : 'inspection-photo-slot'}>
                      <div>
                        <strong>{label}</strong>
                        <span>{savedPhoto ? 'Saved' : 'Needed'}</span>
                      </div>
                      {savedPhoto && (
                        <a href={`/api/documents/${savedPhoto.documentId}/content`} target="_blank" rel="noreferrer">
                          View
                        </a>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={(event) =>
                          setRentalInspectionPhotoFiles({
                            ...rentalInspectionPhotoFiles,
                            [slotKey]: event.target.files?.[0] ?? null,
                          })
                        }
                      />
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={loading || !rentalInspectionPhotoFiles[slotKey]}
                        onClick={() => uploadRentalInspectionPhoto(slotKey)}
                      >
                        {savedPhoto ? 'Replace Photo' : 'Upload Photo'}
                      </button>
                    </div>
                  )
                })}
              </div>

              {rentalInspection && (rentalInspection.status === 'NeedsReview' || rentalInspection.status === 'Complete') && (
                <div className="form-actions" style={{ marginTop: '12px' }}>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      if (inspectionReport) {
                        setInspectionReport(null)
                      } else if (selectedWorkflow) {
                        loadInspectionReport(selectedWorkflow.id)
                      }
                    }}
                  >
                    {inspectionReport ? 'Hide Report' : 'View Report'}
                  </button>
                </div>
              )}
            </div>
          )}

          {inspectionReport && (
            <div className="panel inspection-report" id="inspection-report">
              <div className="section-heading no-print-hide">
                <h2>Inspection Report</h2>
                <button className="secondary-button" onClick={() => window.print()}>Print</button>
              </div>
              <div className="report-header">
                <h3>{inspectionReport.inspectionKind} Rental Inspection</h3>
                <p>{new Date(inspectionReport.inspectedAt).toLocaleString()}</p>
              </div>
              <div className="report-vehicle">
                <strong>{inspectionReport.vehicleYear} {inspectionReport.vehicleMake} {inspectionReport.vehicleModel}</strong>
                <span>VIN: {inspectionReport.vehicleVin}</span>
                {inspectionReport.vehiclePlate && (
                  <span>Plate: {inspectionReport.vehiclePlate} {inspectionReport.vehiclePlateState ?? ''}</span>
                )}
                {inspectionReport.vehicleColor && <span>Color: {inspectionReport.vehicleColor}</span>}
              </div>
              <div className="report-fields">
                <div><span>Odometer</span><strong>{inspectionReport.odometer?.toLocaleString() ?? '—'} mi</strong></div>
                <div><span>Fuel Level</span><strong>{inspectionReport.fuelLevel ?? '—'}</strong></div>
                <div><span>Damage Found</span><strong>{inspectionReport.damageFound == null ? '—' : inspectionReport.damageFound ? 'Yes' : 'No'}</strong></div>
                <div><span>Status</span><strong>{inspectionReport.status}</strong></div>
              </div>
              {inspectionReport.notes && <p className="report-notes">{inspectionReport.notes}</p>}
              <div className="report-photo-grid">
                {inspectionReport.photos.map((photo) => (
                  <div key={photo.slotKey} className="report-photo-slot">
                    <a href={`/api/documents/${photo.documentId}/content`} target="_blank" rel="noreferrer">
                      <img src={`/api/documents/${photo.documentId}/content`} alt={photo.slotLabel} />
                    </a>
                    <span>{photo.slotLabel}</span>
                    {photo.notes && <p>{photo.notes}</p>}
                  </div>
                ))}
                {inspectionReport.photos.length === 0 && <p className="empty">No photos attached.</p>}
              </div>
            </div>
          )}

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
              <button className="secondary-button" type="button" disabled={loading} onClick={recheckComplianceImages}>
                Recheck Saved Images
              </button>
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
                          <button className="secondary-button" type="button" disabled={loading} onClick={() => openComplianceCamera(type)}>
                            Scan Again
                          </button>
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
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setComplianceForm({ ...complianceForm, vin: dashboard.vehicle.vin })}
                >
                  Use Vehicle VIN
                </button>
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
            <TirePressurePanel
              tirePressure={tirePressure}
              tireSpecForm={tireSpecForm}
              tireLogForm={tireLogForm}
              tirePressureInsight={tirePressureInsight}
              loading={loading}
              tireSpecCameraInputRef={tireSpecCameraInputRef}
              tireLogCameraInputRef={tireLogCameraInputRef}
              onSpecChange={setTireSpecForm}
              onLogChange={setTireLogForm}
              onSpecSubmit={saveTireSpec}
              onLogSubmit={saveTireLog}
              onSpecPhotoChange={readTireSpecPhoto}
              onLogPhotoChange={readTireLogPhoto}
              onScanSpec={() => {
                setShowTirePressurePanel(true)
                localStorage.setItem(tirePanelStorageKey, 'true')
                localStorage.setItem(tireSpecScanPendingStorageKey, 'true')
                tireSpecCameraInputRef.current?.click()
              }}
            />
          )}

          {showMaintenanceForm && (
            <MaintenanceForm
              form={maintenanceForm}
              receiptFile={receiptFile}
              receiptInsight={receiptInsight}
              loading={loading}
              serviceSchedules={serviceSchedules}
              currentOdometer={dashboard?.vehicle.currentOdometer}
              onChange={setMaintenanceForm}
              onSubmit={logMaintenance}
              onReadReceipt={readReceipt}
              onReceiptFileChange={setReceiptFile}
              onCancel={() => setShowMaintenanceForm(false)}
            />
          )}

          <div className="panel">
            <div className="section-heading">
              <h2>Recent Maintenance</h2>
              <p>{dashboard.recentMaintenance.length} records</p>
            </div>
            <div className="record-list">
              {dashboard.recentMaintenance.length === 0 && <p className="empty">No maintenance logged yet.</p>}
              {dashboard.recentMaintenance.map((record) => {
                const receipts = dashboard.documents.filter(
                  (d) => d.ownerType === 'MaintenanceRecord' && d.ownerId === record.id && d.kind === 'Receipt',
                )
                return (
                  <article key={record.id} className="record">
                    <strong>{record.eventType}</strong>
                    <span>{record.datePerformed}</span>
                    <p>
                      {record.odometer ? `${record.odometer.toLocaleString()} miles` : 'Mileage not recorded'}
                      {record.cost ? ` - $${record.cost.toFixed(2)}` : ''}
                    </p>
                    {receipts.length > 0 && (
                      <div className="match-list">
                        {receipts.map((doc) => (
                          <a
                            key={doc.id}
                            className="status-chip"
                            href={`/api/documents/${doc.id}/content`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Receipt
                          </a>
                        ))}
                      </div>
                    )}
                    {record.notes && <p className="context">{record.notes}</p>}
                    {record.createdBy && <p className="audit-meta">by {record.createdBy}</p>}
                  </article>
                )
              })}
            </div>
          </div>

          <div className="panel">
            <div className="section-heading">
              <h2>Documents</h2>
            </div>
            <DocumentLibraryPanel vehicleId={dashboard.vehicle.id} />
          </div>

          <div className="panel">
            <div className="section-heading">
              <h2>OBD2 Diagnostic Reports</h2>
              {diagnosticReports.length > 0 && <span className="tag">{diagnosticReports.length}</span>}
            </div>
            <div className="inline-action-panel">
              <label className="file-label">
                <span>Upload PDF</span>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setObd2UploadFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {obd2UploadFile && (
                <button className="primary-action" onClick={uploadDiagnosticReport} disabled={loading}>
                  Analyse &amp; Store
                </button>
              )}
            </div>
            <div className="record-list">
              {diagnosticReports.length === 0 && <p className="empty">No OBD2 reports stored yet.</p>}
              {diagnosticReports.map((report) => (
                <article key={report.id} className="record">
                  <strong>{report.fileName}</strong>
                  <span>{new Date(report.reportedAt).toLocaleDateString()}</span>
                  {report.documentId && (
                    <a
                      className="status-chip"
                      href={`/api/documents/${report.documentId}/content`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      PDF
                    </a>
                  )}
                  {report.aiSummary && (
                    <p className="context">{report.aiSummary.slice(0, 300)}{report.aiSummary.length > 300 ? '…' : ''}</p>
                  )}
                </article>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="section-heading">
              <h2>Turo Trip History</h2>
              <button
                className="secondary-button"
                onClick={() => {
                  if (showTuroTrips) {
                    setShowTuroTrips(false)
                    setVehicleTuroTrips([])
                  } else {
                    loadVehicleTuroTrips(dashboard.vehicle.id)
                  }
                }}
                disabled={loading}
              >
                {showTuroTrips ? 'Hide Trips' : 'Load Trips'}
              </button>
            </div>
            {showTuroTrips && (
              <div className="record-list">
                {vehicleTuroTrips.length === 0 && <p className="empty">No trip records for this vehicle.</p>}
                {vehicleTuroTrips.map((trip) => (
                  <article key={trip.id} className="record">
                    <strong>{trip.guest ?? 'Guest'}</strong>
                    <span>{trip.tripStatus ?? ''}</span>
                    <p>
                      {trip.tripStart ? new Date(trip.tripStart).toLocaleDateString() : '—'}
                      {trip.tripEnd ? ` – ${new Date(trip.tripEnd).toLocaleDateString()}` : ''}
                      {trip.tripDays ? ` (${trip.tripDays}d)` : ''}
                    </p>
                    {(trip.distanceTraveled != null || trip.totalEarnings != null) && (
                      <p className="context">
                        {trip.distanceTraveled != null ? `${trip.distanceTraveled.toLocaleString()} mi` : ''}
                        {trip.totalEarnings != null ? `  ·  $${trip.totalEarnings.toFixed(2)}` : ''}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
        </>
      )}
    </main>
  )
}

export default App
