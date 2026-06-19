# KwestKarz Maintenance

Mobile-first maintenance, document, and AI assistance platform for Kwest Karz.

## Repository Layout

- `src/KwestKarz.sln` - .NET solution
- `src/backend/KwestKarz.Api` - F# ASP.NET Core API
- `src/backend/KwestKarz.Domain` - F# domain model and business rules
- `src/backend/KwestKarz.Infrastructure` - F# infrastructure integrations
- `src/tests/KwestKarz.Tests` - F# xUnit tests
- `src/react` - React, Vite, and TypeScript frontend

## Local Verification

```powershell
dotnet test src\KwestKarz.sln
cd src\react
npm run build
```

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
