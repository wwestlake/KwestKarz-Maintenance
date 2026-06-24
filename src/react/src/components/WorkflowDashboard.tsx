import type { RefObject } from 'react'
import type { WorkflowEvent, WorkflowInstance, WorkflowStep } from '../types'

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
  workflowReceiptFile: File | null
  workflowReceiptInsight: string
  workflowReceiptDocumentId: string | null
  damageEstimateAmount: string
  damageEstimateVendor: string
  damageRepairStatus: string
  workflowEditorRef: RefObject<HTMLDivElement | null>
  startWorkflow: (workflowType: string) => void
  selectWorkflow: (workflow: WorkflowInstance) => void
  activateWorkflowStep: (workflow: WorkflowInstance, step: WorkflowStep) => void
  setVin: (vin: string) => void
  setRentalInspectionKind: (kind: string) => void
  openWorkflowVinCamera: () => void
  recoverVinScanNow: () => void
  continueAddVehicleVin: () => void
  setWorkflowStepNotes: (notes: string) => void
  setObd2ReportFile: (file: File | null) => void
  uploadObd2Report: () => void
  setWorkflowReceiptFile: (file: File | null) => void
  readWorkflowReceipt: () => void
  setDamageEstimateAmount: (v: string) => void
  setDamageEstimateVendor: (v: string) => void
  setDamageRepairStatus: (v: string) => void
  workflowEvents: WorkflowEvent[]
  saveWorkflowStep: (status: string) => void
  updateWorkflowStatus: (status: string) => void
}

function stepGuidance(workflow: WorkflowInstance, step: WorkflowStep): { summary: string; checklist: string[] } {
  const kind = workflow.steps
    .map((s) => s.data?.inspectionKind)
    .find((v): v is string => typeof v === 'string' && v.length > 0) ?? ''
  const rentalLabel = kind ? `${kind.toLowerCase()} rental inspection` : 'rental inspection'

  const shared: Record<string, { summary: string; checklist: string[] }> = {
    vehicle: { summary: 'Confirm the correct vehicle is selected before recording inspection or maintenance details.', checklist: ['Confirm VIN or fleet vehicle', 'Check odometer', 'Check plate/lock box context'] },
    photos: { summary: `Capture the required condition photos for this ${rentalLabel}.`, checklist: ['Front, rear, left, right', 'Interior and trunk', 'Dashboard/odometer', 'Any damage'] },
    tires: { summary: 'Record tire pressures and compare to the saved factory spec.', checklist: ['Front left', 'Front right', 'Rear left', 'Rear right'] },
    damage: { summary: 'Look for new or existing damage and document it clearly.', checklist: ['Walk around exterior', 'Check wheels/glass', 'Check interior', 'Photo close-ups'] },
    review: { summary: 'Review all steps before closing the workflow.', checklist: ['Resolve missing items', 'Confirm vehicle context', 'Complete or continue later'] },
  }

  const addVehicleMap: Record<string, { summary: string; checklist: string[] }> = {
    vin: { summary: 'Scan or enter the VIN so the app can find or create the vehicle record.', checklist: ['Dashboard or door-jamb VIN', 'Confirm decoded year/make/model', 'Correct bad OCR before saving'] },
    vehicleBasics: { summary: 'Fill in the details VIN decode cannot know: color, plate, odometer, fleet number.', checklist: ['Color', 'Current odometer', 'Plate number/state', 'Fleet position number'] },
    licensePlate: { summary: 'Capture the plate and registration tab so the app can cross-check plate and state.', checklist: ['Plate number', 'State', 'Month/year tab', 'Photo attached'] },
    registration: { summary: 'Scan the registration document and verify VIN, plate, state, and expiration.', checklist: ['VIN', 'Plate/state', 'Expiration date', 'Photo attached'] },
    insurance: { summary: 'Scan the insurance card and verify policy, provider, VIN, and expiration.', checklist: ['Provider', 'Policy number', 'VIN if shown', 'Expiration date'] },
    lockBox: { summary: 'Assign a lock box to this vehicle and confirm the combo is available.', checklist: ['Box number', 'Combo', 'Style', 'Assignment notes'] },
    photosOdometer: { summary: 'Attach starter photos and capture the initial odometer reading.', checklist: ['Odometer', 'Exterior overview', 'Interior overview', 'Notable condition'] },
  }

  const rentalMap: Record<string, { summary: string; checklist: string[] }> = {
    inspectionKind: { summary: `Confirm whether this is a pre-trip, post-trip, or combined inspection — currently marked ${kind || 'Pre/Post/Both'}.`, checklist: ['Pre = before handoff', 'Post = after return', 'Both = close together', 'Note timing exceptions'] },
    odometerFuel: { summary: 'Record mileage and fuel/charge level at the time of inspection.', checklist: ['Odometer photo', 'Fuel/charge level', 'Warning lights', 'Dashboard condition'] },
  }

  const technicalMap: Record<string, { summary: string; checklist: string[] }> = {
    returnIntake: { summary: 'Start with vehicle context and any customer-reported issues.', checklist: ['Vehicle selected', 'Reported issue noted', 'Mileage noted', 'Photos if useful'] },
    underHood: { summary: 'Inspect obvious under-hood issues before scanning electronics.', checklist: ['Leaks', 'Belts/hoses', 'Oil/coolant visual', 'Loose parts'] },
    fluids: { summary: 'Check serviceable fluids and note anything low, dirty, or leaking.', checklist: ['Oil', 'Coolant', 'Brake fluid', 'Washer fluid'] },
    batteryCharging: { summary: 'Check battery and charging symptoms and record any test result.', checklist: ['Battery age/condition', 'Terminals', 'Charging warning light', 'Voltage if available'] },
    obd2Scan: { summary: 'Upload the RepairSolutions2/Innova PDF so AI can summarize codes and recommended actions.', checklist: ['Connect scanner', 'Generate PDF', 'Upload PDF', 'Review AI summary'] },
    idleRoadCheck: { summary: 'Run the car enough to check idle, driveability, braking, steering, and warning lights.', checklist: ['Idle quality', 'Acceleration', 'Braking', 'Steering', 'No new lights'] },
    issues: { summary: 'Collect problems found and decide if they become maintenance or damage work.', checklist: ['Maintenance issue', 'Damage issue', 'Safety issue', 'Next action'] },
  }

  const maintenanceMap: Record<string, { summary: string; checklist: string[] }> = {
    service: { summary: 'Log the maintenance event: type, date, mileage, cost, and who performed it.', checklist: ['Type', 'Date', 'Odometer', 'Cost', 'Performed by'] },
    receipt: { summary: 'Upload a receipt or invoice photo and read it with AI to capture cost and date.', checklist: ['Photo of receipt', 'AI read for cost/date', 'Correct OCR errors', 'Attach to record'] },
    followUp: { summary: 'Record when the next service is due by date or mileage so alerts can fire.', checklist: ['Next due date', 'Next due mileage', 'Manufacturer recommendation'] },
  }

  const damageMap: Record<string, { summary: string; checklist: string[] }> = {
    estimate: { summary: 'Record the damage estimate: amount, shop or adjuster, and who is handling it.', checklist: ['Estimate amount', 'Shop or adjuster name', 'Insurance claim if applicable', 'Damage photos'] },
    repair: { summary: 'Track repair status: in progress, complete, or deferred.', checklist: ['Repair status', 'Completion date if done', 'Deferred reason if not', 'Final cost vs estimate'] },
  }

  const complianceMap: Record<string, { summary: string; checklist: string[] }> = {
    registration: { summary: 'Scan the updated registration and verify VIN, plate, state, and expiration.', checklist: ['VIN matches vehicle', 'Plate/state', 'Expiration date', 'Photo attached'] },
    insurance: { summary: 'Scan the renewed insurance card and verify policy, provider, VIN, and expiration.', checklist: ['Provider name', 'Policy number', 'VIN if shown', 'Expiration date'] },
    plate: { summary: 'Update the license plate record if the plate or state changed during renewal.', checklist: ['Plate number', 'State', 'Month/year tab', 'Photo attached'] },
  }

  const map =
    workflow.workflowType === 'AddVehicle' ? addVehicleMap :
    workflow.workflowType === 'RentalInspection' ? rentalMap :
    workflow.workflowType === 'TechnicalCheck' ? technicalMap :
    workflow.workflowType === 'MaintenanceIntake' ? maintenanceMap :
    workflow.workflowType === 'DamageReview' ? damageMap :
    workflow.workflowType === 'ComplianceRenewal' ? complianceMap :
    {}

  return map[step.stepKey] ?? shared[step.stepKey] ?? shared.review
}

function stepIcon(status: string, isCurrent: boolean) {
  if (status === 'Complete') return '✓'
  if (status === 'NeedsReview') return '!'
  if (isCurrent || status === 'InProgress') return '●'
  return '○'
}

function stepClass(status: string, isCurrent: boolean) {
  if (status === 'Complete') return 'wf-step complete'
  if (status === 'NeedsReview') return 'wf-step needs-review'
  if (isCurrent || status === 'InProgress') return 'wf-step active'
  return 'wf-step'
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
  workflowReceiptFile,
  workflowReceiptInsight,
  workflowReceiptDocumentId,
  damageEstimateAmount,
  damageEstimateVendor,
  damageRepairStatus,
  workflowEditorRef,
  startWorkflow,
  selectWorkflow,
  activateWorkflowStep,
  setVin,
  setRentalInspectionKind,
  openWorkflowVinCamera,
  recoverVinScanNow,
  continueAddVehicleVin,
  setWorkflowStepNotes,
  setObd2ReportFile,
  uploadObd2Report,
  setWorkflowReceiptFile,
  readWorkflowReceipt,
  setDamageEstimateAmount,
  setDamageEstimateVendor,
  setDamageRepairStatus,
  workflowEvents,
  saveWorkflowStep,
  updateWorkflowStatus,
}: WorkflowDashboardProps) {
  const completedSteps = selectedWorkflow?.steps.filter((s) => s.status === 'Complete').length ?? 0
  const totalSteps = selectedWorkflow?.steps.length ?? 0
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  const guidance = selectedWorkflow && selectedWorkflowStep
    ? stepGuidance(selectedWorkflow, selectedWorkflowStep)
    : null

  const isMaintenanceReceiptStep = selectedWorkflow?.workflowType === 'MaintenanceIntake' && selectedWorkflowStep?.stepKey === 'receipt'
  const isDamageEstimateStep = selectedWorkflow?.workflowType === 'DamageReview' && selectedWorkflowStep?.stepKey === 'estimate'
  const isDamageRepairStep = selectedWorkflow?.workflowType === 'DamageReview' && selectedWorkflowStep?.stepKey === 'repair'

  return (
    <>
      {/* ── Start New ─────────────────────────────────────────────────────── */}
      <section className="panel wf-start-panel">
        <div className="section-heading">
          <h2>Start Workflow</h2>
          <p>{workflowCatalog.length} types</p>
        </div>
        <div className="wf-catalog">
          {workflowCatalog.map(([workflowType, title, detail]) =>
            workflowType === 'RentalInspection' ? (
              <div key={workflowType} className="wf-catalog-card wf-catalog-card--control">
                <div className="wf-catalog-card-body">
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </div>
                <div className="wf-catalog-card-action">
                  <select
                    value={rentalInspectionKind}
                    onChange={(e) => setRentalInspectionKind(e.target.value)}
                    disabled={loading}
                  >
                    <option value="Pre">Pre-trip</option>
                    <option value="Post">Post-trip</option>
                    <option value="Both">Both</option>
                  </select>
                  <button type="button" disabled={loading} onClick={() => startWorkflow(workflowType)}>
                    Start {rentalInspectionKind}
                  </button>
                </div>
              </div>
            ) : (
              <button
                key={workflowType}
                className="wf-catalog-card"
                type="button"
                disabled={loading}
                onClick={() => startWorkflow(workflowType)}
              >
                <div className="wf-catalog-card-body">
                  <strong>{title}</strong>
                  <span>{detail}</span>
                </div>
              </button>
            )
          )}
        </div>
      </section>

      {/* ── Main area: sidebar + detail ──────────────────────────────────── */}
      <div className="wf-main">

        {/* Sidebar */}
        <div className="panel wf-sidebar">
          <div className="section-heading">
            <h2>Active</h2>
            <span className="tag">{activeWorkflows.length}</span>
          </div>
          <div className="wf-list">
            {activeWorkflows.length === 0 && (
              <p className="empty">No active workflows. Start one above.</p>
            )}
            {activeWorkflows.map((wf) => {
              const done = wf.steps.filter((s) => s.status === 'Complete').length
              const total = wf.steps.length
              const currentTitle = wf.steps.find((s) => s.stepKey === wf.currentStepKey)?.title ?? wf.currentStepKey
              return (
                <button
                  key={wf.id}
                  className={selectedWorkflowId === wf.id ? 'wf-list-item selected' : 'wf-list-item'}
                  type="button"
                  onClick={() => selectWorkflow(wf)}
                >
                  <span className="wf-list-title">{wf.title}</span>
                  <span className="wf-list-meta">{currentTitle}</span>
                  <div className="wf-mini-progress">
                    <div className="wf-mini-bar" style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }} />
                  </div>
                  <span className="wf-list-count">{done}/{total} steps</span>
                </button>
              )
            })}
          </div>

          {completedWorkflows.length > 0 && (
            <details className="wf-completed-section">
              <summary>Completed ({completedWorkflows.length})</summary>
              <div className="wf-list wf-list--completed">
                {completedWorkflows.slice(0, 10).map((wf) => (
                  <button
                    key={wf.id}
                    className={selectedWorkflowId === wf.id ? 'wf-list-item selected' : 'wf-list-item'}
                    type="button"
                    onClick={() => selectWorkflow(wf)}
                  >
                    <span className="wf-list-title">{wf.title}</span>
                    <span className="wf-list-meta">
                      {wf.completedAt ? new Date(wf.completedAt).toLocaleDateString() : 'Completed'} · {wf.steps.length} steps
                    </span>
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>

        {/* Detail panel */}
        <div className="panel wf-detail">
          {!selectedWorkflow && (
            <div className="wf-empty-state">
              <p className="wf-empty-headline">No workflow selected</p>
              <p className="empty">Pick an active workflow from the list, or start a new one above.</p>
            </div>
          )}

          {selectedWorkflow && (
            <>
              {/* Header */}
              <div className="wf-detail-header">
                <div>
                  <h2 className="wf-detail-title">{selectedWorkflow.title}</h2>
                  <p className="wf-detail-meta">
                    {completedSteps} of {totalSteps} steps complete · {selectedWorkflow.status}
                  </p>
                </div>
                <span className="wf-progress-pct">{progressPct}%</span>
              </div>

              {/* Progress bar */}
              <div className="wf-progress-track" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
                <div className="wf-progress-fill" style={{ width: `${progressPct}%` }} />
              </div>

              {/* Step pills */}
              <div className="wf-steps" ref={workflowEditorRef}>
                {selectedWorkflow.steps.map((step, idx) => {
                  const isCurrent = step.stepKey === selectedWorkflowStepKey
                  return (
                    <button
                      key={step.id}
                      className={stepClass(step.status, isCurrent)}
                      type="button"
                      title={`Step ${idx + 1}: ${step.title} — ${step.status}`}
                      onClick={() => activateWorkflowStep(selectedWorkflow, step)}
                    >
                      <span className="wf-step-icon" aria-hidden="true">{stepIcon(step.status, isCurrent)}</span>
                      <span>{step.title}</span>
                    </button>
                  )
                })}
              </div>

              {/* Step editor */}
              {selectedWorkflowStep && (
                <div className="wf-step-editor">
                  <div className="wf-step-editor-heading">
                    <h3>{selectedWorkflowStep.title}</h3>
                    <span className={`wf-step-status-badge wf-step-status-${selectedWorkflowStep.status.toLowerCase()}`}>
                      {selectedWorkflowStep.status}
                    </span>
                  </div>

                  {guidance && (
                    <p className="wf-step-guidance">{guidance.summary}</p>
                  )}

                  {guidance && guidance.checklist.length > 0 && (
                    <ul className="wf-checklist">
                      {guidance.checklist.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}

                  {/* VIN step */}
                  {isAddVehicleVinStep && (
                    <div className="wf-step-input-group">
                      <label>
                        <span>VIN</span>
                        <input
                          value={vin}
                          onChange={(e) => setVin(e.target.value.toUpperCase())}
                          placeholder="Scan or enter VIN"
                          autoCapitalize="characters"
                        />
                      </label>
                      <div className="wf-step-actions">
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
                    </div>
                  )}

                  {/* OBD2 step */}
                  {selectedWorkflowStep.stepKey === 'obd2Scan' && (
                    <div className="wf-step-input-group">
                      <label>
                        <span>RepairSolutions2 / Innova PDF</span>
                        <input type="file" accept="application/pdf,.pdf" onChange={(e) => setObd2ReportFile(e.target.files?.[0] ?? null)} />
                      </label>
                      <div className="wf-step-actions">
                        <button className="secondary-button" type="button" disabled={!obd2ReportFile || loading} onClick={uploadObd2Report}>
                          Read OBD2 Report
                        </button>
                        {selectedWorkflowStepDocumentId && (
                          <a className="secondary-button" href={`/api/documents/${selectedWorkflowStepDocumentId}/content`} target="_blank" rel="noreferrer">
                            View PDF
                          </a>
                        )}
                      </div>
                      {(obd2ReportInsight || selectedWorkflowStepAiText) && (
                        <pre className="receipt-insight">{obd2ReportInsight || selectedWorkflowStepAiText}</pre>
                      )}
                    </div>
                  )}

                  {/* Maintenance receipt step */}
                  {isMaintenanceReceiptStep && (
                    <div className="wf-step-input-group">
                      <label>
                        <span>Receipt / Invoice Photo</span>
                        <input type="file" accept="image/*" onChange={(e) => setWorkflowReceiptFile(e.target.files?.[0] ?? null)} />
                      </label>
                      <div className="wf-step-actions">
                        <button className="secondary-button" type="button" disabled={!workflowReceiptFile || loading} onClick={readWorkflowReceipt}>
                          Read &amp; Store Receipt
                        </button>
                        {workflowReceiptDocumentId && (
                          <a className="secondary-button" href={`/api/documents/${workflowReceiptDocumentId}/content`} target="_blank" rel="noreferrer">
                            View Receipt
                          </a>
                        )}
                      </div>
                      {workflowReceiptInsight && (
                        <pre className="receipt-insight">{workflowReceiptInsight}</pre>
                      )}
                    </div>
                  )}

                  {/* Damage estimate step */}
                  {isDamageEstimateStep && (
                    <div className="wf-step-input-group">
                      <label>
                        <span>Estimate Amount ($)</span>
                        <input inputMode="decimal" value={damageEstimateAmount} onChange={(e) => setDamageEstimateAmount(e.target.value)} placeholder="0.00" />
                      </label>
                      <label>
                        <span>Shop / Adjuster</span>
                        <input value={damageEstimateVendor} onChange={(e) => setDamageEstimateVendor(e.target.value)} placeholder="Shop name or adjuster" />
                      </label>
                    </div>
                  )}

                  {/* Damage repair step */}
                  {isDamageRepairStep && (
                    <div className="wf-step-input-group">
                      <label>
                        <span>Repair Status</span>
                        <select value={damageRepairStatus} onChange={(e) => setDamageRepairStatus(e.target.value)}>
                          <option value="Pending">Pending</option>
                          <option value="InProgress">In Progress</option>
                          <option value="Complete">Complete</option>
                          <option value="Deferred">Deferred</option>
                        </select>
                      </label>
                    </div>
                  )}

                  {/* Notes (all non-VIN steps) */}
                  {!isAddVehicleVinStep && (
                    <label className="wf-notes-label">
                      <span>Notes</span>
                      <textarea
                        value={workflowStepNotes}
                        onChange={(e) => setWorkflowStepNotes(e.target.value)}
                        placeholder="Add notes for this step…"
                      />
                    </label>
                  )}

                  {/* Step actions */}
                  <div className="wf-step-actions wf-step-actions--primary">
                    {!isAddVehicleVinStep && (
                      <button
                        className="primary-action"
                        type="button"
                        disabled={loading}
                        onClick={() => activateWorkflowStep(selectedWorkflow, selectedWorkflowStep)}
                      >
                        Go Do It
                      </button>
                    )}
                    <button type="button" disabled={loading} onClick={() => saveWorkflowStep('Complete')}>
                      Mark Done
                    </button>
                    <button className="secondary-button" type="button" disabled={loading} onClick={() => saveWorkflowStep('InProgress')}>
                      Save Draft
                    </button>
                    <button className="secondary-button" type="button" disabled={loading} onClick={() => saveWorkflowStep('NeedsReview')}>
                      Flag for Review
                    </button>
                  </div>
                </div>
              )}

              {/* Workflow-level actions */}
              <div className="wf-workflow-actions">
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
      </div>

      {/* Event timeline */}
      {workflowEvents.length > 0 && (
        <section className="panel area-panel">
          <div className="section-heading">
            <h2>Event Timeline</h2>
            <span className="tag">{workflowEvents.length} events</span>
          </div>
          <ol className="workflow-timeline">
            {workflowEvents.map((event) => (
              <li key={event.id} className="timeline-event">
                <span className="timeline-time">
                  {new Date(event.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className={`timeline-type event-type-${event.eventType.toLowerCase()}`}>{event.eventType}</span>
                {event.stepKey && <span className="timeline-step">{event.stepKey}</span>}
                {event.message && <span className="timeline-message">{event.message}</span>}
                {event.createdBy && <span className="audit-meta">by {event.createdBy}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  )
}
