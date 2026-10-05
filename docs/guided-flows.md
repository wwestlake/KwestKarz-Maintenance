# Guided flows: New car and Inspection

Design agreed with the owner on 2026-10-04. Replaces the one-page Add Vehicle form
(`AddVehicleModal`) and the form-style workflow steps with camera-first, step-by-step
flows on the phone.

The owner's problem with the current app: "it's never clear what is to happen and how
to move on." The process is right; the screens are not. Every rule below exists to fix
that.

## Screen rules (every step of every flow)

1. **Same layout, always.** Top: `Step 4 of 11`, a progress bar, and **Exit**. Middle:
   the one thing this step is about. Bottom: one large button. Nothing moves around
   between steps.
2. **One plain question per screen.** "Scan the VIN", "Is this the right car?",
   "Coolant level". Under it, one short sentence saying exactly what to look at or do
   ("Point at the sticker in the driver door jamb.").
3. **The big button names where it goes.** "Next: tire placard", never just "Next" or
   "Submit".
4. **The button appears only when the step is satisfied.** While the camera is still
   looking there is no Next, only the shutter and "Type it instead". When the reading
   succeeds, the result shows large in green and Next appears.
5. **Fixing happens in the step.** Retake and Type it are on the same screen; the camera
   stays on; the user never leaves the step or loses their place.
6. **Choices are big buttons, not fields.** OK / Low / I topped it up. One tap; the
   chosen one is clearly highlighted.
7. **Exit is never a trap.** Progress is saved after every step (server-side draft).
   Starting the flow again on that car resumes at the same step, including after a
   phone call, a locked screen or the native camera round trip.
8. **No scrolling, no small print.** If a step doesn't fit one phone screen, it is two
   steps.
9. **Optional steps say so** in the subtitle and offer **Skip** as a secondary link; a
   skipped step shows as "Still to do" on the review screen.

Reference mockup of the three step states (camera looking, read and ready to confirm,
one check item) was shown to the owner on 2026-10-04.

### Camera steps

- Live camera opens immediately with a framing outline for the target (VIN strip,
  placard, plate, dash).
- Auto-capture when the reading succeeds (VIN barcode via the browser's barcode
  detection where available, otherwise the existing server-side VIN/AI scan); manual
  shutter always available.
- Result shown over the photo; Retake keeps the camera live.
- Fallback to the native camera input when `getUserMedia` is unavailable (existing
  behaviour), returning to the same step.

## New car (admin)

Entry: a large **New car** button on the admin's Today screen. One tap; the camera is on.

| Step | Screen question | Captures | Saves to |
|---|---|---|---|
| 1 | Scan the VIN | door-jamb barcode or windshield plate | VIN; decoded year/make/model/trim (NHTSA) shown for confirmation. If the VIN already exists: stop and offer to open that car. |
| 2 | Is this the right car? | confirmation of the decode | vehicle record created (draft) |
| 3 | Tire pressure placard | driver door-jamb placard | tire pressure spec (front/rear PSI, tire size) |
| 4 | Other labels (optional, repeatable) | paint code, trim/options sticker, under-hood emissions label; "Add another label" | documents (kind per label) + extracted values |
| 5 | License plate | plate photo | plate number and state |
| 6 | Odometer | dash photo | current odometer + date |
| 7-14 | Exterior walk-around | front, front-left, left side, rear-left, rear, rear-right, right side, front-right — car outline shows where to stand | condition photos, ordered and labelled; **Mark damage** on any photo: tap the spot, close-up, short note |
| 15 | Wheels and tires | 4 wheels, tread close-ups optional | condition photos |
| 16-20 | Interior | front seats, rear seats, dash, cargo area, headliner/carpet; Mark damage available | condition photos |
| 21 | Review | summary with thumbnails; skipped steps listed as "Still to do" | **Add to inventory** button finalizes the car |

Result: the car record plus a **dated condition record** (all photos in order, labelled,
damage marked) — the baseline for later inspections and claims.

Paperwork (registration, insurance card, lock box, Turo listing link, purchase details)
is a separate short follow-up flow ("Finish paperwork") offered from the car page, so it
never slows the walk-around.

## Inspection (routine maintenance check)

Entry: **Start inspection** on Today, or from a car's page.

| Step | Screen question | Captures | Notes |
|---|---|---|---|
| 1 | Scan the VIN | VIN (or plate) | shows the car, last inspection date and mileage, open problems |
| 2 | Engine bay | photo | |
| 3 | Oil level | dipstick photo; OK / Low / I topped it up (how much) | |
| 4 | Coolant level | reservoir photo; OK / Low / I topped it up | |
| 5 | Washer fluid | OK / Low / I filled it | |
| 6 | Anything loose? | belts, hoses, caps, battery terminals: All good / Problem (photo + note) | |
| 7-14 | Walk around for damage | each angle shows **that car's last photo from the same angle** (side by side or overlay): Same / New damage (close-up + note) | new damage opens a Damage Review |
| 15 | Tires | pressure for each tire with the car's spec PSI shown; tread OK / worn (photo) | |
| 16-18 | Interior cleanliness | front, rear, cargo: Clean / Needs cleaning / Problem + photo | |
| 19 | Dashboard | photo; reads mileage, fuel level and warning lights for confirmation | updates odometer and fuel |
| 20 | Anything else? (optional) | note, extra photos | |
| 21 | Complete inspection | summary with photos | anything Low / Problem / Needs cleaning / New damage becomes a follow-up job ("Top off coolant – Equinox ..1657"); next inspection due date set |

Result: a dated inspection history per car, photos from the same angles every time so new
damage stands out, and mileage tracked between inspections.

## Open decisions

- Problems found in an inspection: create jobs automatically (proposed above) or flag on
  the car for the admin to decide.
- Which roles may run each flow (New car: admin; Inspection: admin, manager, worker?).

## Building on what exists

- Workflow engine (`WorkflowEndpoints.fs`: workflow instances, steps, statuses) for the
  server-side draft and resume.
- VIN scan and decode (`VinEndpoints`, `VinDecodeEndpoints`, scan jobs), guided camera
  (`GuidedCameraModal`), tire pressure specs and logs, documents and vehicle photos.
- New: the step screen shell (rules above), the step definitions for both flows, damage
  marking on photos, same-angle comparison, and inspection-to-jobs.
