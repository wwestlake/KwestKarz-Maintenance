# KwestKarz

Mobile-first fleet inventory, maintenance, and AI intelligence platform for Kwest Karz.

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
