# Cabarrus FutureScape Data Pipelines

Standalone local-development ingestion pipelines for Cabarrus FutureScape (CFS).

This folder is intentionally separate from the Next.js dashboard application.
The current local pilots ingest ArcGIS REST layers into local PostGIS and
prepare them for future parcel intelligence workflows:

```text
Cabarrus County Tax Parcels ArcGIS REST layer
  -> Python ingestion
  -> GeoDataFrame
  -> local PostGIS table public.parcels
  -> public.parcels_clean
  -> public.parcels_enriched

Cabarrus County Current Zoning Districts ArcGIS REST layer
  -> Python ingestion
  -> GeoDataFrame
  -> local PostGIS table public.zoning
  -> public.zoning_clean
```

No frontend connection, backend API, forecasting system, AI system, production
service credentials, or production zoning service is included yet.

## Folder Structure

```text
cfs-data-pipelines/
  config/
    permit_activity_sources.json
    planning_boundary_sources.json
    zoning_sources.json
  enrich/
    create_parcel_zoning_overlay_v2.py
    create_parcel_zoning_overlay.py
    create_parcels_enriched.py
  ingest/
    ingest_permit_activity.py
    ingest_tax_parcels.py
    ingest_zoning.py
    ingest_zoning_sources.py
    ingest_planning_boundaries.py
  inspect/
    diagnose_zoning_coverage.py
    inspect_permit_activity_postgis.py
    inspect_parcels_postgis.py
    qa_parcel_zoning_overlay_v2.py
    qa_parcel_zoning_overlay_v2.py
    inspect_zoning_postgis.py
  logs/
  outputs/
  sql/
    create_permit_activity_clean.sql
    create_parcel_zoning_overlay_v2.sql
    create_parcel_zoning_overlay.sql
    create_parcels_clean.sql
    create_parcels_enriched.sql
    create_planning_boundaries_clean.sql
    qa_parcel_zoning_overlay_v2.sql
    create_zoning_clean.sql
    create_zoning_jurisdictional_clean.sql
    diagnose_zoning_coverage.sql
    profile_parcels.sql
    verify_parcels.sql
  transform/
    create_permit_activity_clean.py
    create_parcels_clean.py
    create_planning_boundaries_clean.py
    create_zoning_clean.py
    create_zoning_jurisdictional_clean.py
  requirements.txt
  README.md
```

## Source Layers

Tax Parcels ArcGIS REST layer:

```text
https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/46
```

Current Zoning Districts ArcGIS REST layer:

```text
https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/35
```

Permit Activity public pilot layer:

```text
https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/33
```

This source is the public `Permits 2015` OpenData layer. It is suitable for
local Phase 3 ingestion, profiling, date parsing, geometry handling, and
parcel/PIN join planning. It is not treated as the authoritative current
permitting system of record. The required future source remains an approved
staging or production permit activity FeatureServer/MapServer endpoint with
permit/application IDs, status, type/category, activity dates, parcel/PIN join
fields, address/location, and geometry or geocodable location.

The script reads layer metadata, handles REST pagination, downloads all parcel features as GeoJSON, normalizes columns to lowercase, drops null geometries defensively, and writes to PostGIS with `GeoDataFrame.to_postgis()`.

## Local Database Target

Expected local development database:

```text
host: localhost
port: 5433
database: cfs_dev
username: postgres
target table: public.parcels
```

The database must exist and PostGIS must be enabled before ingestion.

Example setup SQL:

```sql
CREATE DATABASE cfs_dev;
\connect cfs_dev
CREATE EXTENSION IF NOT EXISTS postgis;
```

## Environment Variable

The PostgreSQL password is read from:

```powershell
$env:CFS_POSTGRES_PASSWORD = "your-local-password"
```

Do not hardcode database passwords in the script or commit local secrets.

## Install Dependencies

From `cfs-data-pipelines/`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

## Run The Ingestion

From `cfs-data-pipelines/`:

```powershell
python ingest\ingest_tax_parcels.py
```

Default behavior:

- downloads all parcel features
- writes to `public.parcels`
- uses `if_exists="replace"` for a clean local refresh
- creates a GiST spatial index on `geometry`
- writes logs to `logs/`
- writes a summary JSON file to `outputs/ingest_tax_parcels_summary.json`

Useful development options:

```powershell
python ingest\ingest_tax_parcels.py --limit 100 --skip-db
python ingest\ingest_tax_parcels.py --if-exists replace
python ingest\ingest_tax_parcels.py --page-size 500
python ingest\ingest_tax_parcels.py --log-level DEBUG
```

`--skip-db` is only for download and GeoDataFrame validation. The operational pilot should run without `--skip-db` once the local PostGIS database is ready.

## Verification SQL

After ingestion succeeds:

```sql
SELECT COUNT(*) FROM public.parcels;

SELECT ST_GeometryType(geometry)
FROM public.parcels
LIMIT 5;

SELECT ST_SRID(geometry), COUNT(*)
FROM public.parcels
GROUP BY ST_SRID(geometry);

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'parcels';
```

The same checks are saved in:

```text
sql/verify_parcels.sql
```

## Parcel Profiling

After `public.parcels` has been ingested, generate a Phase 2 data quality profile:

```powershell
python inspect\inspect_parcels_postgis.py
```

The profiler connects to the same local PostGIS database using `CFS_POSTGRES_PASSWORD` and writes:

```text
outputs/parcels_profile_summary.json
outputs/parcels_column_profile.csv
```

The report includes row count, geometry type counts, SRID distribution, table columns, database data types, null percentages, likely parcel identifier fields, duplicate identifier checks, value/economic fields, subdivision/neighborhood fields, address/location fields, zoning/land-use fields, bounding box extent, invalid geometry count, and spatial index status.

Additional SQL examples are saved in:

```text
sql/profile_parcels.sql
```

Core profile queries:

```sql
SELECT COUNT(*) FROM public.parcels;

SELECT ST_GeometryType(geometry), COUNT(*)
FROM public.parcels
GROUP BY ST_GeometryType(geometry);

SELECT ST_SRID(geometry), COUNT(*)
FROM public.parcels
GROUP BY ST_SRID(geometry);

SELECT COUNT(*)
FROM public.parcels
WHERE NOT ST_IsValid(geometry);
```

## Curated Parcels Clean Table

`public.parcels` is the raw landing table. It should remain close to the ArcGIS
REST source so ingestion can be audited and rerun.

`public.parcels_clean` is the curated local-development table for Phase 2 Parcel
Intelligence. Create or refresh it with:

```powershell
python transform\create_parcels_clean.py
```

The transform SQL is saved in:

```text
sql/create_parcels_clean.sql
```

The clean table policy is:

- use `objectid_1` as the internal stable primary key candidate
- preserve `pin14` as a business parcel identifier, but do not treat it as unique
- normalize empty strings to `NULL` for text fields
- cast `marketvalue`, `assessedvalue`, `landvalue`, `deferredvalue`, `buildingvalue`, and `obxfvalue` into numeric fields
- preserve subdivision, neighborhood, owner/account, mailing, sale, deed, and source shape fields
- repair geometries with `ST_MakeValid`
- extract polygonal geometry and coerce to `MultiPolygon`
- keep SRID `4326`
- add `parcel_area_sq_m`, `parcel_area_acres_calc`, `value_per_acre`, and `transformed_at`

`pin14` is not the primary key because the initial profile found duplicates and
a small number of null values. It remains important for search, joins, and
business workflows, but CFS should use `objectid_1` internally unless a future
county data contract provides a better stable key.

The transform creates:

- primary key constraint on `objectid_1` when uniqueness checks pass
- btree indexes on `pin14`, `subdiv_name`, `nbh_name`, `marketvalue_numeric`, and `assessedvalue_numeric`
- GiST spatial index on `geometry`

Validation artifacts are written to:

```text
outputs/parcels_clean_validation.json
outputs/parcels_subdivision_summary.csv
outputs/parcels_neighborhood_summary.csv
```

The validation report includes raw vs clean row count comparison, geometry
health, SRID checks, numeric cast success counts, duplicate `pin14` summary,
index details, derived field summaries, and top 20 subdivision/neighborhood
rollups.

## Trusted Parcel Intelligence Layer

`public.parcels_enriched` is the trusted local-development parcel intelligence
layer for Phase 2 planning. It is built from `public.parcels_clean` and adds
quality flags, outlier classifications, and search/filter-ready fields for
future zoning, floodplain, permit, infrastructure, API, dashboard, and
executive analytics workflows.

Create or refresh it with:

```powershell
python enrich\create_parcels_enriched.py
```

The enrichment SQL is saved in:

```text
sql/create_parcels_enriched.sql
```

The current parcel table architecture is:

- `public.parcels`: raw ArcGIS REST landing table for auditability and reruns
- `public.parcels_clean`: cleaned operational parcel table with repaired geometry, numeric casts, calculated area, and stable source key policy
- `public.parcels_enriched`: trusted parcel intelligence layer with quality statuses, outlier flags, official CFS parcel IDs, and UX/API-ready classifications

The official CFS parcel ID policy is:

```text
CFS-PARCEL-{zero-padded objectid_1}
```

Example:

```text
CFS-PARCEL-0149751011
```

`objectid_1` remains the internal stable key candidate. `pin14` is preserved for
business search and future joins, but it is not unique and should not be used as
the primary key without a future data governance decision.

The enrichment layer adds:

- `official_parcel_id`
- `parcel_quality_status`
- `geometry_quality_status`
- `area_quality_status`
- `valuation_quality_status`
- `subdivision_quality_status`
- `outlier_flags`
- `has_duplicate_pin14`
- `has_valid_geometry`
- `has_valid_area`
- `has_valid_value_fields`
- `is_probable_administrative_group`
- `parcel_size_category`
- `valuation_band`
- `neighborhood_density_class`

Quality and outlier logic currently flags:

- source geometries repaired during the clean-table step
- invalid or missing clean geometry
- tiny acreage records
- very large acreage records
- extreme value-per-acre records
- duplicate `pin14` groups
- missing `pin14`
- missing subdivision or neighborhood context
- placeholder/administrative subdivision names
- missing value fields
- null-heavy records

Classifications currently include:

- parcel size: `micro`, `residential_standard`, `estate`, `commercial_large`, `extreme_large`
- valuation band: `low`, `medium`, `high`, `luxury`, `ultra_high`, `unknown`
- neighborhood density: `sparse`, `low`, `moderate`, `high`, `very_high`, `unknown`

The enrichment creates indexes for:

- `official_parcel_id`
- `objectid_1`
- `pin14`
- `parcel_quality_status`
- `subdivision_quality_status`
- `valuation_band`
- `parcel_size_category`
- `neighborhood_density_class`
- `subdiv_name`
- `nbh_name`
- `geometry`

Validation and analytics artifacts are written to:

```text
outputs/parcels_enriched_summary.json
outputs/parcels_quality_flags.csv
outputs/parcels_outlier_summary.csv
```

These outputs include flagged parcel counts, duplicate parcel groups,
suspicious subdivisions, largest parcels, highest value-per-acre parcels,
parcel size distribution, valuation distribution, and subdivision/neighborhood
quality summaries.

Future zoning, floodplain, permit, and infrastructure joins should target
`public.parcels_enriched` through `official_parcel_id`, `objectid_1`, spatial
joins, or a governed business parcel identifier strategy. Production joins and
APIs should wait until layer contracts, refresh cadence, and ownership are
confirmed.

## Current Zoning Overlay Pilot

The first overlay pilot ingests the Cabarrus County Current Zoning Districts
ArcGIS REST layer into:

```text
public.zoning
```

Run the zoning ingest with:

```powershell
python ingest\ingest_zoning.py
```

The raw zoning ingest writes:

```text
outputs/ingest_zoning_summary.json
```

Profile the raw zoning table with:

```powershell
python inspect\inspect_zoning_postgis.py
```

The profile writes:

```text
outputs/zoning_profile_summary.json
outputs/zoning_column_profile.csv
```

The zoning profile reports row count, geometry type counts, SRID distribution,
invalid geometry count, table columns, null percentages, likely zoning
code/name fields, unique zoning classes, bounding box, and spatial index status.

Create the cleaned zoning overlay with:

```powershell
python transform\create_zoning_clean.py
```

The cleaning SQL is saved in:

```text
sql/create_zoning_clean.sql
```

`public.zoning_clean` policy:

- create `zoning_internal_id` from source `OBJECTID`
- preserve `zoning_code` from `ZONINGCODE`
- preserve `zoning_general` from `ZONING_GEN`
- create `zoning_label` for search/display
- repair invalid geometry with `ST_MakeValid`
- extract polygonal geometry and coerce to `MultiPolygon`
- keep SRID `4326`
- add `transformed_at`
- create btree indexes on zoning identifiers/classes
- create a GiST spatial index on geometry

Validation artifacts are written to:

```text
outputs/zoning_clean_validation.json
outputs/zoning_class_summary.csv
```

The current pilot does not perform parcel-zoning joins. The intended next step
is a controlled spatial join test between `public.parcels_enriched` and
`public.zoning_clean`, with explicit reporting of overlap confidence, parcels
with multiple zoning intersections, and dropped/invalid zoning source features.

## Parcel-Zoning Overlay Pilot

The first parcel-zoning spatial join pilot creates:

```text
public.parcel_zoning_overlay
```

Run it with:

```powershell
python enrich\create_parcel_zoning_overlay.py
```

The overlay uses `public.parcels_enriched.geometry` and
`public.zoning_clean.geometry` to calculate parcel/zoning intersection area,
dominant zoning, overlap percentage, confidence, and join status. It keeps one
row per parcel and preserves:

- `official_parcel_id`
- `objectid_1`
- `pin14`
- dominant zoning code/general/label
- zoning overlap count
- dominant overlap percentage
- confidence
- multiple-zoning flag
- no-match flag
- parcel geometry

Confidence policy:

- `high`: dominant zoning overlap is at least `95%` of parcel area
- `medium`: dominant zoning overlap is at least `75%` and below `95%`
- `low`: dominant zoning overlap is below `75%`
- `no_match`: no positive-area zoning intersection

Validation artifacts are written to:

```text
outputs/parcel_zoning_overlay_validation.json
outputs/parcel_zoning_summary.csv
outputs/parcel_zoning_low_confidence.csv
outputs/parcel_zoning_no_match.csv
```

The current zoning source does not cover every parcel in
`public.parcels_enriched`. A high no-match count should be treated as a coverage
and governance signal, not as a frontend-ready parcel zoning product.

## Zoning Coverage Diagnostics

Investigate parcel-zoning no-match coverage with:

```powershell
python inspect\diagnose_zoning_coverage.py
```

The diagnostic SQL examples are saved in:

```text
sql/diagnose_zoning_coverage.sql
```

Outputs:

```text
outputs/zoning_coverage_diagnostics.json
outputs/zoning_no_match_by_neighborhood.csv
outputs/zoning_no_match_by_subdivision.csv
outputs/zoning_no_match_samples.csv
```

The diagnostics compare parcel, zoning, assigned-parcel, and no-match extents;
summarize no-match parcels by neighborhood, subdivision, quality status, area,
and mailing city; and estimate distance from each no-match parcel representative
point to the nearest zoning polygon. `mailcity` is not a governed jurisdiction
field, so municipal coverage conclusions must be verified with real municipal
boundary or zoning source layers.

## Multi-Jurisdiction Zoning And Planning Boundaries

The county-only zoning layer does not cover every parcel. The Phase 2
foundation now ingests separate zoning sources for each known jurisdiction and
the ETJ/planning boundary layer without treating those classes as equivalent.

Source configuration lives in:

```text
config/zoning_sources.json
config/planning_boundary_sources.json
```

Run all jurisdiction zoning ingests with:

```powershell
python ingest\ingest_zoning_sources.py
```

This writes the raw jurisdiction-specific tables:

```text
public.zoning_county
public.zoning_concord
public.zoning_harrisburg
public.zoning_kannapolis
public.zoning_locust
public.zoning_midland
public.zoning_mount_pleasant
```

Run ETJ/planning boundary ingestion with:

```powershell
python ingest\ingest_planning_boundaries.py
```

This writes:

```text
public.planning_boundaries
```

Create the normalized planning foundations with:

```powershell
python transform\create_zoning_jurisdictional_clean.py
python transform\create_planning_boundaries_clean.py
```

The normalized tables are:

```text
public.zoning_jurisdictional_clean
public.planning_boundaries_clean
```

`public.zoning_jurisdictional_clean` preserves raw municipal zoning codes and
source-specific fields, including `ZONING_GEN`, `Zoning_Typ`, `BASE_DISTR`,
`CONDITIONA`, and `ZONING` where present. It adds conservative broad categories
only when obvious, repairs invalid geometry, coerces polygonal features to
`MultiPolygon`, keeps SRID `4326`, and indexes jurisdiction, raw zoning code,
normalized broad category, normalized label, and geometry.

`public.planning_boundaries_clean` is a jurisdiction context layer for ETJ /
planning boundaries. It should not be treated as zoning. It preserves the raw
boundary name, infers a clean jurisdiction name, tags boundary type as `etj`,
repairs geometry, keeps SRID `4326`, and indexes jurisdiction, boundary type,
boundary name, and geometry.

Outputs:

```text
outputs/zoning_sources_ingest_summary.json
outputs/zoning_jurisdictional_clean_validation.json
outputs/zoning_jurisdictional_class_summary.csv
outputs/zoning_jurisdictional_schema_comparison.csv
outputs/planning_boundaries_ingest_summary.json
outputs/planning_boundaries_clean_validation.json
outputs/planning_boundaries_summary.csv
```

This foundation is ready for the next controlled overlay step: first determine
parcel jurisdiction/planning context, then run a multi-source parcel zoning
overlay against `public.zoning_jurisdictional_clean`.

## Parcel Jurisdiction / Planning-Boundary Overlay

The planning-boundary overlay creates one row per parcel in:

```text
public.parcel_jurisdiction_overlay
```

Run it with:

```powershell
python enrich\create_parcel_jurisdiction_overlay.py
```

This overlay intersects `public.parcels_enriched.geometry` with
`public.planning_boundaries_clean.geometry` and assigns a dominant planning /
ETJ context by largest parcel overlap. It preserves parcel identity,
neighborhood, subdivision, parcel quality status, overlap count, overlap
percentage, confidence, join status, and parcel geometry.

Confidence policy:

- `high`: dominant planning-boundary overlap is at least `95%` of parcel area
- `medium`: dominant planning-boundary overlap is at least `75%` and below `95%`
- `low`: dominant planning-boundary overlap is below `75%`
- `no_match`: no positive-area planning-boundary intersection

Validation artifacts are written to:

```text
outputs/parcel_jurisdiction_overlay_validation.json
outputs/parcel_jurisdiction_summary.csv
outputs/parcel_jurisdiction_no_match.csv
outputs/parcel_jurisdiction_low_confidence.csv
```

Important: `public.planning_boundaries_clean` is a planning/ETJ context layer,
not a zoning layer and not a complete municipal boundary fabric. A no-match
parcel should not be treated as an error by itself; it means the parcel is not
covered by this planning-boundary source.

## Multi-Source Parcel Zoning Overlay V2

The multi-source zoning overlay creates:

```text
public.parcel_zoning_overlay_v2
```

Run it with:

```powershell
python enrich\create_parcel_zoning_overlay_v2.py
```

This overlay intersects `public.parcels_enriched.geometry` with every
jurisdictional zoning polygon in `public.zoning_jurisdictional_clean.geometry`.
It assigns dominant zoning by largest parcel overlap percentage and joins
supporting planning context from `public.parcel_jurisdiction_overlay`.

The v2 assignment policy is intentionally spatial-first:

- do not force county zoning to dominate
- let municipal zoning dominate when it spatially covers most of the parcel
- preserve raw jurisdictional zoning codes
- keep conservative broad categories only as helper labels
- preserve multi-zone and multi-jurisdiction ambiguity
- keep planning/ETJ context separate from zoning assignment

Confidence policy:

- `high`: dominant zoning overlap is at least `95%` of parcel area
- `medium`: dominant zoning overlap is at least `75%` and below `95%`
- `low`: dominant zoning overlap is below `75%`
- `no_match`: no positive-area zoning intersection

Diagnostics include:

- county-only v1 versus multi-source v2 assignment comparison
- assigned parcels by zoning jurisdiction
- dominant zoning code/class summaries
- multi-zone and multi-jurisdiction flags
- second-best zoning overlap and top-two overlap gap
- nearly equal overlap splits
- municipal zoning that strictly dominates county zoning overlap
- tiny sliver overlap flags
- remaining no-match clusters

Validation artifacts are written to:

```text
outputs/parcel_zoning_overlay_v2_validation.json
outputs/parcel_zoning_overlay_v2_summary.csv
outputs/parcel_zoning_overlay_v2_no_match.csv
outputs/parcel_zoning_overlay_v2_low_confidence.csv
outputs/parcel_zoning_overlay_v2_multi_jurisdiction.csv
```

`public.parcel_zoning_overlay_v2` is the strongest current candidate for the
future parcel zoning intelligence contract, but low-confidence, near-tie, and
multi-jurisdiction parcels should still be reviewed before any production API
or dashboard integration.

## Zoning Intelligence QA And Governance Readiness

The QA pass creates:

```text
public.parcel_zoning_intelligence_qa
```

Run it with:

```powershell
python inspect\qa_parcel_zoning_overlay_v2.py
```

This pass does not change zoning assignments. It classifies
`public.parcel_zoning_overlay_v2` records into governance warning categories for
future read-only backend/API planning.

Coverage improvement from the county-only v1 overlay to multi-source v2:

```text
v1 assigned parcels: 27,157
v1 no-match parcels: 82,860
v2 assigned parcels: 109,984
v2 no-match parcels: 33
assignment improvement: 82,827 parcels
```

Multi-source zoning was required because county/unincorporated zoning alone did
not cover municipal zoning jurisdictions. County zoning should not always
dominate because the correct jurisdictional zoning source should be determined
by spatial overlap and source coverage, not by a hardcoded priority rule.

QA warning categories:

- `safe_for_dashboard`
- `review_low_confidence`
- `review_multi_jurisdiction`
- `review_near_tie`
- `review_sliver_overlap`
- `no_zoning_match`
- `jurisdiction_code_semantics_review`

`safe_for_dashboard` appears only when no review warnings are present. A parcel
is sent to review if it has no zoning match, low confidence, competing
jurisdictions, a near-tie overlap split, sliver overlap artifacts, or a zoning
code whose broad category remains unknown and needs jurisdiction-specific
semantic review.

QA outputs:

```text
outputs/parcel_zoning_intelligence_qa_summary.json
outputs/parcel_zoning_governance_warnings.csv
outputs/parcel_zoning_by_jurisdiction_summary.csv
outputs/parcel_zoning_ambiguity_hotspots.csv
```

Limitations before production/API use:

- broad zoning categories are conservative helper labels, not legal
  equivalencies across municipalities
- unknown zoning categories must be governed by jurisdiction-specific codebooks
- sliver and near-tie cases need review rules before automated decisions
- multi-jurisdiction assignments should surface warnings in any API response
- the frontend should remain disconnected until a read-only data contract is
  reviewed

## Phase 3 Historical Permit Activity Pilot

The first development activity ingestion pilot uses the public Cabarrus County
OpenData `Permits 2015` layer:

```text
https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/33
```

Source configuration is stored in:

```text
config/permit_activity_sources.json
```

Run the ingestion, profile, and clean transform with:

```powershell
python ingest\ingest_permit_activity.py
python inspect\inspect_permit_activity_postgis.py
python transform\create_permit_activity_clean.py
```

Tables:

- `public.permit_activity`: raw ArcGIS REST landing table
- `public.permit_activity_clean`: standardized clean permit activity table

The pilot preserves permit/application identifiers, `PIN14`, owner/applicant,
address, subdivision, permit category/type/subtype/status, filed date, source
metadata, and polygon geometry. The clean table standardizes:

- `permit_id`
- `pin14`
- `permit_status_normalized`
- `permit_type_normalized`
- `permit_category_normalized`
- `activity_date`
- `activity_year`
- `activity_month`
- repaired/coerced `MultiPolygon` geometry in SRID `4326`

Outputs:

```text
outputs/permit_activity_ingest_summary.json
outputs/permit_activity_profile_summary.json
outputs/permit_activity_column_profile.csv
outputs/permit_activity_clean_validation.json
```

The public pilot source is historical and should not be treated as the
authoritative current permitting system of record. It remains useful as a
spatial reference because it includes polygon geometry, but it only covers 2015.

## Phase 3 Real Property Permit Ingestion

The primary Phase 3 permit ingestion path uses the Cabarrus County Real Property
Permit SharePoint CSV:

```text
https://cabarruscountync.sharepoint.com/:x:/g/CabarrusCounty/ERNqFGtfcaxKrHNrgdKaTaoBBgVAADJsQVXPezRfkYQ6Xw?e=HJ0xjl&download=1
```

Source configuration is stored in:

```text
config/real_property_permit_sources.json
```

Run the raw ingestion and clean transform with:

```powershell
python ingest\ingest_real_property_permit.py
python transform\create_real_property_permit_clean.py
```

Tables:

- `public.real_property_permit`: raw SharePoint CSV landing table
- `public.real_property_permit_clean`: standardized primary permit table

This path preserves all source fields and source metadata, normalizes source
columns to lowercase, and standardizes:

- `permit_id` from `PermitID`
- `permit_number` from `PermitNumber`
- `permit_date` / `activity_date` from `PermitDate`
- `parcel_number` from `ParcelNumber`
- `parcel_id_source` from `ParcelID`
- `permit_code`, `permit_amount`, `permit_notes`
- `building_number`, `work_type`, `permit_type`
- `co_date`, `permit_status`, `appraiser`
- `activity_year` and `activity_month`
- `permit_date_quality_status` and `co_date_quality_status`

The Real Property source does not include geometry. Future permit spatial
context should be derived through a governed `parcel_number` to parcel/PIN
relationship against the trusted parcel intelligence layers. Do not use the
2015 pilot geometry as a substitute for current permit geometry without QA.

Indexes created on `public.real_property_permit_clean`:

- unique `permit_id`
- `permit_number`
- `parcel_number`
- `permit_date`
- `activity_year`
- `activity_month`
- `permit_status_normalized`
- `permit_type_normalized`
- `work_type_normalized`

Outputs:

```text
outputs/real_property_permit_ingest_summary.json
outputs/real_property_permit_clean_validation.json
outputs/real_property_permit_year_summary.csv
outputs/real_property_permit_type_summary.csv
outputs/real_property_permit_status_summary.csv
```

Current validation highlights:

- raw rows: `64,426`
- clean rows: `64,426`
- `PermitID`: unique across all rows
- `ParcelNumber`: 100% populated and the best parcel/PIN join candidate
- `PermitDate`: `1986-12-01` through `2025-12-31`
- `CODate`: one future outlier is flagged for QA

The 2015 OpenData permit tables remain untouched and should be treated as a
historical spatial pilot, not the primary Phase 3 source.

## Phase 3 Real Property Permit-To-Parcel Relationship

The first primary permit relationship layer connects:

```text
public.real_property_permit_clean
```

to:

```text
public.parcels_enriched
public.parcel_zoning_overlay_v2
public.parcel_zoning_intelligence_qa
```

Run it with:

```powershell
python enrich\create_real_property_permit_parcel_relationship.py
```

The relationship table is:

```text
public.real_property_permit_parcel_relationship
```

Relationship policy:

- primary join: `real_property_permit_clean.parcel_number` to
  `parcels_enriched.pin14`
- normalized fallback: lowercased alphanumeric-only parcel/PIN keys
- geometry is not used because the Real Property Permit CSV has no authoritative
  geometry
- one parcel may have many permits
- one permit should usually map to one parcel, but multiple parcel matches are
  retained and flagged
- the 2015 permit pilot remains preserved as historical spatial context only

Relationship confidence:

- `high`: exact `ParcelNumber` to `pin14` match with one parcel result
- `medium`: normalized key match with one parcel result
- `low`: multiple parcel matches
- `no_match`: no parcel match

Outputs:

```text
outputs/real_property_permit_parcel_relationship_validation.json
outputs/real_property_permit_parcel_relationship_summary.csv
outputs/real_property_permit_parcel_no_match.csv
outputs/real_property_permit_parcel_ambiguous.csv
outputs/real_property_permit_by_parcel_summary.csv
outputs/real_property_permit_by_year_summary.csv
outputs/real_property_permit_by_zoning_summary.csv
```

Current validation highlights:

- total permit records: `64,426`
- permits matched to parcels: `64,231`
- unmatched permits: `195`
- match rate: `99.6973%`
- multiple parcel match permit count: `2,427`
- high-confidence permit relationships: `61,804`
- low-confidence ambiguous permit relationships: `2,427`
- `CODate` future outlier carry-through: `1` permit

This relationship layer is ready for development activity analytics planning,
temporal summaries, and a future backend/API contract. It is not a live
real-time permit feed and should not be connected to the frontend until the
permit relationship QA contract is reviewed.

## Phase 3 Development Activity Analytics

The development activity analytics layer aggregates Real Property
permit-to-parcel relationships into parcel, temporal, and zoning summaries.

Run it with:

```powershell
python enrich\create_development_activity_analytics.py
```

Tables:

- `public.development_activity_parcel_summary`
- `public.development_activity_time_summary`
- `public.development_activity_zoning_summary`

Parcel summary fields include total permits, first/latest permit dates, active
permit years, trailing 1-year and 3-year counts based on the dataset max
`activity_date`, total/average permit amount, dominant permit/work type, latest
permit status, zoning context, ambiguity flags, and development activity score.

Development activity classes:

- `no_activity`
- `low_activity`
- `moderate_activity`
- `high_activity`
- `very_high_activity`

Outputs:

```text
outputs/development_activity_parcel_summary_validation.json
outputs/development_activity_top_parcels.csv
outputs/development_activity_year_summary.csv
outputs/development_activity_month_summary.csv
outputs/development_activity_zoning_summary.csv
```

Current validation highlights:

- total parcels: `110,017`
- parcels with permit activity: `43,474`
- parcels without permit activity: `66,543`
- parcels with trailing 1-year activity: `3,091`
- parcels with trailing 3-year activity: `9,388`
- very high activity parcels: `551`
- high activity parcels: `2,430`
- moderate activity parcels: `27,425`

Annual and monthly outputs include both source permit amount totals and
relationship-row amount totals so ambiguous permit-to-parcel relationships
remain transparent.

## Logging And Outputs

Each ingestion run logs:

- source feature count
- downloaded feature count
- geometry type
- CRS
- sample columns
- null geometry handling
- database connection and PostGIS check
- table write behavior
- spatial index creation
- ingestion duration

Logs are written to `logs/ingest_tax_parcels_YYYYMMDD_HHMMSS.log`.

The latest structured summary is written to `outputs/ingest_tax_parcels_summary.json`.

## Defensive Behavior

The script includes:

- ArcGIS REST metadata inspection
- pagination with `resultOffset` and `resultRecordCount`
- object ID chunk fallback if offset pagination fails
- retry handling for transient HTTP failures
- null geometry detection and removal
- lowercase-safe column normalization
- database connection verification
- PostGIS extension verification through `postgis_full_version()`
- configurable `to_postgis(if_exists=...)`
- explicit GiST spatial index creation

## Future Layer Workflow

Future CFS ingestion pilots should follow this pattern:

1. Add a standalone script in `ingest/`.
2. Keep source URLs, target tables, and field mappings explicit.
3. Add pagination and null-geometry handling.
4. Write a structured summary to `outputs/`.
5. Add verification SQL in `sql/`.
6. Keep frontend/dashboard integration separate until the pipeline and data contract are validated.

This keeps CFS moving toward operational spatial intelligence without coupling early ingestion pilots to the dashboard shell.

## Next Recommended Step

The next Phase 3 data-pipeline task should define the backend/API contract for
development activity intelligence:

1. design parcel activity detail, search, filter, trend, and zoning summary
   response schemas,
2. document how `no_match` and ambiguous permit relationships surface in API
   responses,
3. identify indexes/materialized views required for responsive dashboard
   queries,
4. keep the frontend disconnected until the API contract is reviewed.

Do not connect the frontend or create APIs until the permit relationship data
contract is validated.
