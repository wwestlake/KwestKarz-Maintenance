# KwestKarz Maintenance

Mobile-first maintenance, document, and AI assistance platform for Kwest Karz.

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
- Compliance document scans for registration, insurance, and license plate photos
- Editable AI scan results with cross-checks for VIN, plate, and state
- Maintenance logging with receipt/document attachment support
- Tire pressure factory spec and actual reading logs with photo-assisted entry
- Lock box inventory, combos, styles, and vehicle assignment
- Workflow dashboard with active/completed workflows and step-level continuation
- OBD2 PDF upload and AI-assisted technical-check review

## Local Verification

```powershell
dotnet test src\KwestKarz.sln
cd src\react
npm run build
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

On startup, the API creates the `kwestkarzbusinessdata` schema objects it needs.

## Local Security

Authentication is disabled in `appsettings.Development.json` so LAN development does not get in the way.

For hosted/cloud deployments, enable JWT auth and set a signing key outside source control:

```powershell
dotnet user-secrets set --project src\backend\KwestKarz.Api\KwestKarz.Api.fsproj "Auth:Enabled" "true"
dotnet user-secrets set --project src\backend\KwestKarz.Api\KwestKarz.Api.fsproj "Auth:SigningKey" "<long-random-signing-key>"
```

The backend has role policy names ready for later use:

- `Administrator`
- `Operator`
- `Viewer`

## Local File Storage

Uploaded car photos, receipts, OBD2 reports, and related files are stored on disk. In development, relative storage resolves to:

```text
src\backend\KwestKarz.Api\storage
```

The file bytes stay on disk and document metadata is stored in PostgreSQL.

## OpenAI

Set the OpenAI API key outside source control:

```powershell
dotnet user-secrets set --project src\backend\KwestKarz.Api\KwestKarz.Api.fsproj "OpenAI:ApiKey" "<your-api-key>"
```

The backend uses the OpenAI Responses API through the server-side `IAIConnection` abstraction. The phone app never receives the API key.

## Current Backend API

- `GET /api/health`
- `GET /api/vin/{vin}/decode`
- `POST /api/vin/scan-photo`
- `GET /api/vin/latest-scan`
- `GET /api/vin/latest-scan/{clientId}`
- `GET /api/vehicles`
- `GET /api/vehicles/by-vin/{vin}`
- `POST /api/vehicles`
- `GET /api/vehicles/{vehicleId}/dashboard`
- `GET /api/vehicles/{vehicleId}/maintenance`
- `POST /api/vehicles/{vehicleId}/maintenance`
- `GET /api/vehicles/{vehicleId}/documents`
- `POST /api/vehicles/{vehicleId}/documents`
- `GET /api/vehicles/{vehicleId}/tire-pressure`
- `PUT /api/vehicles/{vehicleId}/tire-pressure/spec`
- `POST /api/vehicles/{vehicleId}/tire-pressure/spec/photo`
- `POST /api/vehicles/{vehicleId}/tire-pressure/logs`
- `GET /api/vehicles/{vehicleId}/compliance`
- `POST /api/vehicles/{vehicleId}/compliance/photo`
- `POST /api/vehicles/{vehicleId}/compliance/photo-jobs`
- `GET /api/vehicles/{vehicleId}/compliance/photo-jobs/{jobId}`
- `POST /api/vehicles/{vehicleId}/compliance/photo-jobs/recheck`
- `PUT /api/vehicles/{vehicleId}/compliance/{recordId}`
- `GET /api/documents/{documentId}/content`
- `GET /api/lock-boxes`
- `POST /api/lock-boxes`
- `PUT /api/lock-boxes/{lockBoxId}`
- `POST /api/lock-boxes/{lockBoxId}/assign`
- `POST /api/lock-boxes/{lockBoxId}/unassign`
- `GET /api/workflows`
- `POST /api/workflows`
- `GET /api/workflows/{workflowId}`
- `PUT /api/workflows/{workflowId}/steps/{stepKey}`
- `POST /api/workflows/{workflowId}/steps/{stepKey}/obd2-report`
- `PUT /api/workflows/{workflowId}/status`
- `POST /api/ai/chat`
- `POST /api/ai/interpret-image`
