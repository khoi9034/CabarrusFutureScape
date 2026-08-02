# Product V1 Data Quality

## Principles

- Validate observed data; never invent replacement values.
- Preserve the last valid data when a new run fails.
- Store rule results with source/run identity, counts, severity, and timestamps.
- Keep limitations visible in UI, Ask CFS evidence, reports, and exports.
- Separate source quality from product-work validation.

## Implemented common gates

- required-field presence;
- duplicate detection for a caller-selected unique key;
- null-rate thresholds for caller-selected fields;
- optional source-date freshness age;
- declared SRID equality when configured;
- structural geometry type/coordinates-array checks;
- expected-versus-staged row-count reconciliation; and
- checksum and registered schema-version equality.

These generic gates do not claim coordinate bounds, RFC 7946 conformance,
topological validity, type coercion, or canonical apply reconciliation.

## Domain rules

| Domain | Minimum Product V1 checks |
| --- | --- |
| Parcels | Official parcel ID present |
| Permits | Permit ID and activity date present |
| Development | Permit ID present |
| Flood | Zone and geometry present |
| Schools | School name and source confidence present |
| Economics | Provenance present |
| WSACC | Source and limitations present |
| Investments | Source name and status present |

## Result model

A result identifies rule, domain, source/run, severity, status, metric,
expected/actual values, safe details, and creation time. Row payloads are not
stored in quality-result or audit records.

## Readiness

A failed check blocks ingestion apply. Warnings and not-configured rules remain
visible for Data Steward review but do not automatically change source status.
Stale, disabled, and missing statuses are explicit registry decisions.

## Status

Persistent Product V1 rule results and the gates listed above are Product V1
scope. Rich domain validation may still exist in source-specific pipelines;
unifying it here, plus final thresholds, SLAs, and owner approvals, is deferred.
