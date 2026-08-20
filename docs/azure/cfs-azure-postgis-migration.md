# CFS Azure PostGIS Migration

> `investment_*` objects in this migration record are retained legacy inventory only; they are not active product routes, workflows, or app-role write grants.

## Architecture

- Local source: `cfs_dev` on PostgreSQL 18.4 / PostGIS 3.6.2.
- Local sanitized stage: `cfs_cloud_stage` on PostgreSQL 18.4 / PostGIS 3.6.2.
- Azure target: `cfs_cloud` on Azure Database for PostgreSQL Flexible Server `cfs.postgres.database.azure.com`, PostgreSQL 18.4 / PostGIS 3.6.1.
- Application deployment is not part of AZ-1B. Local FastAPI was run against Azure only for validation.

## Cloud-Safe Scope

- Manifest reviewed 159 objects.
- Included: 69 whole objects, 6 sanitized objects, 1 rebuilt view.
- Excluded: 83 restricted or unnecessary objects.
- Sanitized columns remain present only where schema compatibility requires them, with values set to `NULL`.
- Excluded data includes owner/mailing fields, grantor/grantee fields, student-level records, raw WSACC sources, exact experimental probabilities, and raw model scores.

## Export

- Script: `scripts/azure/export_cfs_cloud_stage.ps1`.
- Uses PostgreSQL 18 `pg_dump`.
- Dumps only local `cfs_cloud_stage`.
- Uses directory format, `--no-owner`, `--no-acl`, and parallel jobs.
- Writes only under ignored `local-data\azure-migration`.
- Refuses output paths outside that ignored artifact root.
- Uses `PGPASSWORD` only from the current process or a secure prompt.
- Generated SHA256 checksums and an export manifest.

AZ-1B export:

- Started: `2026-07-16T17:52:22.8781120Z`.
- Completed: `2026-07-16T17:53:17.8794003Z`.
- Duration: 55.0 seconds.
- Archive size: 769,131,798 bytes.
- Archive table/view counts: 79 public tables, 3 public views.

## Dump Validation

- `pg_restore --list` completed successfully.
- App table definitions: 75.
- Table data entries: 79.
- App view definitions: 1 restored view plus extension views from installed extensions.
- Index entries: 89.
- Constraint entries: 62.
- No `CREATE DATABASE` entry.
- No forbidden raw WSACC, student, exact probability, or raw-score object names.
- Azure restore TOC skipped extension-managed seed table data to avoid duplicate extension rows, then enabled the required safe extensions on Azure.

## Restore

- Script: `scripts/azure/restore_cfs_cloud_to_azure.ps1`.
- Monitored by: `scripts/azure/run_azure_restore_with_metrics.ps1`.
- Uses PostgreSQL 18 `pg_restore`.
- Uses `sslmode=require`, `--no-owner`, `--no-acl`, `--exit-on-error`, and `-j 1`.
- Uses Entra access token only as process-local `PGPASSWORD`.
- Restore logs and metrics are outside the repository.

AZ-1B restore:

- Started: `2026-07-16T18:00:05.1265425Z`.
- Completed: `2026-07-16T18:23:34.9799619Z`.
- Duration: 1,409.9 seconds.
- Exit code: 0.
- Warnings/errors: none in final restore log.

## Entra Token Handling

- Tokens are generated immediately before PostgreSQL operations.
- Tokens are stored only in process environment variables.
- Tokens are not printed, logged, committed, or written to scripts.
- The Entra administrator is used only for migration and validation, not as the future application identity.

## Validation

- Script: `scripts/azure/validate_cfs_cloud_azure.py`.
- Azure final size: 8,309 MB.
- Azure objects: 79 public tables, 3 public views, 3 public sequences.
- Row-count comparison: 75 included app tables checked, 0 mismatches.
- Geometry comparison: 30 geometry columns checked, 0 mismatches.
- Known invalid source geometries retained: 6 `parcels`, 7 `zoning`.
- Sensitive-column checks: 0 non-null findings.
- Forbidden object checks: no raw WSACC, student, exact probability, or raw-score objects present.
- Views resolve.
- Public indexes are valid.
- Writable workflow tables accepted rollback-only validation inserts.

## Analyze

- Command: `ANALYZE;`.
- Started: `2026-07-16T18:29:13.7570386Z`.
- Completed: `2026-07-16T18:32:24.1858834Z`.
- Duration: 190.4 seconds.
- `VACUUM FULL` was not run.

## Application Smoke

Local FastAPI was started against Azure with process-only environment overrides.

- Result: 37/37 checks passed.
- Covered health, database health, parcel search/detail, development hotspots, permit trends, Indicator Center, Model Lab, flood/school/transportation/utility context, Economics intelligence, Power BI export, Ask CFS Planning/Economics, Investment screening/research/ACS/environmental context, writable analyst workflows, underwriting, reports, and report-bucket payloads.
- Temporary QA records were deleted.

## Performance

Each operation used one cold call followed by three warm samples.

| Operation | Local median ms | Azure median ms |
| --- | ---: | ---: |
| Database health | 4.5 | 223.5 |
| Parcel search | 460.0 | 3738.1 |
| Parcel detail | 6.5 | 181.9 |
| Development hotspots | 187.1 | 691.2 |
| Economics intelligence | 30.3 | 155.2 |
| Power BI export | 10.0 | 139.8 |
| Research context | 417.7 | 1555.0 |
| Environmental context | 26.1 | 476.4 |
| ACS context | 301.2 | 1710.4 |
| Underwriting calculation | 303.8 | 1782.9 |
| Report generation | 285.8 | 1919.0 |
| Ask CFS context assembly | 10.1 | 141.3 |

B1ms assessment:

- Portfolio demo: practical if traffic is low and caches are warm.
- Private staging: practical.
- Daily light use: acceptable with patience around parcel search and research-heavy paths.
- Heavy ETL: not practical.
- Model rebuilding: not practical.
- Multiple simultaneous users: not recommended on B1ms.

## Azure Resource Observations

During restore sampling:

- CPU average peaked at about 87.44%.
- CPU credits remained available, median about 42.
- Memory average peaked at about 72.70%.
- Storage average peaked at about 51.03%.
- IOPS average peaked at about 760.
- Active connections peaked at about 13.
- Failed connections were normally 0; one failed sample was observed during migration testing.

## Role Plan

Script: `scripts/azure/cfs_app_role_grants.sql`.

The script was applied after restore validation. Boundary checks confirmed:

- `cfs_readonly` cannot insert Candidate Intake rows.
- `cfs_app` can insert Candidate Intake rows.
- `cfs_app` cannot insert analytical parcel summary rows.
- Both roles can read approved analytical parcel summary rows.
- `cfs_app` cannot create objects in `public`.

`cfs_readonly`:

- May connect and read approved public tables/views.
- Cannot write analyst records.
- Cannot create extensions, create schemas, or change structure.

`cfs_app`:

- May connect and read approved public tables/views.
- May write only to Candidate Intake, saved items, Recent Work, saved searches, engagements, and underwriting scenarios.
- Cannot own the database, create extensions, modify analytical tables, or administer the server.

Passwords are not included. Do not point the app at these roles until grants are tested with the final application authentication method.

## Backup

The Flexible Server is configured with 7-day backup retention. Use Azure managed backups for platform recovery and keep the AZ-1B directory-format dump only as a migration artifact outside the repository.

## Cost

The B1ms tier kept costs low and completed restore/validation, but endpoint latency shows it is a staging/demo tier, not a production tier for concurrent users or model work.

## Rollback

- Do not restore `cfs_dev` to Azure.
- If rollback is needed before app cutover, remove only CFS application objects from `cfs_cloud`, preserve the database and extensions, and rerun restore from the validated sanitized dump.
- Existing Vercel and Container Apps configuration remains unchanged in AZ-1B.

## Known Limitations

- Azure PostGIS is 3.6.1 while local stage is 3.6.2.
- Known invalid source geometries are retained for `parcels` and `zoning`.
- Exact model probabilities, raw model scores, raw WSACC sources, owner/mailing data, and student-level records are intentionally unavailable.
- B1ms latency is high for search and research-heavy paths.

## Next Phase

AZ-1C should deploy the backend to Azure Container Apps, configure a least-privilege application identity, set secrets in Azure-managed configuration, and only then point frontend environments at the Azure API.
