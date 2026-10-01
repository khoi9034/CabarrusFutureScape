# Cabarrus Insights operations runbook

Run commands from `C:\CabarrusFutureScape` in PowerShell. Use an authorized
operator account. Never paste secrets into tickets, screenshots, logs, or chat.

## Start, stop, and restart

```powershell
cd C:\CabarrusFutureScape

# Stable local/internal presentation: validates PostGIS, builds if needed,
# prewarms governed summaries, starts FastAPI/Next.js, and verifies health.
npm.cmd run present:cfs

# Safe stop: only confirmed CFS listeners on 3000/8000 are stopped.
# PostgreSQL and unrelated Node/Python processes are not touched.
npm.cmd run stop:cfs

# Supported restart (the launcher safely stops existing CFS listeners first).
npm.cmd run restart:cfs
```

Expected URLs:

- `http://127.0.0.1:3000`
- `http://127.0.0.1:8000`
- `http://127.0.0.1:8000/docs`

For active development rather than a stable presentation, use
`npm.cmd run dev:cfs`. Do not invent alternate Python interpreters, ports, or a
hosted `DATABASE_URL` for local operations.

## Check health

```powershell
npm.cmd run check:internal-readiness
```

The command returns PASS/WARN/FAIL for local PostGIS/PostGIS extension, required
tables, governed source freshness, FastAPI liveness/readiness/database, Ask
Insights provider configuration, frontend HTTP, and the configured backup path.
A missing backup directory is a warning for evaluation and a production blocker.

Focused checks:

```powershell
npm.cmd run check:local-data
npm.cmd run check:enterprise-readiness
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8000/health/ready
Invoke-RestMethod http://127.0.0.1:8000/health/database
Invoke-RestMethod http://127.0.0.1:8000/ai/status
```

## Check freshness

`npm.cmd run check:local-data` writes ignored reports under `logs/` and prints
domain availability. Review `demo_datasets` in
`logs/local-data-readiness.json`; each item records governed row count and
`source_current_through`. Do not infer freshness from file modification time or
replace unknown dates with today.

Permit refresh state is also available to an authorized Administrator from:

```text
GET /api/v1/admin/data-refresh/status
```

## Refresh approved permit data

Presentation mode is intentionally frozen and cannot refresh. Use a reviewed
maintenance window with the presentation stack stopped or started without the
presentation cache.

```powershell
cd C:\CabarrusFutureScape
$env:CFS_LIVE_REFRESH_ENABLED = 'true'
$env:CFS_PRESENTATION_CACHE_ENABLED = 'false'

# Validate the approved source without publishing.
.\.venv\Scripts\python.exe cfs-data-pipelines\refresh_permit_intelligence.py --dry-run

# Publish only after validation output and source approval are reviewed.
.\.venv\Scripts\python.exe cfs-data-pipelines\refresh_permit_intelligence.py --apply

# Verify governed tables/freshness, then restart the presentation stack.
npm.cmd run check:local-data
npm.cmd run restart:cfs
```

The worker accepts no caller-supplied URL, table, or command. It validates
required fields, blank IDs/dates/PINs, duplicate permit IDs, parseable dates,
checksum, and an unexpected row-count drop. Stage/publish is transactional;
failure keeps last-known-good tables. Permit refresh does not retrain Development
Signals. Other dataset refreshes remain manual/source-driven until a reviewed
worker exists.

## Back up the database

Choose an approved directory outside the repository and on a volume with enough
capacity. Credentials come from `PGPASSWORD`, `.pgpass`, or the authorized
PostgreSQL credential mechanism; the script never prints them.

```powershell
$env:CFS_BACKUP_DIRECTORY = 'D:\CabarrusInsightsBackups'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup-cfs-database.ps1 -CheckOnly
npm.cmd run backup:database
```

The backup command creates a timestamped custom-format `.dump`, verifies that
`pg_restore --list` can read it, and writes a SHA-256 `.sha256` file. It refuses
to place dumps inside the repository. Copy completed backups to the approved
off-host destination and apply the County retention policy. A file existing is
not a restore test.

## Restore a backup — destructive, authorized operators only

Do not run this during routine verification. Obtain change approval, identify
the exact target, and restore into an isolated database first.

```powershell
cd C:\CabarrusFutureScape
npm.cmd run stop:cfs

$backup = 'D:\CabarrusInsightsBackups\cfs_dev_YYYYMMDD_HHMMSSZ.dump'
$expected = (Get-Content "$backup.sha256").Split(' ')[0]
$actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $backup).Hash.ToLowerInvariant()
if ($actual -ne $expected) { throw 'Backup checksum mismatch.' }

# First rehearsal target; never overwrite the working database for a drill.
createdb.exe --host localhost --port 5433 --username postgres cfs_restore_check
psql.exe --host localhost --port 5433 --username postgres --dbname cfs_restore_check `
  --command 'CREATE EXTENSION IF NOT EXISTS postgis;'
pg_restore.exe --host localhost --port 5433 --username postgres `
  --dbname cfs_restore_check --no-owner --no-acl --exit-on-error $backup
```

Point a temporary authorized health-check session at `cfs_restore_check`, run
the database migrations/check and `check_cfs_local_data.py`, record duration and
results, then drop the rehearsal database only after approval. A real cutover
must define RPO/RTO, preserve the prior database/restore point, verify PostGIS
and migrations, run the readiness command, and restart CFS. Never restore a
full raw/research warehouse into a constrained hosted target; follow
`docs/production_serving_table_dependency_map.md` for a reviewed serving subset.

## Recover from failures

### Frontend unavailable

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop-cfs-local.ps1 -FrontendOnly
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-cfs-presentation.ps1 -FrontendOnly
```

If the stable build is stale, use `-ForceBuild`. Do not delete `.next` unless a
specific cache-corruption diagnosis requires it.

### Backend unavailable

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\stop-cfs-local.ps1 -BackendOnly
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-cfs-presentation.ps1 -BackendOnly
```

The local Management recovery button calls this fixed repository-owned boundary;
it cannot execute arbitrary browser-supplied commands and is unavailable in
demo/enterprise profiles.

### Database unavailable

Do not restart or alter PostgreSQL blindly. Confirm `localhost:5433`, the
`cfs_dev` service, disk space, credentials, and Postgres logs. Once the database
is healthy, run `npm.cmd run check:internal-readiness` and restart CFS.

### Refresh failed

Do not truncate, retry repeatedly, or manually swap tables. Last-known-good data
remains published. Review the refresh status and operator log, fix the source/
schema issue, run `--dry-run`, then schedule a new approved attempt.

### Map service unavailable

The same-origin county context should remain. Use the map retry control after
connectivity returns. External basemap failure must not trigger sign-in/OAuth or
remove selected/required CFS results.

## Build and focused release checks

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run check:runtime-config
npm.cmd run check:enterprise-readiness
.\.venv\Scripts\python.exe -m compileall -q backend\app cfs-data-pipelines
git diff --check
```

## Logs

- stable startup/build: `logs/cfs-presentation-build.log`,
  `logs/local-presentation-startup.json`
- backend: `logs/cfs-presentation-backend.log`
- frontend: `logs/cfs-presentation-frontend.log`
- local development: `logs/backend-dev.log`, `logs/next-dev.log`
- readiness/cache/performance: ignored JSON under `logs/`
- refresh: `cfs_data_refresh_status` plus the controlled worker output

Logs are local support artifacts and are not committed. Do not log or attach
tokens, passwords, database URLs, owner/address fields, unrestricted AI prompts,
or provider responses. Hosted production requires centralized retention,
redaction review, metrics, alert routing, and incident ownership.
