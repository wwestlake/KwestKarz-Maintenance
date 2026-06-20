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
  rentalInspectionKind: string
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
  setRentalInspectionKind: (kind: string) => void
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

function inspectionKind(workflow: WorkflowInstance) {
  const kind = workflow.steps
    .map((step) => step.data?.inspectionKind)
    .find((value): value is string => typeof value === 'string' && value.length > 0)

  return kind ?? ''
}

function stepGuidance(workflow: WorkflowInstance, step: WorkflowStep) {
  const kind = inspectionKind(workflow)
  const rentalInspectionLabel = kind ? `${kind.toLowerCase()} rental inspection` : 'rental inspection'
  const shared: Record<string, { summary: string; action: string; done: string; checklist: string[] }> = {
    vehicle: {
      summary: 'Pick the vehicle this workflow belongs to and make sure the dashboard is open.',
      action: 'Open the vehicle record.',
      done: 'The correct vehicle is selected before you record inspection or maintenance details.',
      checklist: ['Confirm VIN or fleet vehicle', 'Confirm odometer if visible', 'Check plate/lock box context'],
    },
    photos: {
      summary: `Capture the photos needed for this ${rentalInspectionLabel}.`,
      action: 'Open the vehicle and attach photos.',
      done: 'Photos are attached or notes explain why a photo was skipped.',
      checklist: ['Front, rear, left, right', 'Interior and trunk/cargo area', 'Dashboard/odometer', 'Any damage or unusual condition'],
    },
    tires: {
      summary: 'Record tire pressures and compare them to the saved factory spec.',
      action: 'Open the tire pressure panel.',
      done: 'A tire pressure log exists or notes explain why it was skipped.',
      checklist: ['Front left', 'Front right', 'Rear left', 'Rear right', 'Flag anything low or high'],
    },
    damage: {
      summary: 'Look for new or existing damage and document it clearly.',
      action: 'Open the vehicle record and add photos/notes.',
      done: 'Damage is either documented or marked as no visible damage.',
      checklist: ['Walk around exterior', 'Check wheels/tires/glass', 'Check interior', 'Photo close-ups and context shots'],
    },
    review: {
      summary: 'Review the workflow before closing it.',
      action: 'Check every step and mark the workflow complete when satisfied.',
      done: 'Required steps are complete, skipped with notes, or marked for review.',
      checklist: ['Resolve missing required items', 'Read notes', 'Confirm vehicle context', 'Complete or continue later'],
    },
  }

  if (workflow.workflowType === 'AddVehicle') {
    const map: Record<string, { summary: string; action: string; done: string; checklist: string[] }> = {
      vin: {
        summary: 'Start by scanning or entering the VIN so the app can find or create the vehicle.',
        action: 'Scan VIN or type it, then find/create the vehicle.',
        done: 'The vehicle record exists and is open.',
        checklist: ['Dashboard VIN or door-jamb VIN', 'Confirm decoded year/make/model', 'Correct bad OCR before saving'],
      },
      vehicleBasics: {
        summary: 'Fill in the vehicle basics that VIN decode cannot know.',
        action: 'Open vehicle details.',
        done: 'Color, plate, odometer, fleet number, and notes are saved where known.',
        checklist: ['Color', 'Current odometer', 'Plate number/state', 'Fleet position number'],
      },
      licensePlate: {
        summary: 'Capture the plate and registration tab so the app can cross-check plate/state.',
        action: 'Scan the license plate.',
        done: 'Plate number, state, and visible tab info are saved or corrected.',
        checklist: ['Plate number', 'State', 'Month/year tab', 'Photo attached'],
      },
      registration: {
        summary: 'Scan the registration document and verify VIN, plate, state, and expiration.',
        action: 'Scan registration.',
        done: 'Registration record is saved and the checks look right.',
        checklist: ['VIN', 'Plate/state', 'Expiration date', 'Photo attached'],
      },
      insurance: {
        summary: 'Scan the insurance card and verify policy/provider/VIN/expiration.',
        action: 'Scan insurance.',
        done: 'Insurance record is saved. Missing plate is okay when the card does not show one.',
        checklist: ['Provider', 'Policy number', 'VIN if shown', 'Expiration date'],
      },
      lockBox: {
        summary: 'Assign a lock box to the car and confirm the combo is available.',
        action: 'Open lock box assignment.',
        done: 'A lock box is assigned or notes explain why not.',
        checklist: ['Box number', 'Combo', 'Style', 'Assignment notes'],
      },
      photosOdometer: {
        summary: 'Attach starter photos and capture the initial odometer.',
        action: 'Open vehicle photos/odometer area.',
        done: 'Starter photos and odometer are recorded.',
        checklist: ['Odometer', 'Exterior overview', 'Interior overview', 'Any notable condition'],
      },
    }

    return map[step.stepKey] ?? shared[step.stepKey] ?? shared.review
  }

  if (workflow.workflowType === 'RentalInspection') {
    const map: Record<string, { summary: string; action: string; done: string; checklist: string[] }> = {
      inspectionKind: {
        summary: `This inspection is marked ${kind || 'Pre/Post/Both'}. Confirm whether it is before a trip, after a trip, or both close together.`,
        action: 'Open the vehicle and confirm inspection context.',
        done: 'Inspection kind is correct and notes mention anything unusual about timing.',
        checklist: ['Pre means before handoff', 'Post means after return', 'Both means close enough to combine', 'Note any timing exception'],
      },
      odometerFuel: {
        summary: 'Record mileage and fuel/charge level at inspection time.',
        action: 'Open the vehicle record.',
        done: 'Odometer and fuel/charge status are recorded in notes or vehicle details.',
        checklist: ['Odometer photo', 'Fuel/charge level', 'Warning lights', 'Dashboard condition'],
      },
    }

    return map[step.stepKey] ?? shared[step.stepKey] ?? shared.review
  }

  if (workflow.workflowType === 'TechnicalCheck') {
    const map: Record<string, { summary: string; action: string; done: string; checklist: string[] }> = {
      returnIntake: {
        summary: 'Start the technical check with the vehicle context and customer-return notes.',
        action: 'Open the vehicle and review current condition.',
        done: 'Vehicle is selected and any reported issue is captured.',
        checklist: ['Vehicle selected', 'Reported issue noted', 'Mileage noted', 'Photos if useful'],
      },
      underHood: {
        summary: 'Inspect obvious under-hood issues before scanning electronics.',
        action: 'Add notes/photos on the vehicle.',
        done: 'Under-hood check is noted or marked clear.',
        checklist: ['Leaks', 'Belts/hoses', 'Oil/coolant visual', 'Loose or damaged parts'],
      },
      fluids: {
        summary: 'Check serviceable fluids and note anything low, dirty, or leaking.',
        action: 'Add notes/photos on the vehicle.',
        done: 'Fluid condition is recorded or marked clear.',
        checklist: ['Oil', 'Coolant', 'Brake fluid', 'Washer fluid', 'Transmission if applicable'],
      },
      batteryCharging: {
        summary: 'Check battery/charging symptoms and record any test result available.',
        action: 'Add notes/photos on the vehicle.',
        done: 'Battery/charging status is noted.',
        checklist: ['Battery age/condition', 'Terminals', 'Charging warning light', 'Voltage/test result if available'],
      },
      obd2Scan: {
        summary: 'Upload the RepairSolutions2/Innova PDF report so AI can summarize codes and recommended actions.',
        action: 'Upload OBD2 PDF.',
        done: 'OBD2 report is uploaded and reviewed.',
        checklist: ['Connect scanner', 'Generate PDF', 'Upload PDF', 'Review AI summary'],
      },
      idleRoadCheck: {
        summary: 'Run the car enough to notice idle, driveability, braking, steering, and warning-light issues.',
        action: 'Record notes in this workflow.',
        done: 'Road/idle check is marked clear or issues are described.',
        checklist: ['Idle quality', 'Acceleration', 'Braking', 'Steering', 'No new warning lights'],
      },
      issues: {
        summary: 'Collect any problems found and decide whether they become maintenance or damage work.',
        action: 'Record notes and mark needs review if needed.',
        done: 'Issues are either cleared, logged, or marked for review.',
        checklist: ['Maintenance issue', 'Damage issue', 'Safety issue', 'Next action'],
      },
    }

    return map[step.stepKey] ?? shared[step.stepKey] ?? shared.review
  }

  return shared[step.stepKey] ?? shared.review
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
  rentalInspectionKind,
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
  setRentalInspectionKind,
  openWorkflowVinCamera,
  recoverVinScanNow,
  continueAddVehicleVin,
  setWorkflowStepNotes,
  setObd2ReportFile,
  uploadObd2Report,
  saveWorkflowStep,
  updateWorkflowStatus,
}: WorkflowDashboardProps) {
  const guidance = selectedWorkflow && selectedWorkflowStep ? stepGuidance(selectedWorkflow, selectedWorkflowStep) : null

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
          {!selectedWorkflow && (
            <div className="workflow-guidance">
              <div>
                <span>How workflows work</span>
                <strong>Select an active workflow to review its steps. Use Continue Workflow to jump to the next task, or click a specific step to work on that item.</strong>
              </div>
              <ul>
                <li>Active workflows are work in progress.</li>
                <li>Completed workflows stay available for review.</li>
                <li>Start New creates a fresh guided process.</li>
              </ul>
            </div>
          )}
          {selectedWorkflow && (
            <>
              {selectedWorkflowStep && (
                <div ref={workflowEditorRef} className="workflow-editor">
                  <div className="section-heading compact-heading">
                    <h2>{selectedWorkflowStep.title}</h2>
                    <p>{selectedWorkflowStep.status}</p>
                  </div>
                  {guidance && (
                    <div className="workflow-guidance">
                      <div>
                        <span>Current task</span>
                        <strong>{guidance.summary}</strong>
                      </div>
                      <div>
                        <span>What to do</span>
                        <strong>{guidance.action}</strong>
                      </div>
                      <div>
                        <span>Done when</span>
                        <strong>{guidance.done}</strong>
                      </div>
                      <ul>
                        {guidance.checklist.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
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
                {selectedWorkflow.steps.map((step, index) => (
                  <button
                    key={step.id}
                    className={selectedWorkflowStepKey === step.stepKey ? 'workflow-step selected' : 'workflow-step'}
                    type="button"
                    onClick={() => activateWorkflowStep(selectedWorkflow, step)}
                  >
                    <strong>{step.title}</strong>
                    <span>Step {index + 1} of {selectedWorkflow.steps.length} - {step.status}</span>
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
          {workflowCatalog.map(([workflowType, title, detail]) =>
            workflowType === 'RentalInspection' ? (
              <div key={workflowType} className="workflow-card workflow-card-with-control">
                <strong>{title}</strong>
                <span>{detail}</span>
                <select value={rentalInspectionKind} onChange={(event) => setRentalInspectionKind(event.target.value)} disabled={loading}>
                  <option value="Pre">Pre</option>
                  <option value="Post">Post</option>
                  <option value="Both">Both</option>
                </select>
                <button type="button" disabled={loading} onClick={() => startWorkflow(workflowType)}>
                  Start {rentalInspectionKind}
                </button>
              </div>
            ) : (
              <button key={workflowType} className="workflow-card" type="button" disabled={loading} onClick={() => startWorkflow(workflowType)}>
                <strong>{title}</strong>
                <span>{detail}</span>
              </button>
            ),
          )}
        </div>
      </section>
    </>
  )
}
