# CFS Local Database Inventory

> `investment_*` objects in this inventory are retained legacy database records only; they are not active product routes, workflows, or app-role write grants.

Generated: 2026-07-16T16:58:37.066791+00:00

## Source Environment

- Source database: `cfs_dev`
- Application database user: `postgres`
- PostgreSQL: `PostgreSQL 18.4 on x86_64-windows, compiled by msvc-19.44.35226, 64-bit`
- PostGIS: `3.6.2`
- Total database size: `12 GB`
- Table-data size: `11 GB`
- Index size: `1147 MB`
- Schemas: `public`, `tiger`, `topology`
- Extensions: `address_standardizer`, `address_standardizer_data_us`, `fuzzystrmatch`, `h3`, `h3_postgis`, `mobilitydb`, `ogr_fdw`, `pg_sphere`, `pgrouting`, `plpgsql`, `pointcloud`, `pointcloud_postgis`, `postgis`, `postgis_raster`, `postgis_sfcgal`, `postgis_tiger_geocoder`, `postgis_topology`

## Object Counts

- Reviewed objects: 159
- Included objects: 75
- Excluded objects: 83
- Manual-review objects: 0

## Migration Actions

| Action | Count |
| --- | ---: |
| Include Entire Object | 69 |
| Include Sanitized Columns | 6 |
| Rebuild from Included Sources | 1 |
| Exclude | 83 |
| Manual Review Required | 0 |

## Included And Rebuilt Objects

| Object | Action | Required By | Read/Write |
| --- | --- | --- | --- |
| `public.development_activity_parcel_summary` | Include Entire Object | CFS Planning / Economics, active_backend_reference | read_only |
| `public.development_activity_time_summary` | Include Entire Object | not_required | read_only |
| `public.development_activity_zoning_summary` | Include Entire Object | not_required | read_only |
| `public.development_prediction_model_experiment_scores` | Include Sanitized Columns | Model Lab, active_backend_reference | read_only |
| `public.development_prediction_ranking_classes` | Include Entire Object | Model Lab, active_backend_reference | read_only |
| `public.development_prediction_ranking_explanations` | Include Entire Object | Model Lab, active_backend_reference | read_only |
| `public.fema_nfhl_flood_zones_clean` | Include Entire Object | CFS Planning Environmental, active_backend_reference | read_only |
| `public.investment_acs_market_context` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.investment_acs_tract_geometry` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.investment_assumption_template` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.investment_candidate_intake` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.investment_engagement` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.investment_environmental_facilities` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.investment_nwi_wetlands` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.investment_parcel_acs_geography` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.investment_parcel_environmental_context` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.investment_recent_work` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.investment_saved_item` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.investment_saved_search` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.investment_soil_units` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.investment_terrain_context` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.investment_underwriting_scenario` | Include Entire Object | Legacy Investments (retired) | read_only |
| `public.new_construction_permit_parcel_relationship` | Include Entire Object | active_backend_reference | read_only |
| `public.new_construction_permits_clean` | Include Entire Object | active_backend_reference | read_only |
| `public.parcel_development_model_features` | Include Entire Object | Model Lab, active_backend_reference | read_only |
| `public.parcel_development_prediction_features` | Include Entire Object | Model Lab, active_backend_reference | read_only |
| `public.parcel_development_prediction_features_planning_pipeline_utilit` | Include Sanitized Columns | Model Lab, active_backend_reference | read_only |
| `public.parcel_development_prediction_features_transportation_enhanced` | Include Entire Object | CFS Planning Transportation, Model Lab, active_backend_reference | read_only |
| `public.parcel_development_prediction_features_zoning_enhanced` | Include Entire Object | Model Lab, active_backend_reference | read_only |
| `public.parcel_development_prediction_labels` | Include Entire Object | Model Lab, active_backend_reference | read_only |
| `public.parcel_development_screening_output` | Include Entire Object | active_backend_reference | read_only |
| `public.parcel_flood_constraint_overlay` | Include Entire Object | CFS Planning Environmental, active_backend_reference | read_only |
| `public.parcel_jurisdiction_overlay` | Include Entire Object | not_required | read_only |
| `public.parcel_new_construction_summary` | Include Entire Object | active_backend_reference | read_only |
| `public.parcel_permit_segment_summary` | Include Entire Object | active_backend_reference | read_only |
| `public.parcel_planning_pipeline_utility_features` | Include Entire Object | not_required | read_only |
| `public.parcel_school_assignment` | Include Entire Object | CFS Planning Schools, active_backend_reference | read_only |
| `public.parcel_school_summary` | Include Entire Object | CFS Planning Schools, active_backend_reference | read_only |
| `public.parcel_tax_value_enrichment_features` | Include Entire Object | not_required | read_only |
| `public.parcel_transportation_accessibility_features` | Include Entire Object | CFS Planning Transportation, active_backend_reference | read_only |
| `public.parcel_transportation_plan_traffic_features` | Include Entire Object | CFS Planning Transportation, active_backend_reference | read_only |
| `public.parcel_utility_proxy_features` | Include Entire Object | not_required | read_only |
| `public.parcel_wsacc_utility_features` | Include Entire Object | active_backend_reference | read_only |
| `public.parcel_zoning_change_events` | Include Entire Object | not_required | read_only |
| `public.parcel_zoning_intelligence_qa` | Include Entire Object | active_backend_reference | read_only |
| `public.parcel_zoning_overlay` | Include Entire Object | active_backend_reference | read_only |
| `public.parcel_zoning_overlay_v2` | Include Entire Object | active_backend_reference | read_only |
| `public.parcel_zoning_snapshot_year` | Include Entire Object | not_required | read_only |
| `public.parcels` | Include Sanitized Columns | active_backend_reference | read_only |
| `public.parcels_enriched` | Include Sanitized Columns | CFS Planning / Economics, active_backend_reference | read_only |
| `public.permit_activity` | Include Sanitized Columns | active_backend_reference | read_only |
| `public.permit_intelligence_segments` | Include Entire Object | CFS Planning / Economics, active_backend_reference | read_only |
| `public.real_property_permit` | Include Entire Object | active_backend_reference | read_only |
| `public.real_property_permit_clean` | Include Entire Object | not_required | read_only |
| `public.real_property_permit_parcel_relationship` | Include Entire Object | active_backend_reference | read_only |
| `public.school_capacity` | Include Entire Object | CFS Planning Schools, active_backend_reference | read_only |
| `public.school_capacity_history` | Include Entire Object | CFS Planning Schools | read_only |
| `public.school_capacity_ingestion_qa` | Include Entire Object | CFS Planning Schools | read_only |
| `public.school_capacity_projection` | Include Entire Object | CFS Planning Schools | read_only |
| `public.school_enrollment_history` | Include Entire Object | CFS Planning Schools | read_only |
| `public.school_grade_enrollment_history` | Include Entire Object | CFS Planning Schools | read_only |
| `public.school_lea_pupil_context` | Include Entire Object | CFS Planning Schools, active_backend_reference | read_only |
| `public.school_planned_capacity_changes` | Include Entire Object | CFS Planning Schools | read_only |
| `public.school_presentation_utilization_seed` | Include Entire Object | CFS Planning Schools | read_only |
| `public.school_reference` | Include Entire Object | CFS Planning Schools, active_backend_reference | read_only |
| `public.school_utilization_seed_current` | Rebuild from Included Sources | CFS Planning Schools, active_backend_reference | read_only |
| `public.school_zones` | Include Entire Object | CFS Planning Schools, active_backend_reference | read_only |
| `public.tax_parcel_value_enrichment` | Include Sanitized Columns | not_required | read_only |
| `public.transportation_aadt_stations_clean` | Include Entire Object | CFS Planning Transportation, active_backend_reference | read_only |
| `public.transportation_centerlines_clean` | Include Entire Object | CFS Planning Transportation, active_backend_reference | read_only |
| `public.transportation_rail_clean` | Include Entire Object | CFS Planning Transportation, active_backend_reference | read_only |
| `public.transportation_stip_projects_clean` | Include Entire Object | CFS Planning Transportation, active_backend_reference | read_only |
| `public.zoning` | Include Entire Object | active_backend_reference | read_only |
| `public.zoning_clean` | Include Entire Object | not_required | read_only |
| `public.zoning_jurisdictional_clean` | Include Entire Object | not_required | read_only |
| `public.zoning_source_inventory` | Include Entire Object | not_required | read_only |

## Sanitized Compatibility Columns

| Object | Columns nulled in staging |
| --- | --- |
| `public.development_prediction_model_experiment_scores` | `experimental_probability`, `probability_rank`, `probability_percentile` |
| `public.parcel_development_prediction_features_planning_pipeline_utilit` | `nearest_utility_owner` |
| `public.parcels` | `acctname1`, `acctname2`, `mailaddr1`, `mailaddr2`, `mailcity`, `mailstate`, `mailzipcode` |
| `public.parcels_enriched` | `acctname1`, `acctname2`, `mailaddr1`, `mailaddr2`, `mailcity`, `mailstate`, `mailzipcode` |
| `public.permit_activity` | `ownername` |
| `public.tax_parcel_value_enrichment` | `owner_name` |

## Excluded Objects

| Object | Restriction status | Dependency notes |
| --- | --- | --- |
| `public.accela_plan_reviews_clean` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.accela_plan_reviews_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.central_area_plan_clean` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.central_area_plan_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.fema_nfhl_flood_zones_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.geography_columns` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.geometry_columns` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.historical_zoning_clean` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.historical_zoning_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.mobilitydb_opcache` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.new_construction_permits_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.parcel_accela_plan_review_features` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.parcel_central_area_plan_features` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.parcels_clean` | Sanitized before cloud staging | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.permit_activity_clean` | Sanitized before cloud staging | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.planning_boundaries` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.planning_boundaries_clean` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.pointcloud_columns` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.pointcloud_formats` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.raster_columns` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.raster_overviews` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.school_reference_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.school_zones_elementary_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.school_zones_high_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.school_zones_middle_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.spatial_ref_sys` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.tax_parcel_full_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.transportation_aadt_stations_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.transportation_centerlines_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.transportation_rail_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.transportation_stip_projects_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.us_gaz` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.us_lex` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.us_rules` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.utility_proxy_wsacc_clean` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.utility_proxy_wsacc_raw` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.wsacc_basins` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.wsacc_data_inventory` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.wsacc_manholes` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.wsacc_sewer_lines` | Restricted source/raw object excluded | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.zoning_concord` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.zoning_county` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.zoning_harrisburg` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.zoning_kannapolis` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.zoning_locust` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.zoning_midland` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `public.zoning_mount_pleasant` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.addr` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.addrfeat` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.bg` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.county` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.county_lookup` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.countysub_lookup` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.cousub` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.direction_lookup` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.edges` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.faces` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.featnames` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.geocode_settings` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.geocode_settings_default` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.loader_lookuptables` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.loader_platform` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.loader_variables` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.pagc_gaz` | Sanitized before cloud staging | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.pagc_lex` | Sanitized before cloud staging | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.pagc_rules` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.place` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.place_lookup` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.secondary_unit_lookup` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.state` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.state_lookup` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.street_type_lookup` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.tabblock` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.tabblock20` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.tract` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.zcta5` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.zip_lookup` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.zip_lookup_all` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.zip_lookup_base` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.zip_state` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `tiger.zip_state_loc` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `topology.layer` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |
| `topology.topology` | Cloud safe | Excluded from cloud stage; not required by active runtime or restricted/raw/extension managed. |

## Largest 50 Tables

| Schema | Table | Size |
| --- | --- | --- |
| public | `investment_parcel_environmental_context` | 3149 MB |
| public | `parcel_development_prediction_features_planning_pipeline_utilit` | 1704 MB |
| public | `parcel_development_prediction_features_transportation_enhanced` | 1415 MB |
| public | `parcel_development_prediction_features_zoning_enhanced` | 1197 MB |
| public | `parcel_development_prediction_features` | 988 MB |
| public | `parcel_zoning_snapshot_year` | 666 MB |
| public | `parcel_development_prediction_labels` | 279 MB |
| public | `tax_parcel_value_enrichment` | 244 MB |
| public | `tax_parcel_full_raw` | 221 MB |
| public | `fema_nfhl_flood_zones_raw` | 191 MB |
| public | `development_prediction_model_experiment_scores` | 191 MB |
| public | `fema_nfhl_flood_zones_clean` | 190 MB |
| public | `accela_plan_reviews_clean` | 128 MB |
| public | `parcels_enriched` | 113 MB |
| public | `parcel_school_summary` | 110 MB |
| public | `parcel_school_assignment` | 106 MB |
| public | `parcel_zoning_overlay_v2` | 103 MB |
| public | `accela_plan_reviews_raw` | 98 MB |
| public | `parcel_zoning_intelligence_qa` | 93 MB |
| public | `parcels_clean` | 88 MB |
| public | `parcel_flood_constraint_overlay` | 78 MB |
| public | `parcels` | 76 MB |
| public | `investment_terrain_context` | 73 MB |
| public | `parcel_transportation_accessibility_features` | 71 MB |
| public | `parcel_jurisdiction_overlay` | 69 MB |
| public | `parcel_zoning_overlay` | 66 MB |
| public | `development_prediction_ranking_explanations` | 63 MB |
| public | `parcel_development_screening_output` | 55 MB |
| public | `historical_zoning_raw` | 53 MB |
| public | `development_activity_parcel_summary` | 50 MB |
| public | `real_property_permit_clean` | 49 MB |
| public | `historical_zoning_clean` | 49 MB |
| public | `parcel_wsacc_utility_features` | 48 MB |
| public | `real_property_permit_parcel_relationship` | 47 MB |
| public | `parcel_planning_pipeline_utility_features` | 46 MB |
| public | `development_prediction_ranking_classes` | 42 MB |
| public | `real_property_permit` | 36 MB |
| public | `parcel_transportation_plan_traffic_features` | 34 MB |
| public | `investment_soil_units` | 33 MB |
| public | `parcel_utility_proxy_features` | 25 MB |
| public | `permit_intelligence_segments` | 24 MB |
| public | `parcel_tax_value_enrichment_features` | 24 MB |
| public | `parcel_central_area_plan_features` | 23 MB |
| public | `parcel_accela_plan_review_features` | 21 MB |
| public | `investment_nwi_wetlands` | 21 MB |
| public | `transportation_centerlines_raw` | 20 MB |
| public | `parcel_development_model_features` | 18 MB |
| public | `investment_parcel_acs_geography` | 16 MB |
| public | `parcel_permit_segment_summary` | 15 MB |
| public | `parcel_zoning_change_events` | 13 MB |

## Notes

- No row-level sensitive values are printed in this inventory.
- Raw import tables, raw WSACC source linework, extension-managed support tables, and exact model-score fields are excluded or sanitized in the cloud manifest.
- `cfs_cloud_stage` is built locally only; Azure restore is not part of AZ-1A.
