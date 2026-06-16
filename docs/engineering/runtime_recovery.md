# CFS Runtime Recovery

Use this checklist when the local app appears disconnected or stale.

## Expected Local Services

- Frontend: `http://localhost:3000`
- Backend: `http://127.0.0.1:8000`
- FastAPI docs: `http://127.0.0.1:8000/docs`
- PostGIS: `localhost:5433`
- Database: `cfs_dev`

CFS reserves frontend port `3000` and backend port `8000` for local
development. Do not silently move CFS to another frontend port. If another
project such as AutoMap is using port `3000`, stop that project or run the CFS
launcher so it can report the owning process and reclaim the reserved CFS port.

Use `http://localhost:3000` for UI testing. Do not use
`http://127.0.0.1:3000`; local Next dev HMR origin behavior can make the page
appear loaded while leaving it less interactive.

## Environment

`.env.local` should be ignored by git and should contain:

```env
NEXT_PUBLIC_USE_BACKEND_API=true
NEXT_PUBLIC_CFS_API_BASE_URL=http://127.0.0.1:8000
```

Do not commit `.env.local`.

## Clean Restart

From `C:\CabarrusFutureScape`:

```powershell
cd C:\CabarrusFutureScape
npm run dev:cfs
```

Use this first. It starts:

- FastAPI at `http://127.0.0.1:8000`
- Next.js at `http://localhost:3000`

Before startup, the launcher reports any process listening on ports `3000` or
`8000`, including the owning PID, process name, and command line when Windows
exposes it. The launcher does not fall back to another port.

## Emergency Stale Cleanup

Use this only when stale processes or generated Next.js cache are blocking the
local demo. It kills all local Node and Python processes on the machine, so do
not use it while unrelated Node/Python work is running.

```powershell
cd C:\CabarrusFutureScape
taskkill /F /IM node.exe
taskkill /F /IM python.exe
if (Test-Path ".next") { Remove-Item ".next" -Recurse -Force }
npm run dev:cfs
```

## Port-Specific Cleanup

If other Node/Python work is active, prefer stopping only CFS ports:

```powershell
foreach ($port in 3000,8000) {
  $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $proc = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
    if ($proc) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
  }
}

npm run dev:cfs
```

Only clear `.next` when stale generated Next.js cache is suspected or the user
explicitly asks for runtime cleanup.

## Health Checks

```powershell
Invoke-RestMethod http://127.0.0.1:8000/
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8000/health/database
Invoke-RestMethod "http://127.0.0.1:8000/parcels/search?q=CFS-PARCEL-0149726579"
Invoke-RestMethod "http://127.0.0.1:8000/development/hotspots?limit=1"
Invoke-RestMethod "http://127.0.0.1:8000/constraints/flood/summary"
Invoke-RestMethod "http://127.0.0.1:8000/constraints/schools/statistics"
```

If `http://127.0.0.1:8000` returns the CFS service status and the health checks
pass, the backend is running.

## Cabarrus REST Source Moves

Cabarrus County GIS services may move between legacy `opendata/MapServer`
services and newer topic-specific `OpenData/.../MapServer` services. If a REST
URL fails:

1. Do not assume the data is gone.
2. Check the source registry/config for primary and fallback URLs.
3. Inspect the service root and layer IDs.
4. Update registry notes before marking a source unavailable.

## Logs

Local dev logs may appear under `logs/`. Treat these as runtime artifacts. Do
not commit `logs/backend-dev.log` or `logs/next-dev.log`.
