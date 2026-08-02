# Controlled Ingestion Framework

## Lifecycle

1. **Adapter** reads an approved source into a bounded internal representation.
2. **Stage** writes to an isolated staging area and records a checksum.
3. **Validate** applies required-field, structural geometry/SRID,
   reconciliation, and optional freshness rules.
4. **Dry run** reports intended changes without canonical mutation.
5. **Explicit apply** requires Data Steward permission and a passing staged run;
   it fails closed until an approved canonical adapter is configured.
6. **Record** closes an immutable run with counts, validation IDs, and audit.

There is no automatic scheduling or unreviewed overwrite in Product V1.

## Run identity

Each run records source, method, actor, mode, input checksum, schema version,
started/completed times, staged/applied row counts, reconciliation, validation
summary, status, and a redacted error. Product V1 records each apply attempt as a
new immutable run; linking it to a reviewed dry run is deferred with the canonical
apply adapter. Completed runs are immutable.

## Validation gates

- required-field presence;
- expected schema version;
- declared SRID equality when an expected SRID is supplied;
- a structural GeoJSON object check (allowed type and coordinates array);
- duplicate values for a caller-selected unique key;
- per-field and critical-field null rates;
- staged/source/applied row reconciliation;
- optional source-date age against a caller-supplied freshness threshold; and
- domain-specific data-quality rules.

Failed checks block apply. Passing, warning, and not-configured results remain
visible in the immutable run; they do not automatically rewrite source status.

## Future safe apply contract

The approved adapter must run in a transaction where practical and target only
an approved table or repository method. Dynamic table/column SQL must be
allowlisted, not client-provided. Until then, apply records `Apply unavailable`,
mutates no canonical table, and preserves immutable evidence. Product-work tests
never target canonical source tables.

## Existing adapters

Existing school, permit, WSACC, environmental, and ACS scripts/connectors remain
source-specific adapters. They should receive temporary output/staging locations
under tests rather than being rewritten into a generic ingestion engine.

## Status

Staging, structural validation, dry-run records, permission checks, and the
fail-closed apply boundary are implemented. Full RFC 7946 coordinate/topology
validation, canonical apply adapters, dry-run/apply linkage, scheduling,
external workers, and unattended source replacement are deferred.
