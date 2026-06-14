# Historical Zoning Snapshots And Zoning Change Features

Phase 10D-1 creates a historical zoning foundation for future model comparison.
It does not train a model, expose predictions, or rewrite the Phase 10B feature
matrix.

## Historical Service Root

Historical zoning layers are registered from:

`https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer`

This service is distinct from the current zoning services registered in Phase
10D-0. Layer URLs are constructed by appending the layer ID:

`https://location.cabarruscounty.us/arcgisservices/rest/services/opendata/MapServer/{layer_id}`

Only zoning layers are included. Group headers and non-zoning layers such as
parcels, permits, streets, addresses, schools, school districts, water supply
watershed, recreation facilities, and annotation layers are intentionally
ignored.

## Source Years

The registered historical layers cover 2005 through 2015, with uneven
jurisdiction coverage in earlier years. The source registry is:

`config/historical_zoning_sources.json`

Generated source inventory artifacts:

- `outputs/historical_zoning_source_inventory.json`
- `outputs/historical_zoning_source_inventory.csv`

## Raw And Clean Tables

Historical zoning is staged separately from current zoning:

- `public.historical_zoning_raw`
- `public.historical_zoning_clean`

The raw table preserves source attributes as JSONB and the source geometry. The
clean table normalizes key fields:

- source key/name/year/layer;
- jurisdiction;
- zoning code;
- broad zoning category;
- case number if present;
- date-like field if present;
- repaired 4326 multipolygon geometry;
- schema quality.

The clean table is not a parcel overlay and does not replace
`public.parcel_zoning_overlay_v2`.

## Parcel-Year Snapshot Rules

The snapshot table is:

`public.parcel_zoning_snapshot_year`

For snapshot year `Y`, the transform uses the most recent historical source year
less than or equal to `Y`. It never uses current zoning as a historical
fallback.

Temporal labels:

- `exact_year`: a historical zoning source exists for the snapshot year.
- `prior_available_year`: the latest earlier historical source is reused.
- `unavailable`: no historical source intersects the parcel for that year.

For years after 2015, the 2015 source can be time-safe because it is not after
the snapshot year, but it is stale. The table carries this through
`zoning_source_age_years` and review flags. Stale does not mean current.

## Change Event Rules

The map-change event table is:

`public.parcel_zoning_change_events`

Events are detected by comparing parcel snapshots across available exact source
years. The event `change_year` is the new source year where the mapped zoning
assignment differs from the prior available exact source snapshot.

These are zoning map-change detections, not official rezoning case events. They
do not provide exact approval dates unless source case/date fields are linked in
a future phase.

Change fields include:

- previous and new zoning code;
- previous and new broad category;
- zoning jurisdiction;
- previous and new source year;
- change type;
- intensity direction;
- confidence;
- notes.

## Candidate Model Features

The feature registry adds future-ready historical zoning fields:

- `zoning_history_available_flag`
- `zoning_source_age_years`
- `zoning_changed_prior_1yr`
- `zoning_changed_prior_3yr`
- `zoning_changed_prior_5yr`
- `zoning_change_count_prior_5yr`
- `years_since_last_zoning_change`
- `latest_zoning_change_type`
- `zoning_intensity_increased_prior_5yr`
- `rezoned_to_growth_supportive_prior_5yr`
- `zoning_change_confidence`
- `zoning_temporal_status`

These are marked `include_in_future_model=true` and
`include_in_strict_baseline=false`. Phase 10E has now compared them in a
separate internal zoning-enhanced experiment without changing the strict
baseline or exposing probabilities.

## Phase 10E Model Comparison Use

Phase 10E builds
`public.parcel_development_prediction_features_zoning_enhanced` from the Phase
10B feature matrix plus:

- `public.parcel_zoning_snapshot_year`;
- `public.parcel_zoning_change_events`.

The enhanced matrix keeps one row per `official_parcel_id` and `snapshot_year`
and validates:

- zoning source year `<= snapshot_year`;
- detected zoning change year `<= snapshot_year`;
- no current zoning fallback for historical years;
- no current-context rows in the enhanced historical zoning fields.

The internal comparison for `new_construction_next_3yr` showed improved test
PR-AUC and top-5% lift compared with the retrained strict baseline, but the
result is still exploratory. These zoning features should be described as
historical zoning map context and map-change signals, not official rezoning
case approvals.

## Limitations

- Historical layers are not a complete official rezoning case history.
- Earlier years have uneven municipal coverage.
- Some schemas vary by jurisdiction and year.
- One source layer, `kannapolis_zoning_2009`, has records but no clear zoning
  code field and remains schema-review data.
- Post-2015 zoning snapshots are time-safe but stale if no newer historical
  source is available.
- Intensity categories are conservative planning heuristics and need planning
  staff review before production modeling.

## Future Work

Next work should compare the zoning-enhanced signal with official rezoning case
data, future land-use, subdivision approvals, road/accessibility, utilities,
and calibrated holdout validation before any production model discussion.
Production use still needs official rezoning case data with approval dates,
old zoning, new zoning, decision/status, jurisdiction, and parcel or case
geometry.
