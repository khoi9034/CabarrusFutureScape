# Parcel Intelligence Response Examples

Examples for future read-only Parcel Intelligence API endpoints. These examples
are contract examples only; no API implementation exists yet.

## 1. Parcel Detail Response

```json
{
  "official_parcel_id": "CFS-PARCEL-0149788744",
  "objectid_1": 149788744,
  "pin14": "56044194530000",
  "parcel": {
    "owner_display": "EXAMPLE OWNER",
    "mailing_address": {
      "line1": "100 EXAMPLE ST",
      "line2": null,
      "city": "CONCORD",
      "state": "NC",
      "zipcode": "28025"
    },
    "subdivision": "NORTH PRINCETON",
    "neighborhood": "NORTH PRINCETON",
    "area_acres": 0.963544,
    "area_sq_m": 3899.5,
    "parcel_size_category": "residential_standard",
    "parcel_quality_status": "trusted"
  },
  "valuation": {
    "market_value": 325000,
    "assessed_value": 325000,
    "land_value": 85000,
    "building_value": 240000,
    "valuation_basis": 325000,
    "value_per_acre": 337299.2,
    "valuation_band": "medium"
  },
  "zoning": {
    "jurisdiction": "Kannapolis",
    "code_raw": "R4",
    "general_raw": null,
    "category_normalized": "residential",
    "label_normalized": "R4",
    "assignment_confidence": "high",
    "join_status": "multi_jurisdiction_assigned",
    "dominant_overlap_pct": 1.0,
    "overlap_count": 2,
    "jurisdiction_overlap_count": 2,
    "second_best": {
      "jurisdiction": "Cabarrus County / Unincorporated",
      "code_raw": "LDR",
      "overlap_pct": 1.0
    }
  },
  "planning_context": {
    "planning_jurisdiction_name": null,
    "planning_boundary_type": null
  },
  "governance": {
    "safe_for_dashboard": false,
    "needs_governance_review": true,
    "primary_warning": "review_multi_jurisdiction",
    "warning_categories": [
      "review_multi_jurisdiction",
      "review_near_tie"
    ]
  },
  "geometry": {
    "format": "centroid",
    "srid": 4326,
    "coordinates": [-80.62, 35.44]
  }
}
```

## 2. Parcel Search Result

```json
{
  "query": "north princeton r4",
  "results": [
    {
      "official_parcel_id": "CFS-PARCEL-0149788744",
      "pin14": "56044194530000",
      "owner_display": "EXAMPLE OWNER",
      "subdivision": "NORTH PRINCETON",
      "neighborhood": "NORTH PRINCETON",
      "area_acres": 0.963544,
      "zoning": {
        "jurisdiction": "Kannapolis",
        "code_raw": "R4",
        "category_normalized": "residential",
        "confidence": "high"
      },
      "governance": {
        "safe_for_dashboard": false,
        "primary_warning": "review_multi_jurisdiction"
      },
      "match": {
        "matched_fields": ["subdivision", "zoning_code"],
        "score": 0.91
      },
      "centroid": {
        "type": "Point",
        "coordinates": [-80.62, 35.44]
      }
    }
  ],
  "pagination": {
    "limit": 25,
    "next_cursor": null,
    "has_more": false
  }
}
```

## 3. Parcel Statistics Response

```json
{
  "filters": {
    "zoning_jurisdiction": "Concord",
    "safe_for_dashboard": true
  },
  "summary": {
    "parcel_count": 20754,
    "total_area_acres": 18420.7,
    "avg_area_acres": 0.8875,
    "safe_for_dashboard_count": 20754,
    "review_count": 0,
    "high_confidence_count": 20600,
    "medium_confidence_count": 154,
    "low_confidence_count": 0
  },
  "groups": [
    {
      "group_by": "valuation_band",
      "value": "medium",
      "parcel_count": 11200,
      "total_area_acres": 8300.4
    }
  ]
}
```

## 4. Governance Warning Response

```json
{
  "warning": "review_multi_jurisdiction",
  "summary": {
    "parcel_count": 4441,
    "description": "Parcel intersects zoning polygons from more than one zoning jurisdiction."
  },
  "results": [
    {
      "official_parcel_id": "CFS-PARCEL-0149788744",
      "pin14": "56044194530000",
      "zoning_jurisdiction_name": "Kannapolis",
      "dominant_zoning_code_raw": "R4",
      "second_zoning_jurisdiction_name": "Cabarrus County / Unincorporated",
      "second_zoning_code_raw": "LDR",
      "dominant_overlap_pct": 1.0,
      "second_overlap_pct": 1.0,
      "top_two_overlap_pct_gap": 0.0,
      "primary_governance_warning": "review_multi_jurisdiction",
      "governance_warning_categories": [
        "review_multi_jurisdiction",
        "review_near_tie"
      ]
    }
  ],
  "pagination": {
    "limit": 25,
    "next_cursor": "opaque-cursor",
    "has_more": true
  }
}
```

## 5. Zoning Summary Response

```json
{
  "summary": {
    "total_parcels": 110017,
    "assigned_parcels": 109984,
    "no_match_parcels": 33,
    "safe_for_dashboard_parcels": 74781,
    "review_parcels": 35236
  },
  "by_jurisdiction": [
    {
      "zoning_jurisdiction_name": "Concord",
      "total_parcels": 43497,
      "safe_for_dashboard_parcels": 20754,
      "review_parcels": 22743,
      "low_confidence_count": 214,
      "multi_jurisdiction_count": 1144,
      "sliver_overlap_count": 7114,
      "code_semantics_review_count": 18399
    },
    {
      "zoning_jurisdiction_name": "Kannapolis",
      "total_parcels": 26832,
      "safe_for_dashboard_parcels": 22523,
      "review_parcels": 4309,
      "low_confidence_count": 321,
      "multi_jurisdiction_count": 381,
      "sliver_overlap_count": 2723,
      "code_semantics_review_count": 1431
    }
  ],
  "confidence_distribution": [
    {"value": "high", "parcel_count": 107318},
    {"value": "medium", "parcel_count": 1835},
    {"value": "low", "parcel_count": 831},
    {"value": "no_match", "parcel_count": 33}
  ]
}
```
