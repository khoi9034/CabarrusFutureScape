# Product Administration

## Purpose

Data Administration is a restrained operational view, not a general database
console. It exposes governed state needed to understand readiness and failures.

## Visible information

- canonical runtime and provider modes;
- source registry status, freshness, limitations, and row counts;
- latest validation and immutable ingestion runs;
- data-quality failures by domain and severity;
- current Product V1 migration version;
- background-job status and bounded error summaries;
- audit-event counts and recent authorized activity; and
- the configured artifact provider, without provider credentials or private paths.

## Mode behavior

| Mode | Behavior |
| --- | --- |
| Demo | Sanitized, read-only administration sample; no write controls |
| Local | API-backed readiness, persisted runs, and local development permissions |
| Enterprise | Authenticated API with role and organization enforcement |

## Authorization

- Demo users see only the sanitized static summary; no operational API is called.
- Data Steward manages source metadata, status, dry runs, and validation through
  governed APIs. The current apply adapter fails closed as unavailable.
- Administrator accesses the live operational summary, an organization-scoped
  sanitized user list, governed role changes, and full authorized audit.
- Runtime configuration is visible but deployment-managed and read-only in V1.
- Artifact metadata and download remain on their separately authorized API; the
  administration summary does not duplicate them.

The frontend never substitutes for API authorization.

## Deliberate exclusions

The page has no drop-table, truncate, raw SQL, arbitrary file path, purge audit,
delete source data, change production secret, or force migration button. Migration,
backup, restore, and emergency actions remain operator-run commands with preflight.

## Status

The view contract and Administrator role API are implemented by the Product V1
administration surface. In-product runtime configuration mutation, cloud
monitoring links, managed identity administration, and destructive operations are
deferred. Local verification belongs in the implementation report.
