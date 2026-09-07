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
- Node 22 is available at `D:\tools\node22\node-v22.20.0-win-x64`. If `npm` is not found, prepend that folder to `PATH` for the session.

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
- User secrets key: `Auth:AdminPhoneNumber`
- Firebase config is in `appsettings.json` under `Auth:FirebaseProjectId`.

## Role System
Three roles: `admin`, `manager`, `worker`
- Roles are stored in `kwestkarzbusinessdata.users` after account approval.
- Middleware sets `X-Operator` (user's display name/phone) and `X-Role` headers on every request.
- Use `httpContext.Request.Headers["X-Role"]` to read the caller's role in endpoints.
- Current endpoint role checks are mostly explicit `X-Role` checks; ASP.NET policies are `Admin` and legacy `Helper`.

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
| `MaintenanceTemplateManager.tsx` | Schedule template management |
| `TirePressurePanel.tsx` | Tire spec + pressure logs + fleet alerts |
| `AddVehicleModal.tsx` | Add vehicle flow with document scans, state dropdown, and fleet ID preview |
| `VinConfirmModal.tsx` | VIN scan confirmation, checksum result, and fleet lookup actions |
| `JobsPanel.tsx` | Job dispatch, claim, complete, and cancel workflow |
| `LedgerPanel.tsx` | Ledger entries, P&L, and worker earnings |
| `WorkflowDashboard.tsx` | Workflow creation, step editor, and wizard-style continuation |

## Branch and Release Flow
- Authoritative GitHub project board: `KwestKarz Development` (#16), linked to `wwestlake/KwestKarz-Maintenance`.
- If project context is unclear, inspect project #16 first. Do not create a new project board or duplicate plan items without explicit user approval.
- `main` is the stable release branch. Do not commit feature work directly to `main`.
- `develop` is the integration branch. Completed work is merged into `develop` by the agent.
- Create feature branches from `develop`, named for the project section and issue/task, for example `codex/ux/73-sticky-edit-actions`.
- Merge completed feature branches back into `develop`; no PR is required for these internal merges.
- When `develop` is stable and ready to roll out, open a PR from `develop` to `main`.
- If the user explicitly approves the release, the agent may merge `develop` into `main` and push the result.
- **CRITICAL: Merging to `main` triggers automatic deployment to production. Do NOT merge to `main` unless the code is ready for immediate production release.**
- The user still owns the final go/no-go for production timing.

## Production Database Ownership — Critical Rule
The app connects to Postgres as the `kwestkarz` role (see `ConnectionStrings__KwestKarz` in `/opt/kwestkarz/env` on the EC2 host), **not** as the `postgres` superuser.

`DatabaseInitializer.EnsureCreatedAsync` runs idempotent DDL (`create table if not exists`, `alter table add column if not exists`, `create index if not exists`, etc.) against every table in `kwestkarzbusinessdata` **on every app startup**. If a table is owned by a role other than `kwestkarz`, that DDL fails with a Postgres permission error (`must be owner of table ...`), the app throws on startup, and systemd crash-loops the service — this takes down the entire API, not just the feature tied to that table.

**Never run manual/ad-hoc SQL against production as `sudo -u postgres psql`** (e.g. to backfill data, create a table by hand, fix a one-off issue) without either:
1. Running it as the `kwestkarz` role instead of `postgres`, or
2. Immediately following it with `ALTER TABLE ... OWNER TO kwestkarz;` (and the same for any sequences/indexes created) before the next deploy/restart.

If you ever need to audit ownership, run on the EC2 host:
```sql
SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'kwestkarzbusinessdata' AND tableowner != 'kwestkarz';
```
Any row returned there is a ticking time bomb for the next restart. Fix it before moving on.

**Incident:** on 2026-07-22, the `vehicle_photos` table was created manually via `sudo -u postgres psql` during a data-upload task, leaving it owned by `postgres`. The next `develop`→`main` deploy restarted the service, `DatabaseInitializer` tried to `alter table`/`create index if not exists` on it, hit a permission error, and the service crash-looped (core-dump, `ABRT`) until the ownership was manually corrected.

## Workflow Rules
- Build before merging to `develop`. TypeScript check before committing frontend.
- Never commit .env.local or secrets.
- Always close issues after completing and merging a feature to `develop`. Update the GitHub project board when an issue has a project item.
- PostgreSQL schema is `kwestkarzbusinessdata` — always qualify table names in raw SQL.

## Do Not
- Do not open new PowerShell windows for servers.
- Do not ask before running builds, tests, or servers.
- Do not wait for instructions on routine dev tasks (start server, check output, fix errors).
- Do not use `sleep` to poll — use background task notifications.
- Do not hardcode hex colors — use CSS variables.
- Do not add a new F# file without checking its compile order position in the `.fsproj`.
- Do not run manual SQL against production as `sudo -u postgres psql` without transferring ownership of anything you create to the `kwestkarz` role — see "Production Database Ownership" above.
