import { useEffect, useState } from 'react'
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
  obd2ReportUrl: string
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
  jumpToStep: (workflow: WorkflowInstance, step: WorkflowStep) => void
  pauseAndExit: () => void
  setVin: (vin: string) => void
  setRentalInspectionKind: (kind: string) => void
  openWorkflowVinCamera: () => void
  recoverVinScanNow: () => void
  continueAddVehicleVin: () => void
  setWorkflowStepNotes: (notes: string) => void
  setObd2ReportFile: (file: File | null) => void
  uploadObd2Report: () => void
  setObd2ReportUrl: (url: string) => void
  uploadObd2ReportFromUrl: () => void
  setWorkflowReceiptFile: (file: File | null) => void
  readWorkflowReceipt: () => void
  setDamageEstimateAmount: (v: string) => void
  setDamageEstimateVendor: (v: string) => void
  setDamageRepairStatus: (v: string) => void
  workflowEvents: WorkflowEvent[]
  saveWorkflowStep: (status: string) => void
  updateWorkflowStatus: (status: string) => void
}

// Steps that require the user to navigate to another area to complete them
const NAVIGATE_STEPS = new Set([
  'vehicle', 'vehicleBasics', 'licensePlate', 'photos', 'photosOdometer',
  'odometerFuel', 'returnState', 'inspectionKind', 'registration', 'insurance',
  'plate', 'tires',
])

function stepGuidance(workflow: WorkflowInstance, step: WorkflowStep): { summary: string; checklist: string[] } {
  const kind = workflow.steps
    .map((s) => s.data?.inspectionKind)
    .find((v): v is string => typeof v === 'string' && v.length > 0) ?? ''
  const rentalLabel = kind ? `${kind.toLowerCase()} inspection` : 'inspection'

  const shared: Record<string, { summary: string; checklist: string[] }> = {
    vehicle: { summary: 'Make sure you have the right car selected before you continue.', checklist: ['VIN or fleet number matches', 'Odometer looks right', 'Plate matches'] },
    photos: { summary: `Walk around the car and take the required photos for this ${rentalLabel}.`, checklist: ['Front of car', 'Rear of car', 'Driver side', 'Passenger side', 'Inside and trunk', 'Dashboard and odometer', 'Any damage'] },
    tires: { summary: 'Check the air pressure in all four tires and write down the numbers.', checklist: ['Front left', 'Front right', 'Rear left', 'Rear right'] },
    damage: { summary: 'Walk all the way around the car. Look for scratches, dents, or broken parts. Take close-up photos of everything you find.', checklist: ['Walk the whole outside', 'Check wheels and glass', 'Check inside the car', 'Photo every problem'] },
    review: { summary: 'Look over everything before you finish. Make sure all steps are done.', checklist: ['All steps filled in', 'Vehicle is selected', 'Photos attached if needed'] },
  }

  const addVehicleMap: Record<string, { summary: string; checklist: string[] }> = {
    vin: { summary: 'Find the VIN sticker. Open the driver door and look at the metal frame where the door latches — the sticker with 17 letters and numbers is usually there. You can also check the dashboard near the windshield. Take a clear photo or type it in below.', checklist: ['Found the VIN sticker', 'All 17 characters are visible', 'Year, make, and model look right after scanning'] },
    vehicleBasics: { summary: 'Fill in the details about this car that are not on the VIN sticker. You need the color, the license plate, and how many miles are on it right now.', checklist: ['Color of the car', 'Miles on odometer right now', 'License plate number', 'License plate state', 'Fleet position number'] },
    licensePlate: { summary: 'Take a photo of the license plate. Make sure you can read the plate number and see the registration sticker showing the month and year.', checklist: ['Plate number is readable', 'State is visible', 'Month and year sticker in the photo'] },
    registration: { summary: 'Find the registration card — it is usually in the glove box. Scan it. Make sure the VIN and plate number match this car.', checklist: ['VIN on document matches the car', 'Plate and state match', 'Expiration date is visible', 'Photo attached'] },
    insurance: { summary: 'Find the insurance card for this car. Scan it. Make sure the policy number, company name, and expiration date are readable.', checklist: ['Insurance company name', 'Policy number', 'VIN if shown', 'Expiration date'] },
    lockBox: { summary: 'Pick a lock box for this car and record the combo. The lock box stays on the car so renters can pick up the key without you being there.', checklist: ['Box number', 'Combo code', 'Style of lock box', 'Test it before attaching'] },
    photosOdometer: { summary: 'Take starter photos of the car so you have a record of how it looked when it joined the fleet. Get a clear shot of the odometer reading.', checklist: ['Odometer reading', 'Outside of the car', 'Inside the car', 'Note anything unusual'] },
  }

  const rentalMap: Record<string, { summary: string; checklist: string[] }> = {
    inspectionKind: { summary: 'Is this a pre-trip check (before the renter gets the car) or a post-trip check (after they return it)?', checklist: ['Pre = before handing over to renter', 'Post = after renter returns the car', 'Both = if doing pre and post close together'] },
    odometerFuel: { summary: 'Write down the mileage and the fuel or charge level right now. Take a photo of the dashboard.', checklist: ['Odometer photo', 'Fuel or charge level', 'Any warning lights on', 'Dashboard condition'] },
  }

  const technicalMap: Record<string, { summary: string; checklist: string[] }> = {
    returnIntake: { summary: 'Start by picking the right car and writing down any problems the customer reported.', checklist: ['Correct car is selected', 'Customer complaint written in notes', 'Mileage noted', 'Photos if useful'] },
    underHood: { summary: 'Open the hood and look for anything obvious — leaks, broken parts, loose wires. No tools needed, just your eyes.', checklist: ['Any leaks dripping', 'Belts and hoses look okay', 'Nothing loose or broken', 'Oil and coolant look okay visually'] },
    fluids: { summary: 'Check the fluid levels under the hood. Each one has a dipstick or a clear tank with MIN and MAX lines.', checklist: ['Engine oil', 'Coolant', 'Brake fluid', 'Washer fluid'] },
    batteryCharging: { summary: 'Check if the battery looks old or corroded. Note any charging or battery warning lights on the dashboard.', checklist: ['Battery terminals are clean', 'No cracks or swelling', 'Battery warning light status', 'Voltage if you have a tester'] },
    obd2Scan: { summary: 'Plug the Innova scanner into the port under the dashboard on the driver side. Run a scan and export the report. Paste the shared link here — the app will download and read it for you.', checklist: ['Plug scanner in and run scan', 'Export or share the report', 'Paste the link or upload the PDF', 'Read the AI summary below'] },
    idleRoadCheck: { summary: 'Start the car and listen at idle. Then drive it briefly to check that acceleration, brakes, and steering all feel normal.', checklist: ['Idle sounds smooth', 'Acceleration feels normal', 'Brakes work properly', 'Steering responds well', 'No new warning lights'] },
    issues: { summary: 'Write down every problem you found. For each one, decide if it needs a maintenance job or a damage review.', checklist: ['Every problem listed in notes', 'Maintenance issues flagged', 'Damage issues flagged', 'Safety issues flagged', 'Next action decided'] },
  }

  const maintenanceMap: Record<string, { summary: string; checklist: string[] }> = {
    service: { summary: 'Write down what service was done, when it was done, the mileage, how much it cost, and who did the work.', checklist: ['Type of service', 'Date it was done', 'Mileage at service', 'Total cost', 'Who did the work'] },
    receipt: { summary: 'Take a photo of the receipt or invoice from the shop. Upload it and the app will try to read the cost and date for you.', checklist: ['Clear photo of the receipt', 'Upload and tap Read Receipt', 'Check that cost and date look right', 'Attached to this record'] },
    followUp: { summary: 'When is the next service due? Enter the date or mileage — whichever comes first. The app will remind you before it is overdue.', checklist: ['Next due date', 'Next due mileage', 'Use the manufacturer recommendation if unsure'] },
  }

  const damageMap: Record<string, { summary: string; checklist: string[] }> = {
    estimate: { summary: 'Get a repair estimate from a shop or insurance adjuster. Enter the amount and who gave it, then attach damage photos.', checklist: ['Estimate dollar amount', 'Shop or adjuster name', 'Insurance claim number if applicable', 'Damage photos attached'] },
    repair: { summary: 'Track where the repair stands right now.', checklist: ['Current repair status', 'Date finished if complete', 'Reason if deferred', 'Final cost vs estimate'] },
  }

  const complianceMap: Record<string, { summary: string; checklist: string[] }> = {
    registration: { summary: 'Scan the new registration card. Make sure the VIN, plate number, state, and expiration date all match this car.', checklist: ['VIN matches the car', 'Plate and state match', 'Expiration date readable', 'Photo attached'] },
    insurance: { summary: 'Scan the renewed insurance card. Check that the policy number, company name, VIN, and expiration date are correct.', checklist: ['Company name', 'Policy number', 'VIN if shown', 'Expiration date'] },
    plate: { summary: 'If the license plate or state changed during renewal, update it here.', checklist: ['New plate number', 'State', 'Month and year sticker', 'Photo of new plate'] },
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

function stepIcon(status: string) {
  if (status === 'Complete') return '✓'
  if (status === 'NeedsReview') return '!'
  if (status === 'InProgress') return '●'
  return '○'
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
  obd2ReportUrl,
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
  jumpToStep,
  pauseAndExit,
  setVin,
  setRentalInspectionKind,
  openWorkflowVinCamera,
  recoverVinScanNow,
  continueAddVehicleVin,
  setWorkflowStepNotes,
  setObd2ReportFile,
  uploadObd2Report,
  setObd2ReportUrl,
  uploadObd2ReportFromUrl,
  setWorkflowReceiptFile,
  readWorkflowReceipt,
  setDamageEstimateAmount,
  setDamageEstimateVendor,
  setDamageRepairStatus,
  workflowEvents,
  saveWorkflowStep,
  updateWorkflowStatus,
}: WorkflowDashboardProps) {
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({})
  const [showStartNew, setShowStartNew] = useState(false)

  useEffect(() => { setCheckedItems({}) }, [selectedWorkflowStepKey])

  const isWizardMode = !!selectedWorkflow && !!selectedWorkflowStep

  const sortedSteps = selectedWorkflow
    ? selectedWorkflow.steps.slice().sort((a, b) => a.sortOrder - b.sortOrder)
    : []
  const currentStepIdx = sortedSteps.findIndex((s) => s.stepKey === selectedWorkflowStepKey)
  const prevStep = currentStepIdx > 0 ? sortedSteps[currentStepIdx - 1] : null
  const nextStep = currentStepIdx < sortedSteps.length - 1 ? sortedSteps[currentStepIdx + 1] : null
  const completedSteps = selectedWorkflow?.steps.filter((s) => s.status === 'Complete').length ?? 0
  const totalSteps = selectedWorkflow?.steps.length ?? 0
  const progressPct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0

  const guidance = selectedWorkflow && selectedWorkflowStep
    ? stepGuidance(selectedWorkflow, selectedWorkflowStep)
    : null

  const isMaintenanceReceiptStep = selectedWorkflow?.workflowType === 'MaintenanceIntake' && selectedWorkflowStep?.stepKey === 'receipt'
  const isDamageEstimateStep = selectedWorkflow?.workflowType === 'DamageReview' && selectedWorkflowStep?.stepKey === 'estimate'
  const isDamageRepairStep = selectedWorkflow?.workflowType === 'DamageReview' && selectedWorkflowStep?.stepKey === 'repair'
  const navigatesAway = !!selectedWorkflowStep && NAVIGATE_STEPS.has(selectedWorkflowStep.stepKey)

  // ── WIZARD MODE ────────────────────────────────────────────────────────────
  if (isWizardMode && selectedWorkflow && selectedWorkflowStep) {
    return (
      <div className="wf-wiz" ref={workflowEditorRef}>

        {/* Top bar */}
        <div className="wf-wiz-header">
          <div className="wf-wiz-header-left">
            <span className="wf-wiz-title">{selectedWorkflow.title}</span>
            <span className="wf-wiz-step-count">Step {currentStepIdx + 1} of {totalSteps}</span>
          </div>
          <button className="wf-wiz-pause" type="button" disabled={loading} onClick={pauseAndExit}>
            ✕ Pause &amp; Exit
          </button>
        </div>

        {/* Step dots */}
        <div className="wf-wiz-dots">
          {sortedSteps.map((step) => (
            <button
              key={step.id}
              type="button"
              className={[
                'wf-wiz-dot',
                step.status === 'Complete' ? 'wf-wiz-dot--done' : '',
                step.stepKey === selectedWorkflowStepKey ? 'wf-wiz-dot--current' : '',
                step.status === 'NeedsReview' ? 'wf-wiz-dot--review' : '',
              ].filter(Boolean).join(' ')}
              title={`${step.title} — ${step.status}`}
              onClick={() => jumpToStep(selectedWorkflow, step)}
              disabled={loading}
            />
          ))}
          <span className="wf-wiz-pct">{progressPct}%</span>
        </div>

        {/* Body */}
        <div className="wf-wiz-body">
          {/* Step title */}
          <div className="wf-wiz-step-heading">
            <h2 className="wf-wiz-step-title">{selectedWorkflowStep.title}</h2>
            <span className={`wf-wiz-status wf-wiz-status--${selectedWorkflowStep.status.toLowerCase()}`}>
              {stepIcon(selectedWorkflowStep.status)} {selectedWorkflowStep.status}
            </span>
          </div>

          {/* Instruction box */}
          {guidance && (
            <div className="wf-wiz-instruction">
              <span className="wf-wiz-instruction-label">What to do</span>
              <p className="wf-wiz-instruction-text">{guidance.summary}</p>
            </div>
          )}

          {/* Checklist */}
          {guidance && guidance.checklist.length > 0 && (
            <div className="wf-wiz-checks">
              <span className="wf-wiz-checks-label">Check each one off as you go:</span>
              {guidance.checklist.map((item) => (
                <label key={item} className="wf-wiz-check-item">
                  <input
                    type="checkbox"
                    checked={!!checkedItems[item]}
                    onChange={() => setCheckedItems((prev) => ({ ...prev, [item]: !prev[item] }))}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          )}

          {/* Step-specific inputs */}
          {isAddVehicleVinStep && (
            <div className="wf-wiz-inputs">
              <label>
                <span>VIN — 17 characters</span>
                <input
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  placeholder="Scan or type the VIN"
                  autoCapitalize="characters"
                  className="wf-wiz-vin-input"
                />
              </label>
              <div className="wf-wiz-input-actions">
                <button className="secondary-button" type="button" disabled={loading} onClick={openWorkflowVinCamera}>
                  Scan VIN with Camera
                </button>
                <button className="secondary-button" type="button" disabled={loading} onClick={recoverVinScanNow}>
                  Use Last Scan
                </button>
                <button type="button" disabled={loading || vin.trim().length < 11} onClick={continueAddVehicleVin}>
                  Find / Create Vehicle →
                </button>
              </div>
            </div>
          )}

          {selectedWorkflowStep.stepKey === 'obd2Scan' && (
            <div className="wf-wiz-inputs">
              <label>
                <span>Shared Report Link</span>
                <input
                  type="url"
                  value={obd2ReportUrl}
                  onChange={(e) => setObd2ReportUrl(e.target.value)}
                  placeholder="Paste the link to your OBD2 report PDF"
                />
              </label>
              <div className="wf-wiz-input-actions">
                <button
                  type="button"
                  disabled={!obd2ReportUrl.trim() || loading}
                  onClick={uploadObd2ReportFromUrl}
                >
                  Fetch &amp; Read Report
                </button>
              </div>
              <details className="obd2-upload-alt">
                <summary>Upload a PDF file instead</summary>
                <div className="obd2-upload-alt-body">
                  <input type="file" accept="application/pdf,.pdf" onChange={(e) => setObd2ReportFile(e.target.files?.[0] ?? null)} />
                  <div className="wf-wiz-input-actions">
                    <button className="secondary-button" type="button" disabled={!obd2ReportFile || loading} onClick={uploadObd2Report}>
                      Read OBD2 Report
                    </button>
                    {selectedWorkflowStepDocumentId && (
                      <a className="secondary-button" href={`/api/documents/${selectedWorkflowStepDocumentId}/content`} target="_blank" rel="noreferrer">
                        View PDF
                      </a>
                    )}
                  </div>
                </div>
              </details>
              {(obd2ReportInsight || selectedWorkflowStepAiText) && (
                <pre className="receipt-insight">{obd2ReportInsight || selectedWorkflowStepAiText}</pre>
              )}
            </div>
          )}

          {isMaintenanceReceiptStep && (
            <div className="wf-wiz-inputs">
              <label>
                <span>Receipt or Invoice Photo</span>
                <input type="file" accept="image/*" onChange={(e) => setWorkflowReceiptFile(e.target.files?.[0] ?? null)} />
              </label>
              <div className="wf-wiz-input-actions">
                <button className="secondary-button" type="button" disabled={!workflowReceiptFile || loading} onClick={readWorkflowReceipt}>
                  Read &amp; Store Receipt
                </button>
                {workflowReceiptDocumentId && (
                  <a className="secondary-button" href={`/api/documents/${workflowReceiptDocumentId}/content`} target="_blank" rel="noreferrer">
                    View Receipt
                  </a>
                )}
              </div>
              {workflowReceiptInsight && <pre className="receipt-insight">{workflowReceiptInsight}</pre>}
            </div>
          )}

          {isDamageEstimateStep && (
            <div className="wf-wiz-inputs">
              <label>
                <span>Estimate Amount ($)</span>
                <input inputMode="decimal" value={damageEstimateAmount} onChange={(e) => setDamageEstimateAmount(e.target.value)} placeholder="0.00" />
              </label>
              <label>
                <span>Shop or Adjuster Name</span>
                <input value={damageEstimateVendor} onChange={(e) => setDamageEstimateVendor(e.target.value)} placeholder="Shop name or adjuster" />
              </label>
            </div>
          )}

          {isDamageRepairStep && (
            <div className="wf-wiz-inputs">
              <label>
                <span>Repair Status</span>
                <select value={damageRepairStatus} onChange={(e) => setDamageRepairStatus(e.target.value)}>
                  <option value="Pending">Waiting to start</option>
                  <option value="InProgress">In progress</option>
                  <option value="Complete">Done</option>
                  <option value="Deferred">Put on hold</option>
                </select>
              </label>
            </div>
          )}

          {/* Notes */}
          {!isAddVehicleVinStep && (
            <label className="wf-wiz-notes-label">
              <span>Notes for this step</span>
              <textarea
                value={workflowStepNotes}
                onChange={(e) => setWorkflowStepNotes(e.target.value)}
                placeholder="Write anything useful here…"
              />
            </label>
          )}

          {/* Primary actions */}
          <div className="wf-wiz-actions">
            {navigatesAway && !isAddVehicleVinStep && (
              <button
                className="wf-wiz-go-btn"
                type="button"
                disabled={loading}
                onClick={() => activateWorkflowStep(selectedWorkflow, selectedWorkflowStep)}
              >
                Go Do This Step →
              </button>
            )}
            <button
              className="wf-wiz-done-btn"
              type="button"
              disabled={loading}
              onClick={() => saveWorkflowStep('Complete')}
            >
              ✓ Mark Done
            </button>
            <div className="wf-wiz-secondary-actions">
              <button className="secondary-button" type="button" disabled={loading} onClick={() => saveWorkflowStep('InProgress')}>
                Save Draft
              </button>
              <button className="secondary-button" type="button" disabled={loading} onClick={() => saveWorkflowStep('NeedsReview')}>
                Flag for Review
              </button>
            </div>
          </div>

          {/* Workflow-level actions */}
          <div className="wf-wiz-workflow-actions">
            <button className="secondary-button" type="button" disabled={loading} onClick={() => updateWorkflowStatus('Canceled')}>
              Cancel This Workflow
            </button>
            <button className="primary-action" type="button" disabled={loading} onClick={() => updateWorkflowStatus('Complete')}>
              Complete Workflow
            </button>
          </div>
        </div>

        {/* Prev / Next */}
        <div className="wf-wiz-nav">
          <button
            type="button"
            className="secondary-button"
            disabled={!prevStep || loading}
            onClick={() => prevStep && jumpToStep(selectedWorkflow, prevStep)}
          >
            ‹ {prevStep ? prevStep.title : 'Previous'}
          </button>
          <button
            type="button"
            disabled={!nextStep || loading}
            onClick={() => nextStep && jumpToStep(selectedWorkflow, nextStep)}
          >
            {nextStep ? nextStep.title : 'Next'} ›
          </button>
        </div>

        {/* Event history */}
        {workflowEvents.length > 0 && (
          <details className="wf-wiz-timeline">
            <summary>Event history ({workflowEvents.length})</summary>
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
          </details>
        )}
      </div>
    )
  }

  // ── LIST MODE ──────────────────────────────────────────────────────────────
  return (
    <>
      {/* Start New — toggle */}
      <section className="panel wf-start-panel">
        <button className="wf-start-toggle" type="button" onClick={() => setShowStartNew((v) => !v)}>
          <span>+ Start New Workflow</span>
          <span className="wf-start-toggle-hint">{showStartNew ? 'Hide' : `${workflowCatalog.length} types`}</span>
        </button>
        {showStartNew && (
          <div className="wf-catalog">
            {workflowCatalog.map(([workflowType, title, detail]) =>
              workflowType === 'RentalInspection' ? (
                <div key={workflowType} className="wf-catalog-card wf-catalog-card--control">
                  <div className="wf-catalog-card-body">
                    <strong>{title}</strong>
                    <span>{detail}</span>
                  </div>
                  <div className="wf-catalog-card-action">
                    <select value={rentalInspectionKind} onChange={(e) => setRentalInspectionKind(e.target.value)} disabled={loading}>
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
                <button key={workflowType} className="wf-catalog-card" type="button" disabled={loading} onClick={() => startWorkflow(workflowType)}>
                  <div className="wf-catalog-card-body">
                    <strong>{title}</strong>
                    <span>{detail}</span>
                  </div>
                </button>
              )
            )}
          </div>
        )}
      </section>

      {/* Active workflow cards */}
      <section className="panel area-panel">
        <div className="section-heading">
          <h2>Active Workflows</h2>
          <span className="tag">{activeWorkflows.length}</span>
        </div>

        {activeWorkflows.length === 0 && (
          <p className="empty" style={{ padding: '24px clamp(16px,4vw,40px)' }}>
            No active workflows. Tap "+ Start New Workflow" above to begin.
          </p>
        )}

        <div className="wf-card-list">
          {activeWorkflows.map((wf) => {
            const done = wf.steps.filter((s) => s.status === 'Complete').length
            const total = wf.steps.length
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            const currentTitle = wf.steps.find((s) => s.stepKey === wf.currentStepKey)?.title ?? wf.currentStepKey
            return (
              <div key={wf.id} className={`wf-card ${wf.id === selectedWorkflowId ? 'wf-card--selected' : ''}`}>
                <div className="wf-card-body">
                  <strong className="wf-card-name">{wf.title}</strong>
                  <span className="wf-card-step">Up next: {currentTitle}</span>
                  <div className="wf-card-bar-wrap">
                    <div className="wf-card-bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="wf-card-pct">{done} of {total} steps done</span>
                </div>
                <button
                  type="button"
                  className="wf-card-resume"
                  disabled={loading}
                  onClick={() => selectWorkflow(wf)}
                >
                  Resume ›
                </button>
              </div>
            )
          })}
        </div>

        {completedWorkflows.length > 0 && (
          <details className="wf-completed-section">
            <summary>Completed workflows ({completedWorkflows.length})</summary>
            <div className="wf-card-list wf-card-list--completed">
              {completedWorkflows.slice(0, 10).map((wf) => (
                <div key={wf.id} className="wf-card">
                  <div className="wf-card-body">
                    <strong className="wf-card-name">{wf.title}</strong>
                    <span className="wf-card-step">
                      Completed {wf.completedAt ? new Date(wf.completedAt).toLocaleDateString() : ''} · {wf.steps.length} steps
                    </span>
                  </div>
                  <button type="button" className="wf-card-resume secondary-button" disabled={loading} onClick={() => selectWorkflow(wf)}>
                    View ›
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>
    </>
  )
}
