# Sewer Allocation And Development Pipeline Source Notes

Phase 16A registers several high-value planning, sewer allocation, and
development pipeline references without parsing them into production tables.
They should remain inventory-only until the source files are available in a
stable, structured form and can pass QA.

## Source Handling Rules

- Do not fake sewer allocation, utility capacity, project status, or remaining
  capacity values.
- Do not treat policy PDFs as parcel-level allocation records.
- Do not treat Concord-only or Kannapolis-only documents as countywide.
- Do not load PDF-derived values into production feature tables until a
  repeatable extraction, field dictionary, and manual QA process exists.
- WSACC/RevalMap layers are utility proximity proxies only. They are not sewer
  capacity or allocation data.

## Registered Inventory References

### Concord Sewer Allocation Policy PDF

Use: future policy/context reference for sewer allocation logic.

Current status: inventory only. No values are parsed or loaded.

Needed before ingestion:
- source URL or local file path
- date/version of the policy
- structured fields, if any
- explicit distinction between policy rules and project-level allocation awards

### Concord Sewer Allocation Project Summary PDF

Use: possible future project-level sewer allocation signal for Concord.

Current status: inventory only.

Needed before ingestion:
- stable source file
- project name
- allocation status
- allocation amount/unit, if present
- approval or decision date, if present
- parcel, address, subdivision, or project geometry crosswalk

### Kannapolis Wastewater Allocation Policy PDF

Use: future policy/context reference for Kannapolis wastewater allocation.

Current status: inventory only.

Needed before ingestion:
- source URL or local file path
- policy date/version
- project-level table if available
- explicit jurisdiction scope

### Kannapolis Wastewater Allocation Exhibit A

Use: possible future structured allocation/project list.

Current status: inventory only until the file is provided and reviewed.

Needed before ingestion:
- row-level project identifiers
- allocation status and amount, if available
- date fields
- parcel/address/subdivision crosswalk
- QA for duplicate projects and outdated rows

### Harrisburg Current Projects Web Reference

Use: possible future development pipeline context for Harrisburg.

Current status: inventory only. Do not scrape into production without stable
structure and QA.

Needed before ingestion:
- project name
- project type
- status
- approval or update date
- location geometry or parcel/address link

### Harrisburg Residential Summary PDF

Use: possible future residential development pipeline reference.

Current status: inventory only.

Needed before ingestion:
- structured table extraction
- project status definitions
- date fields
- parcel/address/subdivision crosswalk

### CRMPO / NCDOT CTP References

Use: future planned transportation context, especially if dated project geometry
or status records are available.

Current status: inventory only. Current Phase 13 transportation features already
handle STIP/AADT/current accessibility context separately.

Needed before ingestion:
- planned project geometry
- project year or horizon
- status/funding stage
- route or corridor name
- adopted plan date

## Phase 16A Data Products

Phase 16A creates current-context feature tables for sources that are already
REST-readable:

- Concord Central Area Plan layers
- Cabarrus Accela Plan Reviews
- RevalMap WSACC utility proxy layers
- Tax Parcels Full enrichment gap check

The combined table is `public.parcel_planning_pipeline_utility_features`.

These features are marked:

- `current_context_only = true`
- `time_safe_for_training = false`
- `include_in_strict_baseline = false`
- `include_in_future_model = true`

They are candidates for future exploratory model comparison only after caveats
are documented and governance review confirms appropriate use.
