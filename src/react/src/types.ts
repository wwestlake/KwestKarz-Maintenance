export type WorkflowStep = {
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

export type WorkflowInstance = {
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

export type Obd2ReportUploadResponse = {
  workflow: WorkflowInstance
  documentId: string
  aiText: string
  extractedText: string
}

export type AppArea = 'home' | 'inventory' | 'workflows' | 'maintenance' | 'compliance' | 'lockboxes' | 'settings'

export type GuidedCaptureMode = 'vin' | 'workflowVin' | 'compliance'

export type GuidedCaptureConfig = {
  mode: GuidedCaptureMode
  title: string
  instructions: string
  overlay: 'vin' | 'document' | 'label'
  recordType?: string
}

export type Vehicle = {
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

export type MaintenanceRecord = {
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

export type DocumentRecord = {
  id: string
  kind: string
  originalFileName: string
  contentType: string
  sizeBytes: number
  description?: string
  createdAt: string
}

export type LockBox = {
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

export type AIResponse = {
  text: string
  model: string
}

export type VinScanResponse = {
  vin?: unknown
  aiText?: unknown
  model?: unknown
}

export type VinLatestScanResponse = {
  vin?: string
  loggedAt?: string
}

export type ComplianceRecord = {
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

export type PhotoScanJob = {
  id: string
  vehicleId?: string
  scanType: string
  recordType?: string
  status: string
  message?: string
  documentId?: string
  resultRecordId?: string
  aiText?: string
  error?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export type Dashboard = {
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

export type TirePressureSpec = {
  frontLeftPsi?: number
  frontRightPsi?: number
  rearLeftPsi?: number
  rearRightPsi?: number
  notes?: string
  photoDocumentId?: string
}

export type TirePressureLog = {
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

export type TirePressureSnapshot = {
  spec?: TirePressureSpec
  recentLogs: TirePressureLog[]
}

export type RentalInspectionPhoto = {
  id: string
  inspectionId: string
  slotKey: string
  documentId: string
  notes?: string
  createdAt: string
}

export type RentalInspection = {
  id: string
  workflowId?: string
  vehicleId: string
  inspectionKind: string
  odometer?: number
  fuelLevel?: string
  damageFound?: boolean
  status: string
  notes?: string
  createdAt: string
  updatedAt: string
  photos: RentalInspectionPhoto[]
}

export type TuroTripImportVehicleSummary = {
  vin?: string
  vehicleId?: string
  vehicleName?: string
  turoVehicleId?: string
  importedTrips: number
  latestOdometer?: number
  importedMiles: number
}

export type TuroTripImportResponse = {
  importId: string
  originalFileName: string
  rowCount: number
  insertedCount: number
  updatedCount: number
  skippedCount: number
  vehicleMatches: number
  vehicleSummaries: TuroTripImportVehicleSummary[]
}

export type TuroMaintenanceSignal = {
  vehicleId?: string | null
  vin?: string | null
  vehicleLabel?: string | null
  importedTrips?: number | null
  completedTrips?: number | null
  importedMiles?: number | null
  latestTripEnd?: string | null
  latestImportedOdometer?: number | null
  latestMaintenanceOdometer?: number | null
  milesSinceLatestMaintenance?: number | null
  suggestedActions?: string[] | null
}

export type TirePressureSpecScanResponse = {
  spec: TirePressureSpec
  aiText: string
  photoDocumentId?: string
}

export type VinDecode = {
  vin: string
  year?: number
  make?: string
  model?: string
  trim?: string
  bodyClass?: string
  errorText?: string
}

export type CreateVehicleForm = {
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

export type EditVehicleForm = {
  color: string
  licensePlate: string
  licensePlateState: string
  status: string
  currentOdometer: string
  fleetPositionNumber: string
  notes: string
}
