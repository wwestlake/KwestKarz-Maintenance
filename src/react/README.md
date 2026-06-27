# KwestKarz React Frontend

This app is the React/Vite frontend for KwestKarz Maintenance.

## Local Development

```powershell
$env:Path = "D:\tools\node22\node-v22.20.0-win-x64;$env:Path"
$env:npm_config_cache = "D:\tools\npm-cache"
npm run dev -- --host 0.0.0.0 --port 5175 --strictPort
```

## Build

```powershell
$env:Path = "D:\tools\node22\node-v22.20.0-win-x64;$env:Path"
$env:npm_config_cache = "D:\tools\npm-cache"
npm run build
```

## Notes

- The app talks to the F# API in `src/backend/KwestKarz.Api`.
- Workflow mode uses the guided step shell in `src/react/src/components/WorkflowDashboard.tsx`.
- The rental inspection flow is now step-focused instead of a full-screen form.
