# Current Zoning Context And Zoning Change Readiness

Phase 10D-0 registers and profiles current Cabarrus zoning services for model
readiness review. It does not create zoning-change events, alter the prediction
feature matrix, train a model, or assume current zoning existed in prior years.

## Sources Registered

The current-context source registry is `config/current_zoning_sources.json`.

| Source | Layer URL | Role |
| --- | --- | --- |
| Cabarrus County Zoning | `https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData/Cabarrus_County_Zoning/MapServer/0` | Current county/unincorporated zoning context |
| Concord Zoning | `https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData/Zoning_By_Municipalities/MapServer/0` | Current municipal zoning context |
| Harrisburg Zoning | `https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData/Zoning_By_Municipalities/MapServer/2` | Current municipal zoning context |
| Kannapolis Zoning | `https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData/Zoning_By_Municipalities/MapServer/3` | Current municipal zoning context |
| Locust Zoning | `https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData/Zoning_By_Municipalities/MapServer/4` | Current municipal zoning context |
| Midland Zoning | `https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData/Zoning_By_Municipalities/MapServer/5` | Current municipal zoning context |
| MtPleasant Zoning | `https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData/Zoning_By_Municipalities/MapServer/6` | Current municipal zoning context |

The municipal URL is a MapServer service root, so each inspected municipal
layer appends its layer ID to the service URL. Layer `1` was not assumed.

## Current-Context Use

Current zoning is useful for:

- present-day parcel intelligence;
- due-diligence review;
- zoning jurisdiction and broad category context;
- current-context exploratory modeling, when clearly labeled.

Current zoning is not automatically safe for historical model training. A
current zoning polygon should not be treated as the zoning in effect for older
snapshot years unless a verified historical source says so.

## Readiness Findings

The Phase 10D-0 service inventory produced:

- `outputs/current_zoning_source_schema_inventory.json`
- `outputs/current_zoning_source_schema_inventory.csv`
- `outputs/zoning_change_readiness_assessment.json`
- `outputs/phase10d0_current_zoning_source_inventory_summary.json`

Useful current-context fields were found across the sources, including zoning
code and district/category candidates. Some sources include possible future
link fields:

- Cabarrus County: `CASE_NUMBE`
- Harrisburg: `CASE_NUMBE`
- Kannapolis: `CASE_NUMBE`, `CU_CASE_`, and `EFFECTIVE_`
- Concord: `OLDZONING`

These fields are not enough to build reliable zoning-change events. A case
number can be a useful join key, but it is not a zoning-change event without a
dated approval/effective record and old/new zoning values.

## Why Geometry Alone Is Not Enough

Zoning-change features cannot be derived safely from current zoning geometry
alone. A current polygon shows the present legal/contextual condition, not the
date it became effective, the prior zoning, the decision status, or the parcel
history. Using current geometry as historical truth would leak future knowledge
into past training snapshots.

## Data Needed For Zoning-Change Features

Future zoning-change feature engineering requires a vetted source with:

- rezoning or zoning map amendment case records;
- approval or effective date;
- old zoning;
- new zoning;
- parcel or case geometry;
- jurisdiction;
- case status or decision.

Once those fields exist, CFS can build time-safe features such as prior zoning
change count, years since last rezoning, current-to-prior zoning transition,
and jurisdiction-specific rezoning activity.

## Phase 10D-1 Historical Source Update

Phase 10D-1 added a separate historical zoning source registry using:

`https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer`

That historical service is different from the current zoning services above.
The historical source registry is `config/historical_zoning_sources.json`.

Phase 10D-1 created:

- `public.historical_zoning_raw`
- `public.historical_zoning_clean`
- `public.parcel_zoning_snapshot_year`
- `public.parcel_zoning_change_events`

Historical source layers cover 2005 through 2015. Parcel snapshots after 2015
use the latest prior historical zoning source where available, which is
time-safe but stale. They are marked as `prior_available_year` and carry
`zoning_source_age_years`. Current zoning is still not used as a historical
fallback.

The change-event table detects map assignment changes across historical source
years. These remain zoning map-change detections, not official rezoning case
events, until dated case records with old/new zoning can be linked.

## Model Policy

The feature registry marks new current zoning context fields as:

- `time_safe = false`
- `current_context_only = true`
- `include_in_strict_baseline = false`
- `include_in_future_model = true`

They may support future current-context or explicitly leakage-aware research,
but they should remain excluded from strict time-safe baselines until historical
zoning evidence exists.
