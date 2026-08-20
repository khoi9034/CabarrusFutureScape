# Database and Migrations

## Scope

Product V1 migrations manage product-work tables only. They do not drop, rebuild,
truncate, or copy authoritative parcel, planning, permit, flood, school,
economics, WSACC, model, or retained legacy Investments/CASE datasets.

## Migration properties

- ordered, reviewable migration files;
- a database version table;
- stable identifiers, foreign keys, indexes, and UTC timestamps;
- optional organization ownership and explicit project relationships;
- no automatic migration during API startup;
- a safe baseline for an existing database; and
- one-step rollback only for Product V1 revisions that declare a downgrade.

Legacy lazy table creation is not the migration mechanism. Existing equivalent
workflow tables are reconciled rather than duplicated.

## Commands

```text
npm run db:status
npm run db:check
npm run db:migrate
npm run db:rollback-one
npm run check:migrations
```

- `status` reports current and expected revision without mutation.
- `check` detects drift and configuration errors without applying changes.
- `migrate` upgrades only after an explicit operator action.
- `rollback-one` downgrades one Product V1 revision and refuses an unsafe target.
- `check:migrations` upgrades, inspects, rolls back, and re-upgrades an isolated
  test database/schema.

## Existing database baseline

Before baseline or upgrade:

1. Confirm the target database name and current revision.
2. Confirm it is not a canonical source database selected by mistake.
3. Inventory any existing equivalent product tables.
4. Take an organization-approved backup for a hosted environment.
5. Run drift/status checks.
6. Apply and inspect only the Product V1 migration plan.

Stamping a baseline is permitted only when the expected objects have been
verified; it must not conceal schema drift.

## Test isolation

`CFS_TEST_DATABASE_URL` identifies a disposable PostgreSQL/PostGIS database or
schema. Mutation-capable tests refuse to run against `cfs_dev` or a non-test
target. Pipeline summaries and generated records write to temporary directories.
The CI service contains sanitized fixtures only and is discarded after the job.

## Product tables

The Product V1 model covers organizations/users/preferences, projects/members/
workflow state, Planning and Economics versioned work, reports/buckets, Ask CFS
conversations, source/ingestion/quality, artifacts,
audit events, and background jobs. The model documentation and migrations are
the authoritative names; raw analytical datasets remain separate.

## Status

Migration architecture is contract-ready. Actual local revisions and command
results are listed in the implementation report. Managed maintenance windows,
replication, and hosted rollback automation are deferred.
