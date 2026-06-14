# Transportation and Accessibility Features

Phase 12A inventories transportation source candidates for future CFS
development prediction work. It does not ingest road geometries, create parcel
features, train a model, or expose prediction output.

## Why Transportation Matters

Transportation access is one of the basic location factors behind development
feasibility. Parcels near existing roads, major corridors, interchanges, or
planned access improvements may be easier to serve, subdivide, or develop than
parcels with limited access. Rail proximity can also matter for industrial or
logistics-oriented activity, although it can also represent a compatibility
constraint for some uses.

For CFS, transportation features should remain descriptive until the source
history and project timing are clear. Current road centerlines can describe
today's accessibility. They should not be used as historical conditions in a
time-series model unless historical centerlines or dated project records exist.

## Registered Phase 12A Sources

- Dedicated Cabarrus County Centerlines layer:
  `https://location.cabarruscounty.us/arcgisservices/rest/services/OpenData/Cabarrus_County_Centerlines/MapServer/1`
- Legacy opendata Streets Centerline layer:
  `https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/45`
- NC Railroad Centerline layer:
  `https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/43`
- NC Railroad Corridor layer:
  `https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/44`
- Context-only municipal district and county boundary layers:
  `https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/0`
  and
  `https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/1`

Cabarrus REST services may move during ongoing layer organization. If a URL
fails, inspect service roots and update the source registry before marking a
source unavailable.

## Future Candidate Features

Future Phase 12B/12C work can derive parcel-level features such as:

- `distance_to_nearest_road`
- `distance_to_major_road`
- `distance_to_highway_or_corridor`
- `distance_to_rail_corridor`
- `road_density_near_parcel`
- `intersection_density_near_parcel`
- `corridor_access_score`
- `near_planned_transportation_project`
- `transportation_accessibility_score`

These should be added to the prediction feature registry only after source
field mapping, geometry QA, and temporal-safety policy are complete.

## Road Centerline Use

Road centerlines are useful because they provide line geometry for distance,
network adjacency, road density, and corridor proximity calculations. For
development prediction, the strongest features usually require road class,
route type, access hierarchy, or major corridor indicators. If those fields are
missing or inconsistent, CFS can still derive basic distance-to-road features
but should avoid overclaiming major-access scoring.

## Planned Projects

Adopted transportation plans and planned projects are often more predictive
than current centerlines. The preferred future data includes roadway widening,
road extensions, interchange or intersection improvements, project status,
funding status, expected year, and geometry. Those records can support
time-aware features if each project has reliable dates and status.

## Temporal Safety

Current transportation layers are current-context inputs unless historical
roads, dated construction records, or adopted project schedules are available.
For strict backtesting, CFS should not use a road or project that did not exist
or was not known as of the snapshot year. Future model features must record
whether they are:

- `time_safe`, based only on source records available by `snapshot_year`;
- `current_context`, useful for today's due diligence but not historical
  prediction training;
- `not_available`, deliberately absent until the correct source exists.

## Current Limitations

- Field mapping for road class, route type, speed, and maintenance ownership
  must be confirmed.
- Highway/interchange access may require NCDOT or internal transportation plan
  data beyond county centerlines.
- Planned transportation project timing is not yet registered.
- No transportation features are currently included in the active internal
  ranking research or frontend.

## Phase 12B Feature Engineering

Phase 12B ingests the dedicated Cabarrus County Centerlines layer and rail
reference layers into PostGIS staging tables:

- `public.transportation_centerlines_raw`
- `public.transportation_centerlines_clean`
- `public.transportation_rail_raw`
- `public.transportation_rail_clean`

It then creates one row per parcel in:

- `public.parcel_transportation_accessibility_features`

Feature rows: `110,017`, matching `public.parcels_enriched`.

Created parcel features:

- `distance_to_nearest_road_ft`
- `nearest_road_name`
- `nearest_road_type`
- `distance_to_nearest_major_road_ft`
- `nearest_major_road_name`
- `road_length_within_500ft`
- `road_length_within_1000ft`
- `road_length_within_half_mile`
- `road_density_1000ft`
- `road_density_half_mile`
- `intersection_count_within_1000ft`
- `distance_to_nearest_rail_ft`
- `rail_corridor_within_half_mile`

The road-length and density measures are centroid-buffer proximity features in
North Carolina StatePlane feet. They are useful for internal feature comparison
but should be documented as current-context accessibility signals.

Major-road fields are intentionally null in Phase 12B. The source contains only
five explicitly classed major-road-like segments, which is too sparse to serve
as a countywide major-road hierarchy. CFS should request NCDOT or internal road
classification data before using major-road or highway/interchange features.

Intersection count is also intentionally null. Reliable intersections require
clean network topology and should not be derived from raw line crossings without
QA.

Rail features were created from:

- NC Railroad Centerline: `63` records
- NC Railroad Corridor: `1` record

The current Phase 12B outputs are:

- `outputs/transportation_centerline_ingest_summary.json`
- `outputs/transportation_accessibility_feature_profile.json`
- `outputs/transportation_accessibility_missingness.csv`
- `outputs/transportation_accessibility_distance_distribution.csv`
- `outputs/phase12b_transportation_accessibility_feature_summary.json`

Phase 12C can compare a transportation-enhanced internal model, but the
features must remain marked as current-context unless historical road/project
dates are added.

## Phase 13A Found Transportation Context Sources

Phase 13A registers two already-found NCDOT transportation context sources:

- NCDOT 2026-2035 STIP Projects:
  `https://gis11.services.ncdot.gov/arcgis/rest/services/NCDOT_STIP/MapServer/1`
- NCDOT AADT Traffic Count Stations:
  `https://services.arcgis.com/NuWFvHYDMVmmxMeM/ArcGIS/rest/services/NCDOT_AADT_Stations/FeatureServer/0`

STIP can support future planned/funded project proximity features such as:

- `near_ncdot_stip_project`
- `distance_to_nearest_stip_project`
- `stip_project_type`
- `stip_project_year_range`

AADT can support traffic-demand context features such as:

- `nearest_aadt_station_value`
- `distance_to_nearest_aadt_station`

These are not active model features yet. STIP does not include every local
concept road, small intersection improvement, or plan-only local project. AADT
station values are current traffic context unless historical AADT by year is
modeled explicitly. Future ingestion should filter statewide NCDOT sources to
Cabarrus County and preserve current-context/time-safety flags.

## Phase 13B STIP and AADT Feature Engineering

Phase 13B ingests Cabarrus-filtered records from the two Phase 13A NCDOT
sources:

- STIP: `18` clean Cabarrus-related project geometries from the statewide
  2026-2035 STIP layer;
- AADT: `642` clean Cabarrus station points from the statewide AADT station
  layer.

Staging and feature tables:

- `public.transportation_stip_projects_raw`
- `public.transportation_stip_projects_clean`
- `public.transportation_aadt_stations_raw`
- `public.transportation_aadt_stations_clean`
- `public.parcel_transportation_plan_traffic_features`

The parcel feature table has `110,017` rows and matches
`public.parcels_enriched`.

Created planning/traffic context features:

- `nearest_stip_project_distance_ft`
- `nearest_stip_project_name`
- `nearest_stip_project_type`
- `nearest_stip_project_year`
- `stip_project_within_half_mile`
- `stip_project_within_1_mile`
- `stip_project_count_within_1_mile`
- `stip_project_count_within_3_miles`
- `planned_transportation_investment_flag`
- `nearest_aadt_station_distance_ft`
- `nearest_aadt_station_route`
- `nearest_aadt_value`
- `nearest_aadt_count_year`
- `max_aadt_within_half_mile`
- `max_aadt_within_1_mile`
- `avg_aadt_within_1_mile`
- `aadt_station_count_within_1_mile`

Known caveats:

- STIP project status, funding status, and fiscal-year fields were unavailable
  in the inspected source and are preserved as null.
- Some nearest STIP project records lack a construction year, so
  `nearest_stip_project_year` is nullable.
- AADT values use the latest non-null `AADT_YYYY` field in the source and carry
  `nearest_aadt_count_year`.
- Both STIP and AADT features are current/planned context only. They are not
  time-safe strict historical model features until temporal availability is
  documented against snapshot years.

Aggregate-only readiness endpoint:

- `GET /development/prediction/transportation-plan-traffic/summary`

The endpoint reports row counts, proximity summaries, distribution summaries,
missingness, quality labels, and guardrails only. It does not expose
parcel-level predictions or ranking classes.

## Phase 13C Exploratory Transportation-Enhanced Comparison

Phase 13C combines the Phase 12B road/rail accessibility features and Phase 13B
STIP/AADT context features with the Phase 10E zoning-enhanced development
prediction feature matrix.

Feature table:

- `public.parcel_development_prediction_features_transportation_enhanced`

Feature table QA:

- row count: `1,430,221`;
- unique parcels: `110,017`;
- snapshot years: `2014-2026`;
- duplicate parcel-year groups: `0`;
- `transportation_current_context_only_flag=true` for every row;
- `transportation_time_safe_for_training_flag=false` for every row.

Transportation fields added to the model comparison include:

- `distance_to_nearest_road_ft`
- `road_density_1000ft`
- `road_density_half_mile`
- `distance_to_nearest_rail_ft`
- `rail_corridor_within_half_mile`
- `nearest_stip_project_distance_ft`
- `stip_project_within_half_mile`
- `stip_project_within_1_mile`
- `stip_project_count_within_1_mile`
- `stip_project_count_within_3_miles`
- `planned_transportation_investment_flag`
- `nearest_aadt_station_distance_ft`
- `nearest_aadt_value`
- `max_aadt_within_half_mile`
- `max_aadt_within_1_mile`
- `avg_aadt_within_1_mile`
- `aadt_station_count_within_1_mile`

Exploratory comparison against the zoning-enhanced internal model:

- zoning-enhanced PR-AUC: `0.071174`;
- transportation-enhanced PR-AUC: `0.087668`;
- zoning-enhanced lift at top 5%: `1.774988`;
- transportation-enhanced lift at top 5%: `4.108047`;
- zoning-enhanced precision at top 1%: `0.144414`;
- transportation-enhanced precision at top 1%: `0.133515`.

The transportation-enhanced run improved PR-AUC and top-5% ranking lift, but
top-1% precision declined. This should be treated as a promising internal
research signal rather than a production finding.

Top transportation features in the internal comparison include rail distance,
nearest road distance, STIP project counts, AADT summaries, and planned
transportation investment flags. These values are not time-safe historical
features yet because they describe current/planned transportation context.

To make this feature group suitable for strict historical model training, CFS
needs:

- historical road network snapshots or dated road construction records;
- dated STIP/project records with construction/completion timing;
- historical AADT by year;
- local transportation project GIS with status, funding, geometry, and dates;
- documented rules preventing future transportation information from entering
  earlier snapshot years.

No public prediction endpoint, parcel-level ranking endpoint, or frontend model
display is added in Phase 13C.
