# Flood Constraint Response Examples

Example payloads for Flood Constraint API implementation. The parcel overlay
endpoints are backed by `public.parcel_flood_constraint_overlay`; source
polygon visualization is backed by `public.fema_nfhl_flood_zones_clean`.

## Parcel Flood Detail Response

`GET /constraints/flood/CFS-PARCEL-0149731289`

```json
{
  "official_parcel_id": "CFS-PARCEL-0149731289",
  "pin14": "46718904550000",
  "dominant_flood_zone": "AE",
  "flood_zone_codes": ["AE"],
  "floodplain_present": true,
  "floodway_present": true,
  "sfha_present": true,
  "moderate_flood_present": false,
  "minimal_flood_present": false,
  "percent_parcel_constrained": 100.0,
  "flood_constrained_area_acres": 12.2446,
  "floodway_area_acres": 11.4716,
  "sfha_area_acres": 12.2446,
  "flood_review_required": true,
  "buildability_impact": "severe",
  "flood_constraint_score": 100.0,
  "overlay_confidence": "high",
  "source": {
    "overlay_table": "public.parcel_flood_constraint_overlay",
    "fema_source": "FEMA NFHL Layer 28 Flood Hazard Zones",
    "srid": 4326
  }
}
```

## Statistics Response

`GET /constraints/flood/statistics`

```json
{
  "filters_applied": {},
  "total_parcels": 110017,
  "floodplain_parcels": 8661,
  "floodway_parcels": 3229,
  "sfha_parcels": 7254,
  "review_required_parcels": 7989,
  "high_severe_buildability_parcels": 6362,
  "severity_distribution": [
    {
      "flood_severity_class": "low",
      "parcel_count": 101356,
      "percentage": 92.1276
    },
    {
      "flood_severity_class": "high",
      "parcel_count": 4025,
      "percentage": 3.6585
    },
    {
      "flood_severity_class": "severe",
      "parcel_count": 3229,
      "percentage": 2.935
    },
    {
      "flood_severity_class": "moderate",
      "parcel_count": 1407,
      "percentage": 1.2789
    }
  ],
  "dominant_zone_distribution": [
    {
      "dominant_flood_zone": "X",
      "parcel_count": 107860,
      "percentage": 98.0394
    },
    {
      "dominant_flood_zone": "AE",
      "parcel_count": 2157,
      "percentage": 1.9606
    }
  ],
  "buildability_impact_distribution": [
    {
      "buildability_impact": "low",
      "parcel_count": 102582,
      "percentage": 93.242
    },
    {
      "buildability_impact": "severe",
      "parcel_count": 4880,
      "percentage": 4.4357
    },
    {
      "buildability_impact": "high",
      "parcel_count": 1482,
      "percentage": 1.3471
    },
    {
      "buildability_impact": "moderate",
      "parcel_count": 1073,
      "percentage": 0.9753
    }
  ],
  "caveats": [
    "FEMA Zone X is widespread low-risk mapped context and should not be treated as a high-impact regulatory constraint."
  ]
}
```

## Filter Response

`GET /constraints/flood/filter?flood_review_required=true&limit=2`

```json
{
  "filters_applied": {
    "flood_review_required": true
  },
  "limit": 2,
  "offset": 0,
  "total_count": 7989,
  "has_more": true,
  "results": [
    {
      "official_parcel_id": "CFS-PARCEL-0149731289",
      "pin14": "46718904550000",
      "dominant_flood_zone": "AE",
      "flood_severity_class": "severe",
      "buildability_impact": "severe",
      "percent_parcel_constrained": 100.0,
      "flood_review_required": true,
      "flood_constraint_score": 100.0
    },
    {
      "official_parcel_id": "CFS-PARCEL-0149734834",
      "pin14": "46727233480000",
      "dominant_flood_zone": "AE",
      "flood_severity_class": "severe",
      "buildability_impact": "severe",
      "percent_parcel_constrained": 100.0,
      "flood_review_required": true,
      "flood_constraint_score": 100.0
    }
  ]
}
```

## High Review Response

`GET /constraints/flood/high-review?sort=flood_constraint_score_desc`

```json
{
  "filters_applied": {
    "review_scope": "flood_review_required_or_high_severe_buildability"
  },
  "limit": 25,
  "offset": 0,
  "total_count": 7989,
  "results": [
    {
      "official_parcel_id": "CFS-PARCEL-0149721869",
      "pin14": "00000",
      "dominant_flood_zone": "AE",
      "flood_zone_codes": ["AE", "X"],
      "floodway_present": true,
      "sfha_present": true,
      "percent_parcel_constrained": 100.0,
      "percent_parcel_floodway": 83.2418,
      "buildability_impact": "severe",
      "flood_constraint_score": 100.0,
      "review_reasons": ["floodway_present", "sfha_present", "high_constraint_score"]
    }
  ]
}
```

## Summary Response

`GET /constraints/flood/summary?group_by=buildability_impact`

```json
{
  "filters_applied": {
    "group_by": "buildability_impact"
  },
  "summary": [
    {
      "buildability_impact": "low",
      "parcel_count": 102582,
      "review_required_count": 554,
      "avg_percent_constrained": 0.0197
    },
    {
      "buildability_impact": "severe",
      "parcel_count": 4880,
      "review_required_count": 4880,
      "avg_percent_constrained": 62.7758
    },
    {
      "buildability_impact": "high",
      "parcel_count": 1482,
      "review_required_count": 1482,
      "avg_percent_constrained": 30.3623
    },
    {
      "buildability_impact": "moderate",
      "parcel_count": 1073,
      "review_required_count": 1073,
      "avg_percent_constrained": 11.7122
    }
  ],
  "source": {
    "table": "public.parcel_flood_constraint_overlay",
    "overlay_phase": "Phase 7B"
  }
}
```

## FEMA Flood Zone Polygon Response

`GET /constraints/flood/zones?flood_severity_class=severe&limit=1`

```json
{
  "filters_applied": {
    "flood_severity_class": "severe"
  },
  "limit": 1,
  "offset": 0,
  "total_count": 283,
  "zones": [
    {
      "flood_zone_internal_id": "FEMA-NFHL-28-12345",
      "source_objectid": 12345,
      "fld_ar_id": "3710036400",
      "globalid": "{00000000-0000-0000-0000-000000000000}",
      "gfid": "3710036400",
      "flood_zone_code": "AE",
      "flood_constraint_type": "floodway",
      "flood_severity_class": "severe",
      "source_layer": "FEMA NFHL Layer 28 Flood Hazard Zones",
      "geometry": {
        "type": "MultiPolygon",
        "coordinates": [
          [
            [
              [-80.612345, 35.312345],
              [-80.612211, 35.31241],
              [-80.612092, 35.312291],
              [-80.612345, 35.312345]
            ]
          ]
        ],
        "spatial_reference": {
          "wkid": 4326
        }
      }
    }
  ]
}
```

This response is intended for transparent FEMA source polygon visualization.
It should not be used to select parcels automatically; parcel selection remains
driven by parcel-focused endpoints and layer marker interactions.
