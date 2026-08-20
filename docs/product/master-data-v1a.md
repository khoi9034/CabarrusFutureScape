# Master Data V1A

Master Data is a read-only, governed extract workspace. V1A supports two
server-controlled datasets and never accepts a database table name, SQL
fragment, geometry field, or unrestricted source column from the browser.

## Runtime contract

- Demo uses sanitized in-browser Parcel and Permit samples. It does not call
  FastAPI and advertises CSV only.
- Local reads the Local PostgreSQL/PostGIS sources through FastAPI.
- Enterprise uses the same API contract, principal, and provider boundary as
  Local. The UI does not change when the backing database or identity provider
  changes.
- Preview and export are derived products. Neither operation updates the
  authoritative source tables or persists generated files.

## Read-only source inventory

### Parcels

- User-facing source: Cabarrus County parcel and zoning data.
- Base table: `public.parcels_enriched`.
- Stable record key: `official_parcel_id`; `pin14` is useful but not unique.
- Spatial source: polygon geometry exists, but V1A omits geometry from preview
  and export.
- Controlled zoning enrichment: `public.parcel_zoning_overlay_v2`, joined by
  `official_parcel_id`.
- Planner-facing fields: parcel ID, PIN, subdivision, neighborhood, calculated
  acreage, market/assessed/land/building values, value per acre, zoning
  jurisdiction, zoning code, zoning category, and processing timestamp.
- Not offered: owner names, mailing addresses, legal/deed data, geometry, source
  object IDs, raw shape measures, and internal quality/outlier fields.
- Known limitation: the curated source does not contain a verified site address
  or municipality field. V1A does not infer either one.

### Permits

- User-facing source: Cabarrus County real property permit data.
- Base table: `public.real_property_permit_clean`.
- Stable record key: `permit_id`; permit number can be missing and is not a key.
- Controlled enrichments: `public.permit_intelligence_segments` by `permit_id`
  and a one-row-per-permit aggregation of
  `public.real_property_permit_parcel_relationship` for the matched CFS parcel
  ID. Pagination and counts remain permit-based.
- Planner-facing fields: permit ID/number, CFS parcel ID, source parcel number,
  permit date, normalized type/work/status, amount, segment, growth signal,
  development domain, value class, status stage, and processing timestamp.
- Not offered: notes, appraiser, building number, raw duplicate fields, source
  URLs/files/ETags, relationship internals, classification rules/reasons/scores,
  and boolean model flags.
- Known limitation: the curated permit source does not contain a verified street
  address, applicant, contractor, or municipality field. V1A does not infer
  them.

## Query, export, and security boundary

Dataset, field, filter, and sort identifiers resolve through a fixed backend
registry. SQLAlchemy binds every user value. Preview is paginated and geometry
is excluded. The backend revalidates all selected fields, even when a browser
request bypasses the UI.

Local and Enterprise CSV/XLSX files are generated in memory and returned
directly; no export file or history row is stored. XLSX generation uses the
bounded `openpyxl` dependency in `backend/requirements.txt`, so Microsoft Excel
is not required on the server. Demo stays dependency-free and generates only a
sanitized CSV.

Successful exports append a compact Product audit event with principal,
dataset, timestamp, selected field IDs/count, filter field/operator summary,
result count, runtime mode, request ID, and format. Filter values, connection
details, and source internals are not audited or returned.
