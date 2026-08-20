# Cabarrus FutureScape Local Presentation Runbook

## Before The Presentation

1. Confirm the existing local PostgreSQL service is running on `localhost:5433`. A quick check is:

   ```powershell
   Test-NetConnection localhost -Port 5433
   ```

2. From `C:\CabarrusFutureScape`, start the complete presentation stack:

   ```powershell
   npm run present:cfs
   ```

3. Wait for `PASS - Local presentation is ready`. The launcher validates `cfs_dev`, PostGIS, local data, FastAPI, the stable Next.js build, and the complete presentation API inventory. It leaves both web services running.
4. Open [CFS Home](http://127.0.0.1:3000). Open **More** and confirm **Live Local Data**, API **Ready**, database **Connected**, and **Grounded local answers**.
5. Open Planning and ask: `What should I inspect first for this parcel?`

## Presentation URLs

- [Home](http://127.0.0.1:3000)
- [Planning](http://127.0.0.1:3000/?app=planning)
- [Economics](http://127.0.0.1:3000/?app=economics)
- [Master Data](http://127.0.0.1:3000/?app=master-data)
- [Ask CFS](http://127.0.0.1:3000/?app=ask-cfs)
- [FastAPI Docs](http://127.0.0.1:8000/docs)
- [API Readiness](http://127.0.0.1:8000/health/ready)
- [Database Health](http://127.0.0.1:8000/health/database)

## Suggested Presentation Flow

1. **Home, 30 seconds:** Establish the three connected products and show the Live Local Data status.
2. **Planning, 2 minutes:** Search `CFS-PARCEL-0149726579`, select it, and toggle Development Hotspots, Floodplain Review, and School Utilization + Permit Pressure.
3. **Indicator Center and Ask CFS, 1 minute:** Open Indicator Center and ask what to inspect first. Point out evidence and caveats.
4. **Economics, 1 minute:** Show database-backed KPIs, select a parcel, change a scenario control, and show the updated screening output.
5. **Master Data, 1 minute:** Preview a governed dataset, apply a safe filter, and export selected fields.
6. **Ask CFS, 1 minute:** Open the standalone route, ask a grounded follow-up, and point out evidence and caveats.

## Recovery

- **Frontend does not open:** Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-cfs-presentation.ps1 -FrontendOnly`.
- **Backend is not ready:** Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-cfs-presentation.ps1 -BackendOnly`.
- **Database is unavailable:** Restore the existing local PostgreSQL listener on port `5433`, confirm database `cfs_dev`, then rerun `npm run present:cfs`.
- **Ask CFS does not respond:** Run `npm run check:local-apis`. Deterministic Ask CFS requires FastAPI and `cfs_dev`, not OpenAI.
- **Online basemap is unavailable:** Continue with the same-origin Cabarrus context map. County, municipality, water, road, place-label, overlay, parcel-focus, zoom, and reset rendering remain available without internet access.
- **Port 3000 or 8000 is occupied:** The launcher refuses to stop an unrelated process. Identify and close that application yourself, then rerun the launcher.
- **Validate services without restarting:** Run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-cfs-presentation.ps1 -NoRestart`.
- **Detailed logs:** Inspect `logs/cfs-presentation-frontend.log`, `logs/cfs-presentation-backend.log`, `logs/local-data-readiness.json`, `logs/local-api-inventory.json`, and `logs/local-interactions.json`.
- **Safe full restart:** Run `npm run stop:cfs`, then `npm run present:cfs`.

## After The Presentation

Stop only the CFS frontend and backend:

```powershell
npm run stop:cfs
```

Confirm ports are released:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3000,8000 -ErrorAction SilentlyContinue
```

PostgreSQL is intentionally left running. Stop it separately only when desired.
