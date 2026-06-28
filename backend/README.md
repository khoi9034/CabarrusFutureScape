# Cabarrus FutureScape API

FastAPI backend foundation for CFS parcel intelligence, development activity,
and temporal analytics.

This service is currently read-only. It does not modify PostGIS schemas, write
data, implement authentication, or connect the frontend dashboard.

## Run Locally

```powershell
cd C:\CabarrusFutureScape\backend
python -m pip install -r requirements.txt

$env:POSTGRES_HOST = "localhost"
$env:POSTGRES_PORT = "5433"
$env:POSTGRES_DB = "cfs_dev"
$env:POSTGRES_USER = "postgres"
$env:POSTGRES_PASSWORD = $env:CFS_POSTGRES_PASSWORD

python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Local development CORS is enabled for the Next.js frontend on ports `3000`,
`3001`, and `3003` via `CORS_ALLOWED_ORIGINS`. Production deployments should
set explicit deployment origins only.

Useful local URLs:

```text
GET http://127.0.0.1:8000/
GET http://127.0.0.1:8000/health
GET http://127.0.0.1:8000/health/database
OpenAPI docs: http://127.0.0.1:8000/docs
OpenAPI JSON: http://127.0.0.1:8000/openapi.json
```

The API root now returns a friendly status response with the service name,
version, docs link, health links, and the major API groups. Use `/docs` for
interactive endpoint exploration, `/health` for service health, and
`/health/database` for PostGIS connectivity.

## Health Endpoints

```text
GET /health
GET /health/database
```

## Parcel Detail Endpoint

```text
GET /parcels/{official_parcel_id}
```

Example:

```text
GET http://127.0.0.1:8000/parcels/CFS-PARCEL-0149726579
```

Optional lightweight parcel highlight geometry:

```text
GET /parcels/{official_parcel_id}?include_geometry=true
```

`include_geometry` defaults to `false`, so the standard parcel detail response
continues to return only identity, intelligence fields, centroid, and extent.
When set to `true`, the endpoint may return `highlight_geometry` as lightweight
GeoJSON from `public.parcels_enriched.geometry` for future SceneView parcel
boundary highlighting.

Example response shape:

```json
{
  "official_parcel_id": "CFS-PARCEL-0149726579",
  "pin14": "example-pin",
  "objectid_1": 149726579,
  "location": {
    "subdivision": "example subdivision",
    "neighborhood": "example neighborhood"
  },
  "valuation": {
    "marketvalue_numeric": 250000.0,
    "assessedvalue_numeric": 250000.0,
    "valuation_band": "medium"
  },
  "parcel_context": {
    "parcel_size_category": "residential_standard",
    "parcel_quality_status": "trusted"
  },
  "zoning": {
    "zoning_jurisdiction_name": "Concord",
    "dominant_zoning_code_raw": "PUD",
    "dominant_zoning_general_normalized": "unknown",
    "zoning_assignment_confidence": "high"
  },
  "governance": {
    "governance_warning_categories": [],
    "safe_for_dashboard": true
  },
  "planning": {
    "planning_jurisdiction": "Concord"
  },
  "metadata": {
    "transformed_at": "2026-05-30T00:00:00+00:00"
  },
  "map_focus": {
    "centroid": {
      "longitude": -80.72215279793367,
      "latitude": 35.369349462827685
    },
    "extent": {
      "xmin": -80.72933764277025,
      "ymin": 35.365247848682806,
      "xmax": -80.7156828678656,
      "ymax": 35.37346110981544
    },
    "spatial_reference": {
      "wkid": 4326
    },
    "geometry_available": true,
    "full_geometry_returned": false
  }
}
```

Example `highlight_geometry` shape when requested:

```json
{
  "type": "Polygon",
  "coordinates": [
    [
      [-80.7221, 35.3693],
      [-80.7220, 35.3694],
      [-80.7219, 35.3692],
      [-80.7220, 35.3691],
      [-80.7221, 35.3693]
    ]
  ],
  "spatial_reference": {
    "wkid": 4326
  }
}
```

Source tables:

- `public.parcels_enriched`
- `public.parcel_zoning_overlay_v2`
- `public.parcel_zoning_intelligence_qa`

Missing parcels return:

```json
{
  "detail": "Parcel not found"
}
```

Map focus notes:

- `map_focus.centroid` is generated from `ST_PointOnSurface(geometry)` so the focus point remains inside parcel polygons more reliably than a raw centroid.
- `map_focus.extent` is generated from the parcel geometry bounding box.
- `spatial_reference.wkid` is `4326`.
- `include_geometry=true` uses `ST_AsGeoJSON(geometry, 6)` and keeps coordinates in SRID `4326`.
- Geometry is returned under `highlight_geometry` only when explicitly requested and only when the serialized GeoJSON clears the lightweight safety guard.
- `map_focus.full_geometry_returned` remains `false` by default and is `true` only when `highlight_geometry` is included.
- Future frontend SceneView parcel boundary highlighting can opt into `highlight_geometry` without changing the default parcel detail payload.

## Parcel Search Endpoint

```text
GET /parcels/search
```

Example requests:

```text
GET http://127.0.0.1:8000/parcels/search?q=45896367300000
GET http://127.0.0.1:8000/parcels/search?q=CONCORD%20MILLS&limit=10
GET http://127.0.0.1:8000/parcels/search?q=Concord&zoning_jurisdiction=Concord&safe_for_dashboard=true
```

Supported query parameters:

- `q`: required search text.
- `limit`: default `20`, clamped to max `100`.
- `offset`: default `0`.
- `zoning_jurisdiction`
- `zoning_category`
- `parcel_quality_status`
- `zoning_confidence`
- `valuation_band`
- `safe_for_dashboard`

Search fields:

- `official_parcel_id`
- `pin14`
- `acctname1`, `acctname2`
- `mailaddr1`, `mailaddr2`, `mailcity`, `mailstate`, `mailzipcode`
- `subdiv_name`
- `nbh_name`
- `dominant_zoning_code_raw`
- `zoning_jurisdiction_name`
- `dominant_zoning_general_normalized`
- `planning_jurisdiction_name`

Example response shape:

```json
{
  "query": "45896367300000",
  "limit": 20,
  "offset": 0,
  "total_count": 1,
  "results": [
    {
      "official_parcel_id": "CFS-PARCEL-0149726579",
      "pin14": "45896367300000",
      "subdivision": null,
      "neighborhood": "CONCORD MILLS",
      "owner_display": "MALL AT CONCORD MILLS LP",
      "mailing_city": "INDIANAPOLIS",
      "mailing_state": "IN",
      "zoning_jurisdiction_name": "Concord",
      "dominant_zoning_code_raw": "C-2",
      "dominant_zoning_general_normalized": "unknown",
      "zoning_assignment_confidence": "high",
      "parcel_quality_status": "review",
      "valuation_band": "ultra_high",
      "safe_for_dashboard": false,
      "governance_warning_categories": [
        "jurisdiction_code_semantics_review"
      ]
    }
  ]
}
```

Blank search text returns `422`. Empty result sets return `200` with an empty
`results` array.

## Parcel Filter Endpoint

```text
GET /parcels/filter
```

Example requests:

```text
GET http://127.0.0.1:8000/parcels/filter?zoning_jurisdiction=Concord&limit=10
GET http://127.0.0.1:8000/parcels/filter?neighborhood=CONCORD%20MILLS
GET http://127.0.0.1:8000/parcels/filter?safe_for_dashboard=true&valuation_band=medium
```

Supported query parameters:

- `limit`: default `20`, clamped to max `100`.
- `offset`: default `0`.
- `zoning_jurisdiction`
- `zoning_category`
- `zoning_code`
- `parcel_quality_status`
- `zoning_confidence`
- `governance_warning`
- `valuation_band`
- `parcel_size_category`
- `subdivision`: partial, case-insensitive match.
- `neighborhood`: partial, case-insensitive match.
- `safe_for_dashboard`

No filters returns the first page of parcels ordered by `official_parcel_id`.
Empty result sets return `200` with an empty `results` array.

Example response shape:

```json
{
  "filters_applied": {
    "zoning_jurisdiction": "Concord",
    "safe_for_dashboard": true
  },
  "limit": 20,
  "offset": 0,
  "total_count": 100,
  "results": [
    {
      "official_parcel_id": "CFS-PARCEL-0149726579",
      "pin14": "45896367300000",
      "subdivision": null,
      "neighborhood": "CONCORD MILLS",
      "zoning_jurisdiction_name": "Concord",
      "dominant_zoning_code_raw": "C-2",
      "dominant_zoning_general_normalized": "unknown",
      "zoning_assignment_confidence": "high",
      "parcel_quality_status": "review",
      "valuation_band": "ultra_high",
      "parcel_size_category": "commercial_large",
      "safe_for_dashboard": false,
      "governance_warning_categories": [
        "jurisdiction_code_semantics_review"
      ]
    }
  ]
}
```

## Parcel Statistics Endpoint

```text
GET /parcels/statistics
```

Example requests:

```text
GET http://127.0.0.1:8000/parcels/statistics
GET http://127.0.0.1:8000/parcels/statistics?zoning_jurisdiction=Concord
GET http://127.0.0.1:8000/parcels/statistics?safe_for_dashboard=true
```

Supported filters:

- `zoning_jurisdiction`
- `zoning_category`
- `parcel_quality_status`
- `zoning_confidence`
- `valuation_band`
- `safe_for_dashboard`

No filters returns countywide parcel intelligence statistics. Filters return
the same aggregate shape for the filtered population. Empty filtered results
return `200` with zero counts and empty breakdown arrays.

Example response shape:

```json
{
  "total_parcels": 110017,
  "zoned_parcels": 109984,
  "no_match_parcels": 33,
  "safe_for_dashboard_parcels": 74781,
  "review_parcels": 35236,
  "high_confidence_parcels": 107318,
  "low_confidence_parcels": 831,
  "multi_jurisdiction_parcels": 4441,
  "by_zoning_jurisdiction": [
    {
      "value": "Concord",
      "count": 43497
    }
  ],
  "by_zoning_category": [
    {
      "value": "residential",
      "count": 70640
    }
  ],
  "by_parcel_quality_status": [
    {
      "value": "trusted",
      "count": 64918
    }
  ],
  "by_valuation_band": [
    {
      "value": "medium",
      "count": 63212
    }
  ],
  "by_governance_warning": [
    {
      "value": "safe_for_dashboard",
      "count": 74781
    }
  ],
  "filters_applied": {}
}
```

## Parcel Zoning Summary Endpoint

```text
GET /parcels/zoning-summary
```

Example requests:

```text
GET http://127.0.0.1:8000/parcels/zoning-summary
GET http://127.0.0.1:8000/parcels/zoning-summary?zoning_jurisdiction=Concord
GET http://127.0.0.1:8000/parcels/zoning-summary?zoning_code=RV
```

Supported filters:

- `zoning_jurisdiction`
- `zoning_category`
- `zoning_code`
- `parcel_quality_status`
- `zoning_confidence`
- `safe_for_dashboard`

No filters returns countywide zoning intelligence. Filters return scoped
zoning summaries. Empty filtered results return `200` with zero counts and
empty arrays.

Example response shape:

```json
{
  "total_parcels": 110017,
  "zoned_parcels": 109984,
  "no_match_parcels": 33,
  "jurisdiction_summary": [
    {
      "zoning_jurisdiction_name": "Concord",
      "parcel_count": 43497,
      "percentage": 39.5366,
      "high_confidence_count": 43066,
      "review_count": 22743,
      "safe_for_dashboard_count": 20754
    }
  ],
  "zoning_code_summary": [
    {
      "zoning_jurisdiction_name": "Concord",
      "zoning_code": "RV",
      "zoning_category": "residential",
      "parcel_count": 6237,
      "percentage": 5.6691,
      "review_count": 1016
    }
  ],
  "zoning_category_summary": [
    {
      "zoning_category": "residential",
      "parcel_count": 70640,
      "percentage": 64.2083
    }
  ],
  "confidence_summary": [
    {
      "confidence": "high",
      "parcel_count": 107318,
      "percentage": 97.5467
    }
  ],
  "multi_jurisdiction_count": 4441,
  "governance_warning_summary": [
    {
      "governance_warning": "safe_for_dashboard",
      "parcel_count": 74781,
      "percentage": 67.9722
    }
  ],
  "filters_applied": {}
}
```

## Parcel Governance Warnings Endpoint

```text
GET /parcels/governance-warnings
```

Example requests:

```text
GET http://127.0.0.1:8000/parcels/governance-warnings
GET http://127.0.0.1:8000/parcels/governance-warnings?warning_category=review_low_confidence
GET http://127.0.0.1:8000/parcels/governance-warnings?zoning_jurisdiction=Concord&limit=10
GET http://127.0.0.1:8000/parcels/governance-warnings?safe_for_dashboard=true
```

Supported filters:

- `warning_category`
- `zoning_jurisdiction`
- `zoning_category`
- `parcel_quality_status`
- `zoning_confidence`
- `safe_for_dashboard`
- `limit`: default `20`, clamped to max `100`.
- `offset`: default `0`.

No filters returns parcels in the default governance review scope
(`safe_for_dashboard=false`). Explicit `safe_for_dashboard=true` returns
dashboard-safe parcels and their safe category marker. Empty filtered results
return `200` with zero count, empty summary, and empty results.

Warning category definitions:

- `jurisdiction_code_semantics_review`: zoning codes need jurisdiction-specific interpretation before production use.
- `review_sliver_overlap`: zoning assignment includes small overlap artifacts that should be reviewed.
- `review_multi_jurisdiction`: parcel intersects zoning from more than one zoning jurisdiction.
- `review_low_confidence`: dominant zoning overlap has low assignment confidence.
- `review_near_tie`: top zoning overlaps are close enough to need review.
- `no_zoning_match`: parcel did not match a zoning polygon.
- `safe_for_dashboard`: parcel passed the current mock QA threshold for dashboard display.

Example response shape:

```json
{
  "filters_applied": {
    "default_scope": "governance_review"
  },
  "limit": 20,
  "offset": 0,
  "total_count": 35236,
  "warning_summary": [
    {
      "warning_category": "jurisdiction_code_semantics_review",
      "parcel_count": 23793,
      "percentage": 67.5247
    }
  ],
  "results": [
    {
      "official_parcel_id": "CFS-PARCEL-0149720369",
      "pin14": "132 109",
      "subdivision": "ROWAN COUNTY PARCEL",
      "neighborhood": "ROWAN COUNTY PARCEL",
      "zoning_jurisdiction_name": null,
      "dominant_zoning_code_raw": null,
      "dominant_zoning_general_normalized": null,
      "zoning_assignment_confidence": "no_match",
      "parcel_quality_status": "review",
      "valuation_band": "unknown",
      "safe_for_dashboard": false,
      "governance_warning_categories": [
        "no_zoning_match"
      ]
    }
  ]
}
```

## Development Statistics Endpoint

```text
GET /development/statistics
```

Example requests:

```text
GET http://127.0.0.1:8000/development/statistics
GET http://127.0.0.1:8000/development/statistics?year=2025
GET http://127.0.0.1:8000/development/statistics?permit_type=NEW%20CONSTRUCTION
GET http://127.0.0.1:8000/development/statistics?zoning_jurisdiction=Concord
```

Supported filters:

- `year`
- `month`
- `permit_type`
- `work_type`
- `zoning_jurisdiction`
- `zoning_category`
- `activity_class`

No filters returns countywide development activity statistics. Filters scope
permit counts and permit breakdowns through the permit-to-parcel relationship
table. Activity class bands come from the governed parcel activity summary.
Empty filtered permit results return `200` with zero counts and empty breakdown
arrays.

Example response shape:

```json
{
  "total_permits": 64426,
  "parcels_with_activity": 43474,
  "parcels_without_activity": 66543,
  "recent_activity_parcels_1yr": 3091,
  "recent_activity_parcels_3yr": 9388,
  "activity_date_min": "1986-12-01",
  "activity_date_max": "2025-12-31",
  "activity_classes": {
    "no_activity": 66543,
    "low_activity": 13068,
    "moderate_activity": 27425,
    "high_activity": 2430,
    "very_high_activity": 551
  },
  "by_permit_type": [
    {
      "value": "NEW CONSTRUCTION",
      "count": 28278
    }
  ],
  "by_work_type": [
    {
      "value": "unknown",
      "count": 49660
    }
  ],
  "by_status": [
    {
      "value": "unknown",
      "count": 45735
    }
  ],
  "by_zoning_jurisdiction": [
    {
      "value": "Concord",
      "count": 30620
    }
  ],
  "by_zoning_category": [
    {
      "value": "residential",
      "count": 36370
    }
  ],
  "filters_applied": {}
}
```

## Development Trends Endpoint

```text
GET /development/trends
```

Example requests:

```text
GET http://127.0.0.1:8000/development/trends
GET http://127.0.0.1:8000/development/trends?start_year=2020&end_year=2025
GET http://127.0.0.1:8000/development/trends?permit_type=NEW%20CONSTRUCTION
GET http://127.0.0.1:8000/development/trends?group_by=zoning_jurisdiction
GET http://127.0.0.1:8000/development/trends?rolling_window=36
```

Supported filters:

- `start_year`
- `end_year`
- `year`
- `month`
- `permit_type`
- `work_type`
- `permit_status`
- `zoning_jurisdiction`
- `zoning_category`

Supported `group_by` values:

- `year`
- `month`
- `permit_type`
- `work_type`
- `zoning_jurisdiction`
- `zoning_category`

Supported `rolling_window` values are `12` and `36` months. Invalid
`group_by` or `rolling_window` values return `422`. Empty filtered results
return `200` with zero totals and empty trend arrays.

Example response shape:

```json
{
  "filters_applied": {},
  "group_by": null,
  "rolling_window": null,
  "date_range": {
    "start_year": 1986,
    "end_year": 2025,
    "activity_date_min": "1986-12-01",
    "activity_date_max": "2025-12-31"
  },
  "annual_trends": [
    {
      "year": 2025,
      "month": null,
      "permit_count": 3642,
      "parcel_count": 3074,
      "total_permit_amount": 736178590.75,
      "zoning_jurisdiction_name": null,
      "zoning_category": null,
      "permit_type": null,
      "work_type": null
    }
  ],
  "monthly_trends": [
    {
      "year": 2025,
      "month": 12,
      "permit_count": 216,
      "parcel_count": 211,
      "total_permit_amount": 26573797.84,
      "zoning_jurisdiction_name": null,
      "zoning_category": null,
      "permit_type": null,
      "work_type": null
    }
  ],
  "grouped_trends": [],
  "rolling_summary": null,
  "trend_direction": "down",
  "peak_year": 2021,
  "peak_month": "2021-03",
  "total_permits": 64426
}
```

## Development Hotspots Endpoint

```text
GET /development/hotspots
```

Example requests:

```text
GET http://127.0.0.1:8000/development/hotspots
GET http://127.0.0.1:8000/development/hotspots?activity_class=very_high_activity
GET http://127.0.0.1:8000/development/hotspots?zoning_jurisdiction=Concord
GET http://127.0.0.1:8000/development/hotspots?official_parcel_id=CFS-PARCEL-0149726579&limit=1
GET http://127.0.0.1:8000/development/hotspots?recent_window=1
GET http://127.0.0.1:8000/development/hotspots?sort_by=total_permit_amount&limit=10
GET http://127.0.0.1:8000/development/hotspots?permit_segment=residential_growth
GET http://127.0.0.1:8000/development/hotspots?growth_signal=redevelopment_signal
```

Supported filters:

- `activity_class`
- `official_parcel_id`
- `zoning_jurisdiction`
- `zoning_category`
- `permit_type`
- `work_type`
- `permit_segment`
- `growth_signal`
- `permit_status_stage`
- `permit_value_class`
- `development_domain`
- `year`
- `recent_window`: allowed values are `1` or `3`.
- `limit`: default `20`, clamped to max `100`.
- `offset`: default `0`.

Supported `sort_by` values:

- `development_activity_score`
- `total_permit_count`
- `recent_permit_count_1yr`
- `recent_permit_count_3yr`
- `total_permit_amount`

No filters returns parcels with permit activity ordered by development activity
score. Permit type, work type, and year filters are applied through the real
permit-to-parcel relationship table while preserving one row per parcel.
Permit segment, growth signal, status stage, value class, and development
domain filters are applied through `public.permit_intelligence_segments` and
the real permit-to-parcel relationship table. This lets hotspot maps focus on
meaningful development signals such as residential growth, commercial activity,
redevelopment, active construction, and high-value permit activity rather than
raw permit count alone.
Invalid `recent_window` or `sort_by` values return `422`. Empty filtered
results return `200` with an empty `results` array.

Hotspots should be interpreted as parcel-level development activity intensity,
not forecasts. The score and class come from the prepared PostGIS analytics
layer and are suitable for read-only dashboard/API use, but not yet cached or
served through a production governance process.

Example response shape:

```json
{
  "filters_applied": {},
  "sort_by": "development_activity_score",
  "limit": 20,
  "offset": 0,
  "total_count": 43474,
  "results": [
    {
      "official_parcel_id": "CFS-PARCEL-0149726579",
      "pin14": "45896367300000",
      "subdivision": null,
      "neighborhood": "CONCORD MILLS",
      "zoning_jurisdiction_name": "Concord",
      "dominant_zoning_code_raw": "C-2",
      "dominant_zoning_general_normalized": "unknown",
      "parcel_quality_status": "review",
      "zoning_assignment_confidence": "high",
      "total_permit_count": 286,
      "first_permit_date": "2000-08-02",
      "recent_permit_count_1yr": 24,
      "recent_permit_count_3yr": 59,
      "total_permit_amount": 61926619.0,
      "avg_permit_amount": 290735.30046948354,
      "latest_permit_date": "2025-10-22",
      "active_year_count": 19,
      "dominant_permit_type": "upfit",
      "dominant_work_type": "commercial_upfit",
      "latest_permit_status": "closed",
      "ambiguous_permit_count": 0,
      "co_date_future_outlier_count": 0,
      "development_activity_score": 100.0,
      "development_activity_class": "very_high_activity",
      "has_unmatched_or_ambiguous_permit_flag": false,
      "residential_growth_permits": 73,
      "commercial_activity_permits": 110,
      "industrial_activity_permits": 0,
      "institutional_activity_permits": 0,
      "redevelopment_signal_permits": 57,
      "minor_maintenance_permits": 5,
      "demolition_permits": 27,
      "active_construction_permits": 1,
      "completed_permits": 68,
      "high_value_permits": 96,
      "major_value_permits": 20,
      "dominant_permit_segment": "commercial_activity",
      "dominant_growth_signal": "major_growth",
      "permit_signal_score_max": 100.0,
      "permit_signal_score_avg": 71.43,
      "current_activity_status": "active_construction"
    }
  ]
}
```

## Permit Intelligence Segment Endpoints

```text
GET /development/permit-segments/statistics
GET /development/permit-segments/options
GET /development/permit-segments/{official_parcel_id}
```

These endpoints expose descriptive permit segmentation from
`public.permit_intelligence_segments` and
`public.parcel_permit_segment_summary`. They do not train a model, return
prediction probabilities, or modify PostGIS.

Example requests:

```text
GET http://127.0.0.1:8000/development/permit-segments/statistics
GET http://127.0.0.1:8000/development/permit-segments/options
GET http://127.0.0.1:8000/development/permit-segments/CFS-PARCEL-0149726579
```

Statistics response fields:

- `total_permits`
- `by_permit_segment`
- `by_permit_growth_signal`
- `by_permit_status_stage`
- `by_permit_value_class`
- `by_development_domain`

Selected parcel segment summary fields:

- parcel identity: `official_parcel_id`, `pin14`
- segment counts: residential, commercial, industrial, institutional,
  redevelopment, minor maintenance, demolition
- status/value counts: active construction, completed, high value, major value
- permit amount and date range fields
- `dominant_permit_segment`
- `dominant_growth_signal`
- `permit_signal_score_max`
- `permit_signal_score_avg`
- `current_activity_status`

Example selected parcel segment response shape:

```json
{
  "official_parcel_id": "CFS-PARCEL-0149726579",
  "pin14": "45896367300000",
  "total_permits": 286,
  "residential_growth_permits": 73,
  "commercial_activity_permits": 110,
  "industrial_activity_permits": 0,
  "institutional_activity_permits": 0,
  "redevelopment_signal_permits": 57,
  "minor_maintenance_permits": 5,
  "demolition_permits": 27,
  "active_construction_permits": 1,
  "completed_permits": 68,
  "high_value_permits": 96,
  "major_value_permits": 20,
  "total_permit_amount": 61926619.0,
  "latest_permit_date": "2025-10-22",
  "first_permit_date": "2000-08-02",
  "active_year_count": 19,
  "dominant_permit_segment": "commercial_activity",
  "dominant_growth_signal": "major_growth",
  "permit_signal_score_max": 100.0,
  "permit_signal_score_avg": 71.43,
  "current_activity_status": "active_construction"
}
```

## Selected Parcel Permit Events Endpoint

```text
GET /development/parcel/{official_parcel_id}/permits
```

Example requests:

```text
GET http://127.0.0.1:8000/development/parcel/CFS-PARCEL-0149726579/permits
GET http://127.0.0.1:8000/development/parcel/CFS-PARCEL-0149726579/permits?limit=5&sort=oldest_first
```

Query parameters:

- `limit`: default `10`, clamped to max `50`.
- `offset`: default `0`.
- `sort`: `latest_first` by default; `oldest_first` is also supported.

This endpoint reads from `public.real_property_permit_parcel_relationship`,
which is the current authoritative permit-to-parcel relationship layer for CFS.
It left-joins `public.permit_intelligence_segments` so each event can carry
the segment, growth signal, status stage, value class, development domain, and
descriptive signal score used by the selected parcel permit event badges.
It does not use the old 2015 `permit_activity_clean` pilot table and does not
write to PostGIS.

Example response shape:

```json
{
  "official_parcel_id": "CFS-PARCEL-0149726579",
  "total_count": 286,
  "limit": 10,
  "offset": 0,
  "sort": "latest_first",
  "permits": [
    {
      "permit_id": "example-permit-id",
      "permit_number": "example-permit-number",
      "activity_date": "2025-10-22",
      "activity_year": 2025,
      "permit_type": "upfit",
      "work_type": "commercial_upfit",
      "permit_status": "closed",
      "permit_amount": 125000.0,
      "relationship_confidence": "high",
      "permit_segment": "commercial_activity",
      "permit_growth_signal": "moderate_activity",
      "development_domain": "commercial",
      "permit_status_stage": "completed",
      "permit_value_class": "standard_value",
      "permit_signal_score": 42.0
    }
  ]
}
```

## Development Zoning Summary Endpoint

```text
GET /development/zoning-summary
```

Example requests:

```text
GET http://127.0.0.1:8000/development/zoning-summary
GET http://127.0.0.1:8000/development/zoning-summary?zoning_jurisdiction=Concord
GET http://127.0.0.1:8000/development/zoning-summary?zoning_category=residential
GET http://127.0.0.1:8000/development/zoning-summary?permit_type=NEW%20CONSTRUCTION
GET http://127.0.0.1:8000/development/zoning-summary?year=2025&month=12
```

Supported filters:

- `zoning_jurisdiction`
- `zoning_category`
- `zoning_code`
- `permit_type`
- `work_type`
- `permit_status`
- `year`
- `month`
- `limit`: default `50`, clamped to max `100`.
- `offset`: default `0`.

No filters returns zoning development summaries ordered by permit count
descending. Filters return the same summary shape scoped to the requested
permit, zoning, and time context. Empty filtered results return `200` with an
empty `summary` array.

The endpoint aggregates from the real permit-to-parcel relationship table and
joins parcel activity classes from the parcel development summary. This keeps
the response one zoning/activity grouping at a time while still supporting
permit type, work type, permit status, year, and month filters. These summaries
are useful for operational intelligence and dashboard planning, but zoning code
semantics still need jurisdiction-specific governance before production policy
decisions.

Example response shape:

```json
{
  "filters_applied": {},
  "limit": 50,
  "offset": 0,
  "total_count": 3090,
  "summary": [
    {
      "zoning_jurisdiction_name": "Concord",
      "dominant_zoning_code_raw": "PUD",
      "dominant_zoning_general_normalized": "unknown",
      "permit_type": "NEW CONSTRUCTION",
      "work_type": "unknown",
      "permit_status": "unknown",
      "activity_year": null,
      "activity_month": null,
      "permit_count": 1630,
      "active_parcel_count": 1601,
      "total_permit_amount": 173386909.88,
      "avg_permit_amount": 151827.41670753065,
      "very_high_activity_parcel_count": 2,
      "high_activity_parcel_count": 49,
      "moderate_activity_parcel_count": 1184,
      "low_activity_parcel_count": 366
    }
  ]
}
```

## Development Activity Summary Endpoint

```text
GET /development/activity-summary
```

Example requests:

```text
GET http://127.0.0.1:8000/development/activity-summary
GET http://127.0.0.1:8000/development/activity-summary?year=2025
GET http://127.0.0.1:8000/development/activity-summary?date_start=2025-01-01&date_end=2025-12-31
GET http://127.0.0.1:8000/development/activity-summary?permit_type=NEW%20CONSTRUCTION
GET http://127.0.0.1:8000/development/activity-summary?zoning_jurisdiction=Concord
```

Supported filters:

- `year`
- `month`
- `date_start`
- `date_end`
- `permit_type`
- `work_type`
- `permit_status`
- `zoning_jurisdiction`
- `zoning_category`
- `activity_class`

No filters returns a global activity summary. Filters scope the summary across
permit type, work type, status, year/month, date range, zoning context, and
parcel activity class. Invalid date ranges return `422`. Empty filtered results
return `200` with zero counts and empty breakdown arrays.

This endpoint is the broad executive/operational rollup for development
activity. It aggregates real permit-to-parcel relationship data and joins the
parcel activity summary for activity class context and recent activity
indicators. It is read-only and does not refresh analytics tables or modify the
PostGIS schema.

Example response shape:

```json
{
  "filters_applied": {},
  "total_permits": 64426,
  "active_parcel_count": 43474,
  "total_permit_amount": 9691120157.78,
  "avg_permit_amount": 219907.87532687376,
  "date_range": {
    "activity_date_min": "1986-12-01",
    "activity_date_max": "2025-12-31"
  },
  "by_permit_type": [
    {
      "value": "NEW CONSTRUCTION",
      "permit_count": 28278,
      "active_parcel_count": 27708,
      "total_permit_amount": 3168429134.03
    }
  ],
  "by_work_type": [
    {
      "value": "unknown",
      "permit_count": 49660,
      "active_parcel_count": 35383,
      "total_permit_amount": 4718159041.81
    }
  ],
  "by_status": [
    {
      "value": "unknown",
      "permit_count": 45735,
      "active_parcel_count": 33041,
      "total_permit_amount": 4205609409.12
    }
  ],
  "by_activity_class": [
    {
      "value": "moderate_activity",
      "permit_count": 35031,
      "active_parcel_count": 27425,
      "total_permit_amount": 3461697158.88
    }
  ],
  "by_year": [
    {
      "year": 2025,
      "permit_count": 3642,
      "active_parcel_count": 3074,
      "total_permit_amount": 736178590.75
    }
  ],
  "by_month": [
    {
      "year": 2025,
      "month": 12,
      "permit_count": 216,
      "active_parcel_count": 211,
      "total_permit_amount": 26573797.84
    }
  ],
  "by_zoning_jurisdiction": [
    {
      "value": "Concord",
      "permit_count": 30620,
      "active_parcel_count": 19929,
      "total_permit_amount": 5968845712.0
    }
  ],
  "by_zoning_category": [
    {
      "value": "residential",
      "permit_count": 36370,
      "active_parcel_count": 27001,
      "total_permit_amount": 2289772956.95
    }
  ],
  "recent_activity": {
    "recent_1yr_parcels": 3091,
    "recent_3yr_parcels": 9388
  }
}
```

## Development Temporal Query Endpoint

```text
GET /development/temporal-query
```

Example requests:

```text
GET http://127.0.0.1:8000/development/temporal-query
GET http://127.0.0.1:8000/development/temporal-query?year=2025
GET http://127.0.0.1:8000/development/temporal-query?date_start=2025-01-01&date_end=2025-12-31
GET http://127.0.0.1:8000/development/temporal-query?rolling_window=36
GET http://127.0.0.1:8000/development/temporal-query?bbox=-81,35,-80,36
```

Supported filters:

- `year`
- `month`
- `date_start`
- `date_end`
- `rolling_window`: allowed values are `12` or `36`.
- `permit_type`
- `work_type`
- `permit_status`
- `zoning_jurisdiction`
- `zoning_category`
- `activity_class`
- `limit`: default `50`, clamped to max `100`.
- `offset`: default `0`.
- `bbox`: accepted as `minx,miny,maxx,maxy`, but not spatially active yet.
- `include_geometry`: accepted, but geometry is not returned yet.

With no temporal filters, this endpoint defaults to the latest 12-month
activity context based on the latest available permit activity date. Explicit
year, month, date range, or rolling-window filters replace that default.
Invalid rolling windows and invalid date ranges return `422`. Empty filtered
results return `200` with zero counts and an empty result set.

`bbox` and `include_geometry` are placeholders for future map extent and time
slider workflows. They are parsed and reported through `bbox_support`, but they
do not silently filter records until a safe geometry-backed development
activity source is connected.

Example response shape:

```json
{
  "filters_applied": {},
  "temporal_context": {
    "mode": "default_recent_12_months",
    "year": null,
    "month": null,
    "date_start": "2024-12-31",
    "date_end": "2025-12-31",
    "rolling_window": 12,
    "defaulted_to_recent_window": true
  },
  "limit": 50,
  "offset": 0,
  "total_count": 3841,
  "summary": {
    "total_permits": 3664,
    "active_parcel_count": 3091,
    "date_start": "2024-12-31",
    "date_end": "2025-12-31",
    "permit_type_breakdown": [
      {
        "value": "NEW CONSTRUCTION",
        "permit_count": 1262,
        "active_parcel_count": 1226,
        "total_permit_amount": 259380112.35
      }
    ],
    "work_type_breakdown": [],
    "zoning_jurisdiction_breakdown": []
  },
  "results": [
    {
      "permit_id": "5319989",
      "permit_number": "BU2025-03827",
      "official_parcel_id": "CFS-PARCEL-0149755811",
      "pin14": "55175188060000",
      "activity_date": "2025-12-31",
      "activity_year": 2025,
      "activity_month": 12,
      "permit_type": "REMODEL",
      "work_type": "Residential Repair",
      "permit_status": "INSPECTIONS",
      "permit_amount": 21989.0,
      "zoning_jurisdiction_name": "Cabarrus County / Unincorporated",
      "dominant_zoning_code_raw": "LDR",
      "dominant_zoning_general_normalized": "residential",
      "development_activity_class": "high_activity",
      "relationship_confidence": "high"
    }
  ],
  "bbox_support": {
    "requested": false,
    "active": false,
    "note": "bbox and include_geometry are accepted for future map extent queries, but spatial filtering is not active until the development activity service is backed by a safe geometry source."
  }
}
```

## Development Lookup Endpoints

```text
GET /development/permit-types
GET /development/work-types
GET /development/jurisdictions
GET /development/activity-classes
```

These endpoints provide filter/dropdown options for development activity,
temporal query, hotspot, and summary UI surfaces. Each response preserves the
raw `value` used by API filters, adds a human-friendly `label`, and includes a
record `count`. Options are sorted by count descending, then label ascending.
Null and blank values are excluded.

Example permit type response:

```json
{
  "lookup_type": "permit_types",
  "total_options": 15,
  "options": [
    {
      "value": "NEW CONSTRUCTION",
      "label": "New Construction",
      "count": 28278
    },
    {
      "value": "OTHER",
      "label": "Other",
      "count": 12076
    }
  ]
}
```

Example jurisdiction response:

```json
{
  "lookup_type": "jurisdictions",
  "total_options": 7,
  "options": [
    {
      "value": "Concord",
      "label": "Concord",
      "count": 30620
    }
  ]
}
```

Current option counts:

- Permit types: `15`
- Work types: `50`
- Jurisdictions: `7`
- Activity classes: `5`

## Flood Constraint Endpoints

```text
GET /constraints/flood/statistics
GET /constraints/flood/{official_parcel_id}
GET /constraints/flood/filter
GET /constraints/flood/high-review
GET /constraints/flood/summary
GET /constraints/flood/zones
```

These endpoints expose read-only FEMA NFHL Layer 28 parcel flood constraint
intelligence from `public.parcel_flood_constraint_overlay` and source polygon
visualization from `public.fema_nfhl_flood_zones_clean`.

Supported filters:

- `floodplain_present`
- `floodway_present`
- `sfha_present`
- `moderate_flood_present`
- `flood_review_required`
- `buildability_impact`
- `flood_severity_class`
- `dominant_flood_zone`
- `percent_constrained_min`
- `percent_constrained_max`
- `limit` and `offset` on paginated endpoints

Examples:

```text
GET http://127.0.0.1:8000/constraints/flood/statistics
GET http://127.0.0.1:8000/constraints/flood/CFS-PARCEL-0149776628
GET http://127.0.0.1:8000/constraints/flood/filter?floodway_present=true&limit=10
GET http://127.0.0.1:8000/constraints/flood/high-review?limit=10
GET http://127.0.0.1:8000/constraints/flood/summary
GET http://127.0.0.1:8000/constraints/flood/zones?flood_severity_class=severe&limit=25
GET http://127.0.0.1:8000/constraints/flood/zones?extent=-80.8,35.18,-80.29,35.56&limit=0
```

Example parcel flood detail response:

```json
{
  "official_parcel_id": "CFS-PARCEL-0149776628",
  "pin14": "55520518500000",
  "dominant_flood_zone": "AE",
  "flood_zone_codes": ["AE"],
  "floodplain_present": true,
  "floodway_present": true,
  "sfha_present": true,
  "moderate_flood_present": false,
  "minimal_flood_present": false,
  "parcel_area_acres": 0.2554,
  "flood_constrained_area_acres": 0.2554,
  "floodway_area_acres": 0.213,
  "sfha_area_acres": 0.2554,
  "percent_parcel_constrained": 100.0,
  "percent_parcel_floodway": 83.3675,
  "percent_parcel_sfha": 100.0,
  "flood_review_required": true,
  "buildability_impact": "severe",
  "flood_constraint_score": 100.0,
  "flood_severity_class": "severe",
  "overlay_confidence": "high"
}
```

Current global flood statistics:

- Total parcels: `110,017`
- Floodway parcels: `3,229`
- SFHA parcels: `7,254`
- Flood review required parcels: `7,989`
- High/severe buildability parcels: `6,362`

`/constraints/flood/high-review` defaults to `flood_review_required=true` and
sorts by `flood_constraint_score` descending, then percent constrained
descending. `limit` values above `100` are clamped to `100`.

`/constraints/flood/zones` returns lightweight GeoJSON Polygon/MultiPolygon
features from the authoritative FEMA NFHL Layer 28 clean table. It supports:

- `flood_severity_class`: `severe`, `high`, or `moderate`
- `flood_constraint_type`: normalized type such as `floodway` or
  `special_flood_hazard_area`
- `extent`: WGS84 envelope as `xmin,ymin,xmax,ymax`
- `limit`: default `500`, max `1000`; `limit=0` requires `extent` and returns
  all matching features for that visible extent
- `offset`: default `0`

The zones endpoint is intended for map-safe FEMA source visualization. It is
separate from the parcel-based Flood Constraints marker workflow and does not
select parcels by itself.

## School Constraint Endpoints

```text
GET /constraints/schools/statistics
GET /constraints/schools/{official_parcel_id}
GET /constraints/schools/filter
GET /constraints/schools/district-summary
GET /constraints/schools/qa-summary
```

These endpoints expose read-only school assignment and QA intelligence from
`public.parcel_school_assignment`, `public.parcel_school_summary`,
`public.school_reference`, and `public.school_zones`.

Examples:

```text
GET http://127.0.0.1:8000/constraints/schools/statistics
GET http://127.0.0.1:8000/constraints/schools/CFS-PARCEL-0149726579
GET http://127.0.0.1:8000/constraints/schools/filter?school_assignment_review_required=true&limit=10
GET http://127.0.0.1:8000/constraints/schools/district-summary?school_level=elementary
GET http://127.0.0.1:8000/constraints/schools/qa-summary
```

Important caveats:

- Parcel assignment uses attendance-zone polygon overlap only.
- School point records are used only as a reference/name dictionary.
- CFS V1 includes public CCS elementary, middle, and high schools only.
- KCS, private, magnet, Other, and non-level records are preserved for QA but
  excluded from V1 outputs.
- `public.school_capacity` is intentionally empty until vetted
  enrollment/capacity data is approved.
- `capacity_status` is `not_available`, school scoring fields are `null`, and
  `school_constraint_class` is `not_scored`.

Current global metrics:

- Total parcels: `110,017`
- Elementary assigned parcels: `91,161`
- Middle assigned parcels: `86,221`
- High assigned parcels: `91,161`
- Assignment review required parcels: `75,143`
- Capacity data available parcels: `0`

## New Construction Permit Endpoints

```text
GET /development/new-construction/statistics
GET /development/new-construction/trends
GET /development/new-construction/parcel/{official_parcel_id}
GET /development/new-construction/labels/summary
GET /development/prediction/features/summary
```

These endpoints expose Phase 10A staff-provided new construction permit
intelligence from:

- `public.new_construction_permits_clean`
- `public.new_construction_permit_parcel_relationship`
- `public.parcel_new_construction_summary`
- `public.parcel_development_prediction_labels`

Examples:

```text
GET http://127.0.0.1:8000/development/new-construction/statistics
GET http://127.0.0.1:8000/development/new-construction/trends
GET http://127.0.0.1:8000/development/new-construction/parcel/CFS-PARCEL-0149782119
GET http://127.0.0.1:8000/development/new-construction/labels/summary
GET http://127.0.0.1:8000/development/prediction/features/summary
```

Important caveats:

- These are historical permit metrics and future target-label summaries only.
- No production model is trained in Phase 10A.
- No prediction probability or development score is exposed.
- Null, short, placeholder, unmatched, and ambiguous parcel numbers are not
  force-matched.
- The prediction feature summary endpoint reports Phase 10B feature matrix
  readiness only. `model_active=false` and no probability is returned.
- Current-context feature caveats are documented in
  `docs/modeling/development_prediction_feature_registry.md`.
- Phase 10C may add internal baseline experiment metadata to
  `/development/prediction/features/summary`, but it still does not expose a
  parcel prediction endpoint or frontend probability. `production_ready=false`.

## Tests

```powershell
cd C:\CabarrusFutureScape\backend
python -m pytest
```
