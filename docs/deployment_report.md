# Cabarrus FutureScape Deployment Report

Generated: 2026-06-21

## Repo Verification

- Local repo path: `C:\CabarrusFutureScape`
- Git remote: `https://github.com/khoi9034/CabarrusFutureScape.git`
- Branch: `main`
- Latest prepared code commit before this report refresh: `cbd481f7993e1eaaafaf27948f59633aa367af33`
- Final UI/deploy source commit: `ec032c4`
- Vercel build-script fix commit: `cbd481f`
- Vercel project name: `cabarrus-future-scape`
- Vercel project ID: `prj_Rr2cFrMxWCVym8zJxxikAvvT6ZrH`

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

Use a split full-stack deployment:

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

Production environment variables in Vercel:

```text
NEXT_PUBLIC_USE_BACKEND_API=true
NEXT_PUBLIC_CFS_API_BASE_URL=https://<backend-service-domain>
```

These frontend variables are public and browser-visible. Do not add database URLs, backend API keys, service role keys, or provider tokens to Vercel frontend variables.

## Backend Host Configuration

Recommended Render settings:

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health check path: `/health`

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

## Remaining Blockers

- Automated Vercel log inspection requires a local `VERCEL_TOKEN`.
- Automated Render deployment/log inspection requires local Render credentials.
- Production backend URL must be known before setting `NEXT_PUBLIC_CFS_API_BASE_URL`.
- Production database connection should be configured on the backend host only.
- Production DB migrations/write actions need explicit approval before running.
