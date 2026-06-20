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
