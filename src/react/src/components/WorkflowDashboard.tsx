import type { RefObject } from 'react'
import type { WorkflowInstance, WorkflowStep } from '../types'

type WorkflowCatalogItem = readonly [string, string, string]

type WorkflowDashboardProps = {
  workflowCatalog: readonly WorkflowCatalogItem[]
  activeWorkflows: WorkflowInstance[]
  completedWorkflows: WorkflowInstance[]
  selectedWorkflow: WorkflowInstance | null
  selectedWorkflowStep: WorkflowStep | null
  selectedWorkflowId: string
  selectedWorkflowStepKey: string
  selectedWorkflowStepDocumentId: string
  selectedWorkflowStepAiText: string
  isAddVehicleVinStep: boolean
  loading: boolean
  vin: string
  workflowStepNotes: string
  obd2ReportFile: File | null
  obd2ReportInsight: string
  workflowEditorRef: RefObject<HTMLDivElement | null>
  workflowVinCameraInputRef: RefObject<HTMLInputElement | null>
  startWorkflow: (workflowType: string) => void
  selectWorkflow: (workflow: WorkflowInstance) => void
  activateWorkflowStep: (workflow: WorkflowInstance, step: WorkflowStep) => void
  scanVinFromPhoto: (file: File) => void
  setVin: (vin: string) => void
  openWorkflowVinCamera: () => void
  recoverVinScanNow: () => void
  continueAddVehicleVin: () => void
  setWorkflowStepNotes: (notes: string) => void
  setObd2ReportFile: (file: File | null) => void
  uploadObd2Report: () => void
  saveWorkflowStep: (status: string) => void
  updateWorkflowStatus: (status: string) => void
}

function currentStepTitle(workflow: WorkflowInstance) {
  return workflow.steps.find((step) => step.stepKey === workflow.currentStepKey)?.title ?? workflow.currentStepKey
}

export function WorkflowDashboard({
  workflowCatalog,
  activeWorkflows,
  completedWorkflows,
  selectedWorkflow,
  selectedWorkflowStep,
  selectedWorkflowId,
  selectedWorkflowStepKey,
  selectedWorkflowStepDocumentId,
  selectedWorkflowStepAiText,
  isAddVehicleVinStep,
  loading,
  vin,
  workflowStepNotes,
  obd2ReportFile,
  obd2ReportInsight,
  workflowEditorRef,
  workflowVinCameraInputRef,
  startWorkflow,
  selectWorkflow,
  activateWorkflowStep,
  scanVinFromPhoto,
  setVin,
  openWorkflowVinCamera,
  recoverVinScanNow,
  continueAddVehicleVin,
  setWorkflowStepNotes,
  setObd2ReportFile,
  uploadObd2Report,
  saveWorkflowStep,
  updateWorkflowStatus,
}: WorkflowDashboardProps) {
  return (
    <>
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
                <small>{workflow.status} - {currentStepTitle(workflow)}</small>
              </button>
            ))}
          </div>
          <div className="section-heading workflow-subheading">
            <h2>Completed</h2>
            <p>{completedWorkflows.length} workflows</p>
          </div>
          <div className="record-list">
            {completedWorkflows.length === 0 && <p className="empty">No completed workflows.</p>}
            {completedWorkflows.slice(0, 10).map((workflow) => (
              <button
                key={workflow.id}
                className={selectedWorkflowId === workflow.id ? 'vehicle-list-item selected-row' : 'vehicle-list-item'}
                type="button"
                onClick={() => selectWorkflow(workflow)}
              >
                <span>{workflow.title}</span>
                <small>Completed - {workflow.steps.length} steps</small>
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
              {selectedWorkflowStep && (
                <div ref={workflowEditorRef} className="workflow-editor">
                  <div className="section-heading compact-heading">
                    <h2>{selectedWorkflowStep.title}</h2>
                    <p>{selectedWorkflowStep.status}</p>
                  </div>
                  <div className="workflow-actions">
                    <button className="primary-action" type="button" disabled={loading} onClick={() => activateWorkflowStep(selectedWorkflow, selectedWorkflowStep)}>
                      Continue Workflow
                    </button>
                  </div>
                  {isAddVehicleVinStep && (
                    <div className="workflow-action-panel">
                      <strong>Get the VIN first.</strong>
                      <p className="context">Scan the dashboard or door-jamb VIN. If the scan misses, type it here and continue.</p>
                      <input
                        ref={workflowVinCameraInputRef}
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
                      <label>
                        <span>VIN</span>
                        <input value={vin} onChange={(event) => setVin(event.target.value.toUpperCase())} placeholder="Scan or enter VIN" autoCapitalize="characters" />
                      </label>
                      <div className="workflow-actions">
                        <button className="secondary-button" type="button" disabled={loading} onClick={openWorkflowVinCamera}>
                          Scan VIN
                        </button>
                        <button className="secondary-button" type="button" disabled={loading} onClick={recoverVinScanNow}>
                          Use Last Scan
                        </button>
                        <button type="button" disabled={loading || vin.trim().length < 11} onClick={continueAddVehicleVin}>
                          Find / Create Vehicle
                        </button>
                      </div>
                      <p className="context">This opens Inventory with either the existing vehicle or the decoded create form.</p>
                    </div>
                  )}
                  {!isAddVehicleVinStep && (
                    <label>
                      <span>Notes / draft data</span>
                      <textarea
                        value={workflowStepNotes}
                        onChange={(event) => setWorkflowStepNotes(event.target.value)}
                        placeholder="Save anything learned on this step. Fields and scanners will plug in here as we build each workflow."
                      />
                    </label>
                  )}
                  {selectedWorkflowStep.stepKey === 'obd2Scan' && (
                    <div className="receipt-panel">
                      <label>
                        <span>RepairSolutions2 / Innova PDF</span>
                        <input type="file" accept="application/pdf,.pdf" onChange={(event) => setObd2ReportFile(event.target.files?.[0] ?? null)} />
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

              <div className="workflow-step-list">
                {selectedWorkflow.steps.map((step) => (
                  <button
                    key={step.id}
                    className={selectedWorkflowStepKey === step.stepKey ? 'workflow-step selected' : 'workflow-step'}
                    type="button"
                    onClick={() => activateWorkflowStep(selectedWorkflow, step)}
                  >
                    <strong>{step.title}</strong>
                    <span>{step.status}</span>
                  </button>
                ))}
              </div>

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

      <section className="panel area-panel">
        <div className="section-heading">
          <h2>Start New</h2>
          <p>{workflowCatalog.length} workflow types</p>
        </div>
        <div className="workflow-grid compact-workflow-grid">
          {workflowCatalog.map(([workflowType, title, detail]) => (
            <button key={workflowType} className="workflow-card" type="button" disabled={loading} onClick={() => startWorkflow(workflowType)}>
              <strong>{title}</strong>
              <span>{detail}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
