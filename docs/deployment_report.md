# Cabarrus FutureScape Deployment Report

Generated: 2026-06-22

## Repo Verification

- Local repo path: `C:\CabarrusFutureScape`
- Git remote: `https://github.com/khoi9034/CabarrusFutureScape.git`
- Branch: `main`
- Latest prepared source/deploy commit before this report refresh: `27cf8eb`
- Final UI/deploy source commit: `ec032c4`
- Vercel build-script fix commit: `cbd481f`
- Production API localhost fallback fix commit: `27cf8eb`
- Cloud Postgres driver/SSL fix commits: `1b89063`, `c9d77a3`
- Latest deployed/prepared commit: `c9d77a3`
- Vercel project name: `cabarrus-future-scape`
- Vercel project ID: `prj_Rr2cFrMxWCVym8zJxxikAvvT6ZrH`
- Production frontend URL: `https://cabarrus-future-scape.vercel.app`
- Render backend URL: `https://cfs-api-backend.onrender.com`

Safe CFS source/docs/config changes have been committed and pushed. Generated `outputs/**` phase summaries remain uncommitted and were not included in the production deploy commits.

## Detected Architecture

- Frontend: Next.js app at repo root
- Package manager: npm with `package-lock.json`
- Frontend dev command: `npm run dev`
- Frontend build command: `npm run build`
- Build script: `next build --webpack`
- Frontend typecheck: `npm run typecheck`
- Frontend lint: `npm run lint`
- Backend: FastAPI app under `backend`
- Backend dependencies: `backend/requirements.txt`
- Backend start command from `backend`: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Backend local start command from `backend`: `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
- Database: PostgreSQL/PostGIS accessed by backend only
- API health endpoint: `GET /health`
- Database health endpoint: `GET /health/database`

## Recommended Deployment Architecture

Use one codebase with two runtime modes:

- Local Real Data Mode: Next.js frontend, local FastAPI backend, local PostGIS
  `cfs_dev`, and full CFS county data.
- Portfolio Demo Mode: public Vercel frontend using static cached JSON from
  `public/demo-data`, with no production PostGIS database required.

For the public portfolio deployment, use Portfolio Demo Mode first. A split
full-stack deployment remains available for future paid/live hosting:

- Frontend: Vercel, root directory `.`
- Backend: Render/Railway/Fly/Cloud Run, with Render suitable for the current FastAPI service
- Database: managed PostgreSQL/PostGIS-compatible service

Do not put the FastAPI backend on Vercel unless it is intentionally converted to Vercel-compatible serverless routes. The current backend is a normal FastAPI service and should run on a backend host.

## Vercel Frontend Configuration

Recommended Vercel project settings:

- Root directory: `.`
- Install command: default `npm install`
- Build command: `npm run build`
- Output directory: leave empty/default for Next.js
- Framework preset: Next.js

The `build` script explicitly runs `next build --webpack` so Vercel's normal `npm run build` path uses the same bundler that validates locally with ArcGIS/Next.js 16.

Portfolio Demo Mode environment variables in Vercel:

```text
NEXT_PUBLIC_CFS_DEPLOYMENT_MODE=demo
NEXT_PUBLIC_USE_BACKEND_API=false
```

Do not set `DATABASE_URL` in Vercel. The portfolio site reads static demo JSON
from `public/demo-data` and should not call Render, Supabase, localhost, or
PostGIS.

Future full live-mode environment variables in Vercel:

```text
NEXT_PUBLIC_CFS_DEPLOYMENT_MODE=live
NEXT_PUBLIC_USE_BACKEND_API=true
NEXT_PUBLIC_CFS_API_BASE_URL=https://cfs-api-backend.onrender.com
```

These frontend variables are public and browser-visible. Do not add database URLs, backend API keys, service role keys, or provider tokens to Vercel frontend variables.

## Portfolio Demo Data

The production portfolio path no longer depends on a production database
restore. Generate demo data locally with:

```powershell
python scripts/export_cfs_demo_data.py
```

Generated files:

- `public/demo-data/demo_manifest.json`
- `public/demo-data/indicator_summary.json`
- `public/demo-data/development_trends.json`
- `public/demo-data/flood_summary.json`
- `public/demo-data/school_capacity_watch.json`
- `public/demo-data/model_status.json`
- `public/demo-data/sample_parcels.json`
- `public/demo-data/model_lab_demo_clusters.json`
- `public/demo-data/map_layers/demo_layer_manifest.json`
- `public/demo-data/map_layers/demo_parcels.geojson`
- `public/demo-data/map_layers/demo_development_hotspots.geojson`
- `public/demo-data/map_layers/demo_floodplain_review.geojson`
- `public/demo-data/map_layers/demo_school_capacity.geojson`
- `public/demo-data/map_layers/demo_transportation_context.geojson`

The current demo extract is about 2.3 MB and contains 300 sanitized sample
parcel records plus small static GeoJSON map layers for portfolio Explore
Countywide visuals. It uses clean/summary local tables only, excludes sensitive
contact fields, and does not expose exact parcel-level probabilities, raw model
scores, or official prediction classes. Public demo layers are cached samples,
not full county production coverage.

## Backend Host Configuration

Recommended Render settings:

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`

Current Render backend service:

- Service name: `cfs-api-backend`
- Service URL: `https://cfs-api-backend.onrender.com`
- Latest deployed commit: `c9d77a3`

Production environment variables on the backend host:

```text
APP_ENV=prod
DATABASE_URL=<server-only-postgres-url>
DATABASE_CONNECT_TIMEOUT_SECONDS=5
DATABASE_STATEMENT_TIMEOUT_MS=3000
CORS_ALLOWED_ORIGINS=https://<vercel-production-domain>,https://<custom-domain>
SQLALCHEMY_ECHO=false
```

`DATABASE_URL` belongs on the backend host only. Never prefix it with `NEXT_PUBLIC_`.

## Database Plan

- Use a managed PostgreSQL/PostGIS-compatible database.
- Keep `DATABASE_URL` server-only.
- Use the provider's pooler URI when direct connections are not appropriate for the backend host.
- URL-encode the database password if it contains special characters.
- Run migrations or production write actions only after explicit approval.

No production database writes were performed during deployment prep.

## CORS and API URL Plan

The frontend currently calls the backend through `NEXT_PUBLIC_CFS_API_BASE_URL`. In production, this must be set to the deployed backend URL, not localhost.

If the production API base URL is missing, the frontend now falls back to a non-routable placeholder instead of localhost. This prevents accidental production browser calls to `127.0.0.1`, but the deployed app still needs the real backend URL for live search/layer data.

The backend CORS configuration should include exact production origins only:

```text
CORS_ALLOWED_ORIGINS=https://<vercel-production-domain>,https://<custom-domain>
```

In production, wildcard CORS origins are filtered out.

## Failed Vercel Deployment Diagnosis Checklist

The failed Vercel deployment should be checked for these common causes:

- Wrong root directory: should be `.`
- Wrong build command: should be `npm run build`; the package script now runs `next build --webpack`
- Package manager mismatch: repo uses npm and `package-lock.json`
- Missing frontend API env vars
- Production frontend still calling `http://127.0.0.1:8000`
- TypeScript/build failure in current source
- Attempting to host FastAPI backend on Vercel
- Backend unavailable or CORS not allowing the Vercel origin

Local diagnosis found that the webpack build path is the safe path for this app. `package.json` now makes webpack the default production build script so Vercel does not need an extra build argument.

Local deployment credentials were not present in the shell, so automated Vercel log inspection was not performed.

To inspect failed Vercel logs locally, set a rotated token in your terminal, then run:

```powershell
$env:VERCEL_TOKEN="<rotated-vercel-token>"
npx vercel link --project cabarrus-future-scape
npx vercel logs --token $env:VERCEL_TOKEN <failed-deployment-url-or-id>
```

Do not commit `.vercel/project.json`; `.vercel` is already ignored.

## Manual Deployment Steps

### Backend

1. Open the backend host dashboard.
2. Create or update the FastAPI service from the GitHub repo.
3. Set root directory to `backend`.
4. Set build command to `pip install -r requirements.txt`.
5. Set start command to `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
6. Add backend env vars listed above.
7. Set health check path to `/health`.
8. Deploy.
9. Verify `https://<backend-service-domain>/health` returns `{"status":"ok"}`.

### Frontend

1. Open Vercel project `cabarrus-future-scape`.
2. Confirm root directory is `.`.
3. Confirm build command is `npm run build`.
4. Add frontend env vars listed above.
5. Redeploy.
6. Verify the production URL loads and browser network requests do not call localhost.

### Custom Domain

1. Add the target domain in Vercel project settings.
2. Follow Vercel DNS instructions.
3. Add the custom domain to backend `CORS_ALLOWED_ORIGINS`.
4. Redeploy/restart the backend if the host requires it.
5. Redeploy the frontend if `NEXT_PUBLIC_CFS_API_BASE_URL` changes.

## Secret Safety

- No secrets should be committed.
- `.env`, `.env.local`, `.vercel`, `node_modules`, `.next`, build outputs, and TypeScript build info are ignored.
- Database URLs remain backend-only.
- Service role keys and provider tokens must stay out of browser-visible variables.
- Rotate any credential that was pasted into chat before using it for production.

## Validation Results

Local validation on 2026-06-21:

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run build`: passed
- `npm run build -- --webpack`: passed
- `python -m compileall backend`: passed
- `python -m pytest backend`: passed, 309 tests
- `GET http://localhost:3000`: returned 200 from the running local frontend
- `GET http://127.0.0.1:8000/health`: returned `{"status":"ok"}`
- `GET http://127.0.0.1:8000/health/database`: returned `{"database":"connected"}`

The local shell did not contain Vercel, Render, or production database credentials, so no automated production deployment or provider log inspection was performed.

Deployment continuation validation on 2026-06-22:

- Repo path, GitHub remote, and `main` branch verified.
- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run build -- --webpack`: passed
- `python -m compileall backend`: passed
- `python -m pytest backend`: passed, 311 tests
- Render backend deploy: succeeded, latest service status live.
- `GET https://cfs-api-backend.onrender.com/health`: passed, returned status `ok`.
- `GET https://cfs-api-backend.onrender.com/health/database`: initially failed with HTTP 503 because the configured database credential was rejected by the database provider.
- After securely updating the backend-only Render `DATABASE_URL`, `GET https://cfs-api-backend.onrender.com/health/database` passed and returned database status `connected`.
- Vercel production env vars were configured for live backend mode during the first deploy attempt. The current public portfolio plan should switch Vercel to `NEXT_PUBLIC_CFS_DEPLOYMENT_MODE=demo` and `NEXT_PUBLIC_USE_BACKEND_API=false`.
- Vercel production deploy: succeeded and aliased to `https://cabarrus-future-scape.vercel.app`.
- `GET https://cabarrus-future-scape.vercel.app`: passed with HTTP 200.
- CORS check from `https://cabarrus-future-scape.vercel.app` to `https://cfs-api-backend.onrender.com/health`: passed; backend returns the exact production origin in `Access-Control-Allow-Origin`.
- Representative data-backed endpoint `GET /parcels/search?q=CFS-PARCEL-0149726579&limit=1`: reached the deployed backend but returned HTTP 500 because the connected production database does not currently contain the expected CFS public data tables.
- Production HTML scan: no `localhost`, `127.0.0.1`, `DATABASE_URL`, service-role key, or raw credential values found in the initial document.
- Static bundle scan: backend URL is present as expected. Local fallback and guardrail field-name strings remain in bundled code; these are not active production network requests and do not expose probabilities, raw scores, credentials, or database URLs.
- Production browser/data smoke for full live mode is blocked until a populated production database exists. Portfolio Demo Mode avoids this blocker by using `public/demo-data`.

Portfolio Demo Mode validation on 2026-06-22:

- `python scripts/export_cfs_demo_data.py`: passed.
- Demo data generated: 8 JSON files, 300 sample parcels, about 430 KB total.
- `rg "DATABASE_URL|password|token|secret|owner|mailing|acctname|mailaddr" public/demo-data`: no matches.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build -- --webpack`: passed in local live env.
- Demo-mode build with `NEXT_PUBLIC_CFS_DEPLOYMENT_MODE=demo` and `NEXT_PUBLIC_USE_BACKEND_API=false`: passed.
- `python -m compileall backend`: passed.
- `python -m pytest backend`: passed, 315 tests.

Portfolio Demo deployment update on 2026-06-22:

- Vercel production env vars configured for portfolio demo mode:
  - `NEXT_PUBLIC_CFS_DEPLOYMENT_MODE`
  - `NEXT_PUBLIC_USE_BACKEND_API`
- `NEXT_PUBLIC_CFS_API_BASE_URL` removed from Vercel production for portfolio demo mode.
- The `NEXT_PUBLIC_*` demo env vars are configured as non-sensitive public build
  variables, which is required for the Next.js client bundle.
- Render, Supabase, and `DATABASE_URL` are not required for this public portfolio deployment.
- A follow-up docs-only commit after the public env fix is safe to use as the
  Vercel Git deployment trigger from `main`.

Final Portfolio Demo deployment result on 2026-06-22:

- Direct Vercel production deployment succeeded and was aliased to
  `https://cabarrus-future-scape.vercel.app`.
- Deployment URL produced by Vercel:
  `https://cabarrus-future-scape-ky6vgetd8-khoi-nguyens-projects-9f6b140b.vercel.app`.
- Vercel production build command executed successfully through `npm run build`.
- Vercel build portability fix: static dashboard metrics now read committed
  in-repo demo summaries instead of external local pipeline output files.
- Public HTML smoke:
  - HTTP 200 from `https://cabarrus-future-scape.vercel.app`
  - `Portfolio Demo` present
  - `API Live` absent
  - no `localhost`, `127.0.0.1`, `example.invalid`, or Render backend URL in the initial document
- Hydrated browser smoke:
  - Overview loaded with `Portfolio Demo`
  - Workspace loaded
  - Explore Countywide loaded
  - Indicator Center loaded as a full-width monitoring dashboard
  - Model Lab loaded
  - Planning Snapshot loaded
  - Methodology loaded
  - demo parcel search returned a sanitized demo parcel result
  - observed runtime resources did not call localhost, `127.0.0.1`, `example.invalid`, or the Render backend

## Remaining Blockers

- Public Vercel portfolio mode has no production database blocker after Vercel env vars are set to demo mode.
- Full live cloud mode still requires a populated backend database and explicit approval before any production DB write/migration action.
- If live cloud mode is re-enabled later, smoke test global parcel search and data-backed map/dashboard flows from `https://cabarrus-future-scape.vercel.app`.

## Production Database Restore Attempt

Restore attempt date: 2026-06-22

Pre-restore source inspection:

- Local source database: `cfs_dev` on local Postgres.
- Local PostGIS status: enabled.
- Local public base tables: 95.
- Approximate local public row count: 13,216,846.
- Key local table counts:
  - `public.parcels_enriched`: 110,017
  - `public.development_activity_parcel_summary`: 110,017
  - `public.parcel_flood_constraint_overlay`: 110,017
  - `public.parcel_school_assignment`: 110,017
  - `public.parcel_development_prediction_labels`: 1,430,221

Pre-restore production inspection:

- Production database connection: working.
- Production public table count before PostGIS: 0.
- Production CFS application tables before restore: absent.
- Production PostGIS status before restore: not enabled.

Approved production write actions performed:

- Enabled PostGIS with `CREATE EXTENSION IF NOT EXISTS postgis`.
- Created a temporary custom-format local dump outside the repo using `pg_dump -Fc`.
- Restored schema only into the existing production `public` schema, skipping only the pre-existing `public` schema creation/comment entries.
- Production schema restore succeeded: 89 CFS application tables created plus the PostGIS extension table.
- Attempted data restore using `pg_restore --data-only --single-transaction --exit-on-error`.

Restore result:

- Data restore failed because the production database ran out of disk space while loading a raw FEMA table.
- The data restore used a single transaction, so data rows were expected to roll back on failure.
- After the failure, the production database reported disk/full-WAL symptoms and stopped accepting normal connections.
- Temporary dump file was removed from local disk after the failed restore.

Current production DB blocker:

- Supabase/Postgres storage is insufficient for a full CFS public-schema restore.
- The production database may need storage recovery, a database restart, or a storage/plan upgrade through the Supabase dashboard before additional restores or smoke tests can continue.
- The full local public schema is too large for the current production database allocation.

Recommended next steps:

1. Open the Supabase dashboard and check database storage/health for the production project.
2. Increase database storage/plan or create a larger managed Postgres target.
3. After the database accepts connections again, choose one of:
   - Restore a curated API-required subset of CFS tables, excluding raw/source-heavy tables and large model feature matrices; or
   - Restore the full public schema into a larger database.
4. Re-run `GET https://cfs-api-backend.onrender.com/health/database`.
5. Re-run data-backed endpoint smoke tests.

No dump files, connection strings, passwords, tokens, or provider secrets were committed.

## Production Serving Subset Attempt

Attempt date: 2026-06-22

Purpose:

- Avoid retrying the full 13.2M-row local warehouse restore.
- Populate only clean/summary/API-required CFS serving tables.
- Exclude raw/source-heavy/staging/training/model-feature tables from production.

Planning artifacts created:

- `docs/production_serving_table_dependency_map.md`
- `config/production_db_subset_manifest.json`

Target database pre-check:

- Connection: working before restore.
- Public base tables: 0.
- Existing selected CFS rows: 0.
- PostGIS before restore: not enabled.
- No truncate/delete was needed because the target was empty.

Serving subset estimate:

- Selected serving tables: 28.
- Selected supporting views: 1.
- Selected rows: 1,262,422.
- Estimated selected table size from local source: 1.05 GiB.
- Excluded tables: 67.
- Excluded rows: 11,954,424.
- Estimated excluded table size from local source: 7.95 GiB.

Largest included tables:

- `fema_nfhl_flood_zones_clean`
- `parcels_enriched`
- `parcel_school_summary`
- `parcel_school_assignment`
- `parcel_zoning_overlay_v2`

Largest excluded tables:

- `parcel_development_prediction_features_planning_pipeline_utilit`
- `parcel_development_prediction_features_transportation_enhanced`
- `parcel_development_prediction_features_zoning_enhanced`
- `parcel_development_prediction_features`
- `parcel_zoning_snapshot_year`

Approved serving subset write actions:

- User approved with `APPROVE_SERVING_SUBSET`.
- Enabled PostGIS with `CREATE EXTENSION IF NOT EXISTS postgis`.
- Created a temporary custom-format subset dump outside the repo.
- Dumped only selected serving tables/views.
- Temporary dump size: about 345 MiB.
- Removed the temporary dump after the restore attempt.

Serving subset restore result:

- `pg_dump` subset export succeeded.
- `pg_restore` began restoring selected serving objects.
- The target database terminated the connection during post-data index creation.
- A sanitized retry check also failed to connect to the target database.
- No further production database writes were attempted after the target became unhealthy.

Current production database status:

- Production serving subset populated: not confirmed.
- The target database is not accepting normal connections after the partial restore attempt.
- Partial schema/data may exist, but row counts could not be verified because the database rejected connections.
- Do not retry against this target until the provider reports it healthy again.
- Do not truncate/drop partial objects without explicit approval.

Endpoint smoke test status:

- Backend endpoint smoke tests could not be run after the subset attempt because the target database stopped accepting connections.
- Frontend smoke tests that depend on backend data remain blocked until a healthy populated production database is available.

Recommended next step:

Use a larger managed Postgres/PostGIS target or upgrade the database storage/plan before retrying the serving subset. If a fresh empty target is created, repeat the serving subset process rather than the full raw/research restore.

Safety confirmation:

- No full 13.2M-row restore was retried.
- No raw/source-heavy tables were intentionally restored.
- No training/model feature matrices were included in the serving subset.
- No dump files were committed.
- No connection strings, passwords, tokens, or provider secrets were committed.
