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

## Workflow Rules
- Build before committing. TypeScript check before committing frontend.
- Never commit .env.local or secrets.
- Always close issues and update the GitHub project board after completing a feature.
- Auth is disabled in Development (appsettings.Development.json). Admin phone is in user secrets.

## Do Not
- Do not open new PowerShell windows for servers.
- Do not ask before running builds, tests, or servers.
- Do not wait for instructions on routine dev tasks (start server, check output, fix errors).
- Do not use `sleep` to poll — use background task notifications.
