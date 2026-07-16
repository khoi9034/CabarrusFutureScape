# CFS Cloud Stage Safety Report

Generated: 2026-07-16T17:12:46.404504+00:00

## Summary

- Stage database: `cfs_cloud_stage`
- Stage size: `8351 MB`
- Included tables: 75
- Excluded objects: 83
- Sensitive non-null findings: 0

## Sensitive Column Check

All detected sensitive/restricted compatibility columns are NULL in staging.

## Nulled Compatibility Columns

| Table | Column | Non-null rows |
| --- | --- | ---: |
| `public.development_prediction_model_experiment_scores` | `experimental_probability` | 0 |
| `public.development_prediction_model_experiment_scores` | `probability_rank` | 0 |
| `public.development_prediction_model_experiment_scores` | `probability_percentile` | 0 |
| `public.parcel_development_prediction_features_planning_pipeline_utilit` | `nearest_utility_owner` | 0 |
| `public.parcels` | `acctname1` | 0 |
| `public.parcels` | `acctname2` | 0 |
| `public.parcels` | `mailaddr1` | 0 |
| `public.parcels` | `mailaddr2` | 0 |
| `public.parcels` | `mailcity` | 0 |
| `public.parcels` | `mailstate` | 0 |
| `public.parcels` | `mailzipcode` | 0 |
| `public.parcels_enriched` | `acctname1` | 0 |
| `public.parcels_enriched` | `acctname2` | 0 |
| `public.parcels_enriched` | `mailaddr1` | 0 |
| `public.parcels_enriched` | `mailaddr2` | 0 |
| `public.parcels_enriched` | `mailcity` | 0 |
| `public.parcels_enriched` | `mailstate` | 0 |
| `public.parcels_enriched` | `mailzipcode` | 0 |
| `public.permit_activity` | `ownername` | 0 |
| `public.tax_parcel_value_enrichment` | `owner_name` | 0 |

## Geometry Validation

| Table | Column | Type | SRID | Rows | Null geometries | Invalid geometries | Spatial index |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| `public.fema_nfhl_flood_zones_clean` | `geometry` | MULTIPOLYGON | 4326 | 7712 | 0 | 0 | True |
| `public.investment_acs_tract_geometry` | `geometry` | MULTIPOLYGON | 4326 | 47 | 0 | 0 | True |
| `public.investment_environmental_facilities` | `geometry` | POINT | 4326 | 1497 | 0 | 0 | True |
| `public.investment_nwi_wetlands` | `geometry` | MULTIPOLYGON | 4326 | 9384 | 0 | 0 | True |
| `public.investment_soil_units` | `geometry` | MULTIPOLYGON | 4326 | 16656 | 0 | 0 | True |
| `public.parcel_flood_constraint_overlay` | `geometry` | MULTIPOLYGON | 4326 | 110017 | 0 | 0 | True |
| `public.parcel_jurisdiction_overlay` | `geometry` | GEOMETRY | 0 | 110017 | 0 | 0 | True |
| `public.parcel_school_assignment` | `geometry` | GEOMETRY | 0 | 110017 | 0 | 0 | True |
| `public.parcel_school_summary` | `geometry` | GEOMETRY | 0 | 110017 | 0 | 0 | True |
| `public.parcel_zoning_intelligence_qa` | `geometry` | GEOMETRY | 0 | 110017 | 0 | 0 | True |
| `public.parcel_zoning_overlay` | `geometry` | MULTIPOLYGON | 4326 | 110017 | 0 | 0 | True |
| `public.parcel_zoning_overlay_v2` | `geometry` | GEOMETRY | 0 | 110017 | 0 | 0 | True |
| `public.parcels` | `geometry` | GEOMETRY | 4326 | 110017 | 0 | 6 | True |
| `public.parcels_enriched` | `geometry` | MULTIPOLYGON | 4326 | 110017 | 0 | 0 | True |
| `public.permit_activity` | `geometry` | GEOMETRY | 4326 | 6766 | 0 | 0 | True |
| `public.school_reference` | `geometry` | POINT | 4326 | 53 | 0 | 0 | True |
| `public.school_zones` | `geometry` | MULTIPOLYGON | 4326 | 44 | 0 | 0 | True |
| `public.tax_parcel_value_enrichment` | `geometry` | GEOMETRY | 4326 | 110215 | 0 | 0 | True |
| `public.tax_parcel_value_enrichment` | `geometry_ft` | GEOMETRY | 2264 | 110215 | 0 | 0 | True |
| `public.transportation_aadt_stations_clean` | `geometry` | POINT | 4326 | 642 | 0 | 0 | True |
| `public.transportation_aadt_stations_clean` | `geometry_ft` | POINT | 2264 | 642 | 0 | 0 | True |
| `public.transportation_centerlines_clean` | `geometry` | MULTILINESTRING | 4326 | 14455 | 0 | 0 | True |
| `public.transportation_centerlines_clean` | `geometry_ft` | MULTILINESTRING | 2264 | 14455 | 0 | 0 | True |
| `public.transportation_rail_clean` | `geometry` | GEOMETRY | 4326 | 64 | 0 | 0 | True |
| `public.transportation_rail_clean` | `geometry_ft` | GEOMETRY | 2264 | 64 | 0 | 0 | True |
| `public.transportation_stip_projects_clean` | `geometry` | GEOMETRY | 4326 | 18 | 0 | 0 | True |
| `public.transportation_stip_projects_clean` | `geometry_ft` | GEOMETRY | 2264 | 18 | 0 | 0 | True |
| `public.zoning` | `geometry` | GEOMETRY | 4326 | 295 | 0 | 7 | True |
| `public.zoning_clean` | `geometry` | MULTIPOLYGON | 4326 | 293 | 0 | 0 | True |
| `public.zoning_jurisdictional_clean` | `geometry` | MULTIPOLYGON | 4326 | 3438 | 0 | 0 | True |

## Geometry Notes

- `public.parcels` retains 6 invalid source geometries for schema compatibility; no geometry was transformed or simplified during staging.
- `public.zoning` retains 7 invalid source geometries for schema compatibility; no geometry was transformed or simplified during staging.

## Safety Notes

- Raw WSACC source tables are excluded; derived parcel utility proxy tables are included.
- Owner, mailing, grantor/grantee, raw-score, and exact-probability compatibility columns are set to NULL when a table is required.
- No Azure restore was executed.
