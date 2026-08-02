# Data Provider Boundaries

## Existing ports

CFS already separates transport at the useful boundaries:

- Frontend domain services call typed API clients or explicit demo clients.
- FastAPI routers expose request, filter, pagination, response, and error contracts.
- Backend services implement domain behavior.
- Backend repositories and read-only SQL sessions own database access.
- Report and export services consume domain payloads, not raw public tables.

These are the data ports. Creating one-implementation wrapper interfaces around
them would add no isolation, so the hardening pass formalizes and tests the
existing boundaries instead.

## Provider matrix

| Boundary | `static` | `local_api` | `enterprise_api` |
| --- | --- | --- | --- |
| Parcel and Planning | Sanitized JSON/GeoJSON | FastAPI to local PostGIS | Same typed API contract |
| Economics and scenarios | Sanitized JSON | FastAPI economics service | Hosted economics API |
| Investments | Session demo service | FastAPI investment routes | Hosted investment API |
| Ask CFS | Deterministic demo context | FastAPI local context | Hosted context/provider service |
| Power BI | Sanitized static package | API-generated local package | Governed export endpoint |
| Reports | Sanitized/session artifacts | Backend report routes | Authenticated report service |

The enterprise adapter performs no network call until an enterprise endpoint
and OIDC boundary are configured. Components continue to consume the same
TypeScript contracts.

## Provenance envelope

Technical boundaries may attach:

- `runtime_mode`
- `data_origin`
- `dataset_id`
- `source_label` and `source_type`
- `observed_or_derived`
- `geography`
- `as_of` and `generated_at`
- `row_count`, `unit`, and `schema_version`
- `limitation`
- `official_verification_required`

Origins are `local_postgis`, `local_api`, `enterprise_api`, `sanitized_demo_extract`,
`derived_local_metric`, `internal_research`, `session_only_demo`,
`static_geographic_context`, or `unavailable`.

## Failure policy

Local and enterprise business failures remain unavailable. They do not cross
into the demo adapter. Static geographic context remains available because it
does not assert local business conditions.

Public APIs expose governed domain responses and exports, never unrestricted
database tables.
