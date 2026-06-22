# KwestKarz Agent Rules

## Dev Environment Ownership
- This is a dev environment owned and operated by the AI agent.
- Start servers without asking. If tests are needed, start servers first.
- Never launch servers in separate PowerShell windows. Use background tasks.
- Never ask the user to start, stop, or restart servers.
- Kill stale processes on ports before restarting.

## Server Commands
- **Backend**: `dotnet run` in `src/backend/KwestKarz.Api` — runs on port 5081 (HTTP)
- **Frontend**: `npm run dev` in `src/react` — runs on HTTPS port 5175, proxies /api to backend

## Ports
- Backend API: http://localhost:5081
- Frontend dev: https://localhost:5175 / https://192.168.0.171:5175 (LAN)

## Kill Backend Before Rebuild
The running backend holds DLLs. **Always kill it before `dotnet build`**:
```powershell
# Find the PID from the build error ("locked by: KwestKarz.Api (XXXXX)")
Stop-Process -Id <PID> -Force
```
Or kill all dotnet processes: `Get-Process dotnet | Stop-Process -Force`

## F# Compile Order — Critical Rule
Files in `.fsproj` must appear in **dependency order** — dependencies before dependents.
If file A uses types or functions from file B, B must be listed above A in the `.fsproj`.
- `ComplianceDtos.fs` → before `MaintenanceLogic.fs` (uses `ComplianceRecordResponse`)
- `ComplianceEndpoints.fs` → before `AIEndpoints.fs` (uses `listLatestAsync`)
- Adding a cross-file dependency? Check the `.fsproj` order first.

## Parallel Tasks in F# (Task.WhenAll pattern)
```fsharp
let taskA = repository.ListAsync(ct)
let taskB = otherRepo.ListAsync(ct)
Threading.Tasks.Task.WaitAll([| taskA :> Threading.Tasks.Task; taskB :> Threading.Tasks.Task |])
let resultsA = taskA.Result
let resultsB = taskB.Result
```
Cast each task to `Threading.Tasks.Task` base type for the array.

## Authentication
- Auth is **enabled in all environments** including local dev — there is no bypass.
- Firebase phone auth: JWT validated via JWKS endpoint (`googleapis.com`).
- Admin phone number is in .NET user secrets (never in appsettings).
- User secrets key: `Auth:AdminPhone`
- Firebase config is in `appsettings.json` under `Firebase:ProjectId` / `Firebase:Issuer`.

## Role System
Three roles: `admin`, `manager`, `worker`
- Roles come from the `role` custom claim in the Firebase JWT.
- Middleware sets `X-Operator` (user's display name/phone) and `X-Role` headers on every request.
- Use `httpContext.Request.Headers["X-Role"]` to read the caller's role in endpoints.
- Role policy names in ASP.NET: `"admin"`, `"manager"`, `"worker"`.

## CSS Variable System
All colours and spacing are CSS custom properties. Never add hardcoded hex values.
- Design tokens live in `:root` in `src/react/src/App.css`.
- Dark mode is automatic via `@media (prefers-color-scheme: dark)` — overrides all `--color-*` variables.
- Key colour tokens: `--color-bg`, `--color-surface`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-danger`, `--color-warn`, `--color-ok`.
- Utility classes: `.tag`, `.tag-ok`, `.tag-warn`, `.tag-danger`, `.tag-muted`, `.btn-primary`, `.btn-secondary`, `.data-table`, `.form-row`, `.hint-text`.

## Key Backend Modules
| File | Purpose |
|---|---|
| `VehicleEndpoints.fs` | Vehicle CRUD, dashboard |
| `MaintenanceEndpoints.fs` | Maintenance records, templates, fleet summary |
| `MaintenanceLogic.fs` | richAiContext, nextDue, dueStatus, receipt prompt |
| `MaintenanceTemplateEndpoints.fs` | Schedule templates; `loadSchedulesAsync` is internal |
| `ComplianceEndpoints.fs` | Compliance photos/records; `listLatestAsync` is callable from other modules |
| `DocumentEndpoints.fs` | Per-vehicle and cross-owner UNION ALL document queries |
| `AIEndpoints.fs` | /api/ai/chat, /api/ai/interpret-image — feeds richAiContext + compliance |
| `TirePressureEndpoints.fs` | Spec management, pressure logs, fleet alert query |
| `DiagnosticReportEndpoints.fs` | OBD2 PDF upload and AI review |
| `LedgerEndpoints.fs` | Cost ledger entries; `createEntryAsync` is an internal helper |
| `UserEndpoints.fs` | User provisioning, display names, roles |
| `JobEndpoints.fs` | Background job status tracking |
| `WorkflowEndpoints.fs` | Multi-step workflow creation and step completion |
| `RentalInspectionEndpoints.fs` | Pre/post rental inspection records |
| `TuroImportEndpoints.fs` | Import trip history from Turo CSV export |
| `LockBoxEndpoints.fs` | Lock box inventory and vehicle assignment |

## Key Frontend Components
| Component | Purpose |
|---|---|
| `FleetMaintenancePanel.tsx` | Fleet-level maintenance status table (overdue/due-soon) |
| `DocumentLibraryPanel.tsx` | All-documents view across owner types for a vehicle |
| `MaintenanceTemplatePanel.tsx` | Schedule template management |
| `TirePressurePanel.tsx` | Tire spec + pressure logs + fleet alerts |
| `CompliancePanel.tsx` | Compliance record management with camera capture |
| `DiagnosticReportPanel.tsx` | OBD2 report upload and AI review display |

## Workflow Rules
- Build before committing. TypeScript check before committing frontend.
- Never commit .env.local or secrets.
- Always close issues and update the GitHub project board after completing a feature.
- PostgreSQL schema is `kwestkarzbusinessdata` — always qualify table names in raw SQL.

## Do Not
- Do not open new PowerShell windows for servers.
- Do not ask before running builds, tests, or servers.
- Do not wait for instructions on routine dev tasks (start server, check output, fix errors).
- Do not use `sleep` to poll — use background task notifications.
- Do not hardcode hex colors — use CSS variables.
- Do not add a new F# file without checking its compile order position in the `.fsproj`.
