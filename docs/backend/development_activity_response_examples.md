# Development Activity Response Examples

Examples for future read-only Development Activity API endpoints. These
examples are contract examples only; no API implementation exists yet.

## 1. Statistics Response

```json
{
  "filters": {
    "year": 2025,
    "zoning_jurisdiction": "Concord"
  },
  "summary": {
    "permit_count": 6426,
    "active_parcel_count": 3091,
    "unmatched_permit_count": 12,
    "ambiguous_permit_count": 210,
    "permit_amount_total": 845250000.0,
    "activity_anchor_date": "2025-12-31",
    "date_range": {
      "start": "2025-01-01",
      "end": "2025-12-31"
    }
  },
  "activity_classes": [
    {
      "activity_class": "very_high_activity",
      "parcel_count": 551,
      "percentage": 0.5008
    },
    {
      "activity_class": "high_activity",
      "parcel_count": 2430,
      "percentage": 2.2087
    }
  ],
  "metadata": {
    "source_tables": [
      "public.development_activity_parcel_summary",
      "public.development_activity_time_summary"
    ],
    "source_max_activity_date": "2025-12-31",
    "cache_status": "not_configured",
    "generated_at": "2026-05-31T02:13:17"
  }
}
```

## 2. Trend Response

```json
{
  "grain": "year",
  "filters": {
    "permit_type": "new_construction"
  },
  "buckets": [
    {
      "period": "2023",
      "activity_year": 2023,
      "permit_count": 4880,
      "active_parcel_count": 4210,
      "unmatched_permit_count": 14,
      "ambiguous_permit_count": 188,
      "permit_amount_total": 705120000.0
    },
    {
      "period": "2024",
      "activity_year": 2024,
      "permit_count": 5215,
      "active_parcel_count": 4525,
      "unmatched_permit_count": 17,
      "ambiguous_permit_count": 201,
      "permit_amount_total": 790440000.0
    },
    {
      "period": "2025",
      "activity_year": 2025,
      "permit_count": 6426,
      "active_parcel_count": 5004,
      "unmatched_permit_count": 12,
      "ambiguous_permit_count": 210,
      "permit_amount_total": 845250000.0
    }
  ],
  "comparison": {
    "mode": "year_over_year",
    "current_period": "2025",
    "comparison_period": "2024",
    "permit_count_delta": 1211,
    "permit_count_pct_change": 23.22,
    "trend": "up"
  }
}
```

## 3. Hotspot Response

```json
{
  "filters": {
    "activity_class": "very_high_activity",
    "limit": 2
  },
  "results": [
    {
      "official_parcel_id": "CFS-PARCEL-0149788744",
      "pin14": "56044194530000",
      "subdivision": "EXAMPLE SUBDIVISION",
      "neighborhood": "EXAMPLE NEIGHBORHOOD",
      "zoning": {
        "jurisdiction": "Concord",
        "code_raw": "PUD",
        "category_normalized": "unknown",
        "assignment_confidence": "high"
      },
      "activity": {
        "total_permit_count": 38,
        "first_permit_date": "2003-07-01",
        "latest_permit_date": "2025-12-04",
        "active_year_count": 12,
        "recent_permit_count_1yr": 4,
        "recent_permit_count_3yr": 9,
        "development_activity_score": 92.5,
        "development_activity_class": "very_high_activity"
      },
      "permit_summary": {
        "dominant_permit_type": "new_construction",
        "dominant_work_type": "residential",
        "latest_permit_status": "issued",
        "total_permit_amount": 4850000.0,
        "avg_permit_amount": 127631.58
      },
      "qa": {
        "has_unmatched_or_ambiguous_permit_flag": false,
        "ambiguous_permit_count": 0,
        "co_date_future_outlier_count": 0
      },
      "geometry": {
        "format": "centroid",
        "srid": 4326,
        "coordinates": [-80.62, 35.41]
      }
    }
  ],
  "pagination": {
    "limit": 2,
    "next_cursor": "opaque-hotspot-cursor",
    "has_more": true
  }
}
```

## 4. Zoning Activity Response

```json
{
  "filters": {
    "zoning_jurisdiction": "Kannapolis",
    "permit_type": "new_construction"
  },
  "groups": [
    {
      "zoning_jurisdiction_name": "Kannapolis",
      "dominant_zoning_code_raw": "R4",
      "dominant_zoning_general_normalized": "residential",
      "permit_type": "new_construction",
      "permit_count": 1600,
      "active_parcel_count": 1566,
      "ambiguous_permit_count": 39,
      "total_permit_amount": 100618682.68,
      "avg_permit_amount": 117958.6,
      "first_permit_date": "2001-08-11",
      "latest_permit_date": "2025-10-29"
    }
  ],
  "metadata": {
    "source_table": "public.development_activity_zoning_summary",
    "zoning_code_semantics": "raw municipal codes are not normalized across jurisdictions"
  }
}
```

## 5. Temporal Query Response

```json
{
  "mode": "rolling_12",
  "resolved_date_window": {
    "start": "2025-01-01",
    "end": "2025-12-31",
    "anchor_date": "2025-12-31"
  },
  "filters": {
    "zoning_jurisdiction": "Concord",
    "permit_type": "new_construction",
    "bbox": "-80.75,35.25,-80.48,35.55"
  },
  "summary": {
    "permit_count": 2140,
    "active_parcel_count": 2098,
    "zoning_activity_group_count": 16,
    "unmatched_permit_count": 0,
    "ambiguous_permit_count": 21
  },
  "trend": {
    "direction": "up",
    "comparison_window": "previous_12_months",
    "permit_count_delta": 260,
    "permit_count_pct_change": 13.83
  },
  "features": [],
  "warnings": [
    "feature payload omitted because include_features=false"
  ],
  "metadata": {
    "source_tables": [
      "public.development_activity_time_summary",
      "public.real_property_permit_parcel_relationship"
    ],
    "cache_status": "not_configured"
  }
}
```

## 6. Activity Summary Response

```json
{
  "summary": {
    "headline": "Development activity remains elevated across recent permit windows.",
    "permit_records": 64426,
    "parcels_with_activity": 43474,
    "parcels_without_activity": 66543,
    "recent_1yr_activity_parcels": 3091,
    "recent_3yr_activity_parcels": 9388,
    "activity_date_range": {
      "start": "1986-12-01",
      "end": "2025-12-31"
    }
  },
  "top_jurisdictions": [
    {
      "zoning_jurisdiction_name": "Concord",
      "permit_count": 2140,
      "dominant_zoning_code_raw": "PUD",
      "permit_type": "new_construction"
    },
    {
      "zoning_jurisdiction_name": "Kannapolis",
      "permit_count": 1600,
      "dominant_zoning_code_raw": "R4",
      "permit_type": "new_construction"
    }
  ],
  "top_hotspots": [
    {
      "official_parcel_id": "CFS-PARCEL-0149788744",
      "total_permit_count": 38,
      "latest_permit_date": "2025-12-04",
      "development_activity_class": "very_high_activity"
    }
  ],
  "qa": {
    "relationship_match_rate": 99.6973,
    "unmatched_permit_count": 195,
    "ambiguous_permit_count": 2427,
    "caveats": [
      "CODate contains future outlier values and should not drive default temporal filtering.",
      "Zoning code semantics are jurisdiction-specific."
    ]
  }
}
```

## Error Response

```json
{
  "error": {
    "code": "invalid_temporal_filter",
    "message": "month requires year",
    "details": {
      "month": 5,
      "year": null
    }
  },
  "request_id": "dev-activity-example-request"
}
```
