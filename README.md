# KwestKarz Maintenance

Mobile-first fleet maintenance, document management, compliance, and AI assistance platform for Kwest Karz.

## Repository Layout

- `src/KwestKarz.sln` - .NET solution
- `src/backend/KwestKarz.Api` - F# ASP.NET Core API
- `src/backend/KwestKarz.Domain` - F# domain model and business rules
- `src/backend/KwestKarz.Infrastructure` - F# infrastructure integrations
- `src/tests/KwestKarz.Tests` - F# xUnit tests
- `src/react` - React, Vite, and TypeScript frontend
- `src/react/src/components` - extracted React feature components

## Current App Scope

- Vehicle inventory with VIN decode and VIN photo scanning
- Guided in-app camera capture over trusted local HTTPS
- Compliance document scans for registration, insurance, and licence plate photos with AI extraction and cross-check
- Maintenance logging with schedule templates, receipt attachment, and OCR-assisted entry
- Fleet-level maintenance dashboard: overdue/due-soon status per vehicle, sorted by urgency
- Tire pressure factory spec management and actual reading logs with photo-assisted entry
- Fleet-wide tire pressure alert query
- OBD2 PDF upload and AI-assisted technical review
- Diagnostic report history per vehicle
- Document library: all documents aggregated across vehicle, maintenance, and diagnostic owners
- AI chat and image interpretation with full vehicle context (maintenance history, documents, compliance records)
- Cost ledger with per-vehicle entry tracking
- Rental inspection records (pre and post)
- Turo trip import from CSV export
- User provisioning, roles (admin / manager / worker), display names
- Lock box inventory, combos, styles, and vehicle assignment
- Workflow dashboard with active/completed workflows and step-level continuation
- Dark mode via OS preference (CSS custom properties throughout)

## Local Verification

```powershell
dotnet test src\KwestKarz.sln
cd src\react
npm run build
```

If `npm` is not found on this machine, Node 22 is installed at:

```powershell
$env:Path = "D:\tools\node22\node-v22.20.0-win-x64;$env:Path"
```

## Local App

Run the backend:

```powershell
dotnet run --project src\backend\KwestKarz.Api\KwestKarz.Api.fsproj --launch-profile http
```

Run the frontend:

```powershell
cd src\react
npm run dev -- --host 0.0.0.0 --port 5175 --strictPort
```

Local URL:

```text
https://localhost:5175
https://KwestKarz:5175
```

For guided in-app camera access on a phone, the browser must trust the local dev CA in `certs\dev\kwestkarz-rootCA.crt` and the internal hostname `KwestKarz` must resolve to the PC's LAN IP. The Vite dev server uses `certs\dev\kwestkarz.crt` and `certs\dev\kwestkarz.key` when those files exist, and proxies `/api` to the local backend.

## Local Database

The API expects a PostgreSQL connection string named `KwestKarz`. Keep local credentials in .NET user secrets:

```powershell
dotnet user-secrets set --project src\backend\KwestKarz.Api\KwestKarz.Api.fsproj "ConnectionStrings:KwestKarz" "Host=localhost;Port=5432;Database=KwestKarz;Username=postgres;Password=<password>;Search Path=kwestkarzbusinessdata"
```

On startup the API creates the `kwestkarzbusinessdata` schema objects it needs.

## Authentication

Authentication is **enabled in all environments**. The app uses Firebase phone auth — JWTs are validated against Google's JWKS endpoint. There is no dev bypass.

Required user secrets:

```powershell
dotnet user-secrets set --project src\backend\KwestKarz.Api\KwestKarz.Api.fsproj "Auth:AdminPhoneNumber" "+1<your-phone>"
```

Firebase project config is in `appsettings.json` under `Auth:FirebaseProjectId`.

### Role System

Three roles: `admin`, `manager`, `worker`. Roles are stored in `kwestkarzbusinessdata.users` after account approval. Middleware forwards the stored role as the `X-Role` header.

## Branch and Release Flow

- Authoritative GitHub project board: `KwestKarz Development` (#16), linked to `wwestlake/KwestKarz-Maintenance`.
- `main` is stable and release-ready.
- `develop` is the integration branch for completed work.
- Feature branches are created from `develop` and named by project area/task, for example `codex/ux/73-sticky-edit-actions`.
- Completed feature branches are merged directly into `develop`.
- Release PRs are opened from `develop` to `main` only when a stable batch is ready.
- The user approves and merges `develop` -> `main`.

## Local File Storage

Uploaded car photos, receipts, OBD2 reports, and related files are stored on disk. In development, relative storage resolves to:

```text
src\backend\KwestKarz.Api\storage
```

File bytes stay on disk; document metadata is stored in PostgreSQL.

## OpenAI

```powershell
dotnet user-secrets set --project src\backend\KwestKarz.Api\KwestKarz.Api.fsproj "OpenAI:ApiKey" "<your-api-key>"
```

The backend uses the OpenAI Responses API through the server-side `IAIConnection` abstraction. The phone app never receives the API key.

## Current Backend API

### Health
- `GET /api/health`

### VIN
- `GET /api/vin/{vin}/decode`
- `POST /api/vin/scan-photo`
- `GET /api/vin/latest-scan`
- `GET /api/vin/latest-scan/{clientId}`

### Vehicles
- `GET /api/vehicles`
- `GET /api/vehicles/by-vin/{vin}`
- `POST /api/vehicles`
- `PUT /api/vehicles/{vehicleId}`
- `GET /api/vehicles/{vehicleId}/dashboard`

### Maintenance
- `GET /api/vehicles/{vehicleId}/maintenance`
- `POST /api/vehicles/{vehicleId}/maintenance`
- `POST /api/vehicles/{vehicleId}/maintenance/{recordId}/receipt`
- `GET /api/maintenance/service-schedules`
- `GET /api/maintenance/templates`
- `GET /api/maintenance/templates/all`
- `POST /api/maintenance/templates`
- `PUT /api/maintenance/templates/{templateId}`
- `GET /api/maintenance/fleet-summary`

### Documents
- `GET /api/vehicles/{vehicleId}/documents`
- `POST /api/vehicles/{vehicleId}/documents`
- `POST /api/vehicles/{vehicleId}/documents/receipt`
- `GET /api/vehicles/{vehicleId}/documents/all`
- `GET /api/documents/{documentId}/content`

### Tire Pressure
- `GET /api/vehicles/{vehicleId}/tire-pressure`
- `PUT /api/vehicles/{vehicleId}/tire-pressure/spec`
- `POST /api/vehicles/{vehicleId}/tire-pressure/spec/photo`
- `POST /api/vehicles/{vehicleId}/tire-pressure/logs`
- `GET /api/fleet/tire-alerts`

### Compliance
- `GET /api/vehicles/{vehicleId}/compliance`
- `POST /api/vehicles/{vehicleId}/compliance/photo`
- `POST /api/vehicles/{vehicleId}/compliance/photo-jobs`
- `GET /api/vehicles/{vehicleId}/compliance/photo-jobs/{jobId}`
- `POST /api/vehicles/{vehicleId}/compliance/photo-jobs/recheck`
- `PUT /api/vehicles/{vehicleId}/compliance/{recordId}`

### Diagnostic Reports
- `GET /api/vehicles/{vehicleId}/diagnostic-reports`
- `POST /api/vehicles/{vehicleId}/diagnostic-reports/upload`

### Ledger
- `GET /api/ledger/accounts`
- `GET /api/ledger/entries`
- `POST /api/ledger/entries`
- `GET /api/ledger/worker-earnings`
- `POST /api/ledger/entries/{entryId}/mark-paid`
- `GET /api/ledger/pnl`

### Rental Inspections
- `GET /api/workflows/{workflowId}/rental-inspection`
- `PUT /api/workflows/{workflowId}/rental-inspection`
- `POST /api/workflows/{workflowId}/rental-inspection/photos/{slotKey}`
- `GET /api/workflows/{workflowId}/rental-inspection/report`

### Turo Import
- `POST /api/imports/turo-trip-earnings`
- `GET /api/imports/turo-trip-earnings`
- `GET /api/imports/turo-trip-earnings/maintenance-signals`
- `GET /api/vehicles/{vehicleId}/turo-trips`

### Users
- `POST /api/users/me`
- `PUT /api/users/me/display-name`
- `GET /api/users/me/notifications`
- `PUT /api/users/me/notifications`
- `GET /api/users/pending`
- `POST /api/users/{userId}/approve`
- `POST /api/users/{userId}/suspend`

### Jobs
- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/jobs/{jobId}`
- `POST /api/jobs/{jobId}/claim`
- `POST /api/jobs/{jobId}/complete`
- `POST /api/jobs/{jobId}/cancel`

### Lock Boxes
- `GET /api/lock-boxes`
- `POST /api/lock-boxes`
- `PUT /api/lock-boxes/{lockBoxId}`
- `POST /api/lock-boxes/{lockBoxId}/assign`
- `POST /api/lock-boxes/{lockBoxId}/unassign`

### Workflows
- `GET /api/workflows`
- `POST /api/workflows`
- `GET /api/workflows/{workflowId}`
- `PUT /api/workflows/{workflowId}/steps/{stepKey}`
- `POST /api/workflows/{workflowId}/steps/{stepKey}/obd2-report`
- `POST /api/workflows/{workflowId}/steps/{stepKey}/obd2-report-url`
- `GET /api/workflows/{workflowId}/events`
- `PUT /api/workflows/{workflowId}/status`

### Notifications
- `GET /api/notifications/log`

### AI
- `POST /api/ai/chat`
- `POST /api/ai/interpret-image`
