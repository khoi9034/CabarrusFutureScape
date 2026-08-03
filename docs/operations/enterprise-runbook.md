# Enterprise Product V1 Runbook

## Safety rules

- Confirm the active branch and target environment before every change.
- Never use `cfs_dev`, production, raw source tables, or CASE records as disposable
  test data.
- Keep database URLs, OIDC tokens, OpenAI keys, and storage credentials out of
  Git, terminal transcripts, browser variables, and image layers.
- Run migration commands explicitly; API startup must not migrate.
- Preserve the last valid data and artifact state after a failed operation.

## Preflight

1. Review canonical runtime/provider values with `check:runtime-config`.
2. Confirm the database host/name is the intended approved target.
3. Run `db:status` and `db:check` without mutation.
4. Confirm required source, artifact, and OIDC settings for the selected mode.
5. Confirm a hosted backup/restore point when migration is in scope.
6. Run container configuration validation before Compose/container use.

## Local application

For the established PostGIS-backed development product, use the existing owned
process scripts and readiness checks:

```powershell
npm.cmd run stop:cfs
npm.cmd run present:cfs
npm.cmd run check:local-data
npm.cmd run check:local-apis
npm.cmd run check:local-interactions
npm.cmd run check:local-presentation
npm.cmd run check:frontend-persistence
```

Stop only application-owned processes with `npm.cmd run stop:cfs`. Logs written by
these scripts are local ignored diagnostics and must not be committed.

## Enterprise-local containers

Set `CFS_ENTERPRISE_DATABASE_URL` in the operator environment to an approved
isolated/local PostGIS target, then:

```powershell
docker compose -f docker-compose.enterprise-local.yml config
npm.cmd run check:containers
docker compose -f docker-compose.enterprise-local.yml build
docker compose -f docker-compose.enterprise-local.yml run --rm api python migrations/manage.py upgrade
docker compose -f docker-compose.enterprise-local.yml up
```

The reference uses `local` + `local_api` + `local_dev`. It does not start or
package `cfs_dev`. The named volume stores generated Product artifacts only;
raw source data and PostgreSQL are never mounted. `/health/ready` gates the web
service until database connectivity and Product V1 migration status are valid.

## Migration procedure

```powershell
npm.cmd run db:status
npm.cmd run db:check
npm.cmd run db:migrate
npm.cmd run db:status
```

Inspect the applied revision and Product V1 tables. If the newest Product V1
revision must be reversed and its documented downgrade is safe:

```powershell
npm.cmd run db:rollback-one
npm.cmd run db:status
```

Do not use rollback as a substitute for a verified hosted restore plan.

## Ingestion procedure

1. Confirm source registry ID, authority, sensitivity, license, and owner.
2. Stage to the approved isolated location.
3. Validate checksum/schema/SRID/geometry/duplicates/nulls/reconciliation/freshness.
4. Review dry-run counts and limitations.
5. Apply only as Data Steward to the approved target.
6. Verify immutable run, quality results, source status, and audit event.

On failure, do not retry endlessly or overwrite last valid data. Record the safe
failure, correct the source/configuration, and start a new run.

## Job and artifact triage

- Correlate the request ID, job ID, artifact ID, and audit event.
- Inspect redacted job errors and provider readiness without printing secrets.
- Retry only explicitly retryable jobs within their bounded policy.
- Verify artifact checksum, content type, sensitivity, and download policy.
- Never substitute a manually copied file for a failed governed artifact.

## Health triage

1. `/health`: process available.
2. `/health/ready`: database/migration/provider readiness.
3. Runtime administration: mode/provider mismatch or source freshness.
4. Background jobs and ingestion runs: bounded safe errors.
5. Application logs: request ID only; redact before sharing.

Do not return demo business rows when local/enterprise dependencies fail.

## Backup and recovery

Product V1 defines the boundary but does not provision backups. Before hosted
release, the owner must define retention, encryption, access, point-in-time
recovery, artifact backup, and restore testing. A backup claim is not accepted
until a restore into an isolated target is timed and validated.

## Frontend persistence acceptance

`check:frontend-persistence` is defined to drive the actual Planning, Economics,
Investments Report Bucket, and Ask CFS interfaces. A successful run must observe
the resulting Product API requests, refresh and reopen disposable records, check
audit history, archive them through supported routes, and verify cleanup. Direct
API persistence tests are lower-level coverage and do not substitute for this
browser check. Run it only against the owned local presentation stack and its
disposable local Product V1 data. The command list above is an operator procedure,
not evidence that a particular branch or commit passed it.

Demo acceptance blocks the backend and confirms session behavior without
Product V1 writes. Local/Enterprise API failures must remain visibly unsaved;
do not diagnose them by enabling a browser-storage fallback.

## Soak

The release soak runs at least 45 minutes against disposable Product V1 records,
includes the browser persistence command as an acceptance round, exercises
Planning/Economics/Investments/Ask CFS/Power BI/map/roles/audit/dry-run/artifact
downloads, restarts owned services, cleans up, and compares canonical hashes
before and after. Short diagnostic runs do not satisfy release soak.

Run the release-duration soak explicitly from a stopped owned stack:

```powershell
npm.cmd run stop:cfs
$env:CFS_PRODUCT_V1_SOAK_SECONDS = "2700"
Remove-Item Env:CFS_ALLOW_SHORT_SOAK -ErrorAction SilentlyContinue
npm.cmd run check:product-v1-soak
```

Only the command's current final result is evidence for that HEAD. A prior report
or a run with `CFS_ALLOW_SHORT_SOAK=true` is not release evidence.

## Escalation

Stop changes when target identity is ambiguous, migration drift is unexplained,
authorization is bypassed, audit cannot record, checks alter canonical data, or
both primary and fallback product paths fail. Cloud deployment remains deferred.
