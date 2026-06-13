# School Constraint Response Examples

## Statistics

Request:

```text
GET /constraints/schools/statistics
```

Example response:

```json
{
  "total_parcels": 110017,
  "elementary_assigned_parcels": 91161,
  "middle_assigned_parcels": 86221,
  "high_assigned_parcels": 91161,
  "missing_elementary_assignment_parcels": 18856,
  "missing_middle_assignment_parcels": 23796,
  "missing_high_assignment_parcels": 18856,
  "assignment_review_required_parcels": 75143,
  "capacity_data_available_parcels": 0,
  "capacity_not_available_parcels": 110017,
  "school_constraint_score_non_null_parcels": 0,
  "school_reference_count": 53,
  "included_public_ccs_reference_count": 34,
  "school_zone_count": 44,
  "included_cfs_v1_zone_count": 35,
  "safe_for_api_exposure": true,
  "school_constraint_class_distribution": [
    {
      "value": "not_scored",
      "count": 110017,
      "percentage": 100.0
    }
  ],
  "filters_applied": {},
  "caveats": [
    "School assignments use attendance-zone polygon overlap; school point distance is not used.",
    "School capacity and enrollment data are not available yet; scores remain null/not_scored."
  ]
}
```

## Parcel Detail

Request:

```text
GET /constraints/schools/CFS-PARCEL-0149726579
```

Example response:

```json
{
  "official_parcel_id": "CFS-PARCEL-0149726579",
  "pin14": "45896367300000",
  "objectid_1": 149726579,
  "elementary": {
    "zone_id": "SCHOOLZONE-ELEMENTARY-CARL_A_FURR_ELEMENTARY-56",
    "school_name": "Carl A Furr ES",
    "school_name_normalized": "carl_a_furr_elementary",
    "has_assignment": true,
    "overlap_area_acres": 141.8342,
    "overlap_percent": 100.0,
    "match_confidence": "normalized_exact",
    "capacity_status": "not_available",
    "utilization_percent": null,
    "available_seats": null
  },
  "middle": {
    "school_name": "Roberta Road MS",
    "has_assignment": true,
    "match_confidence": "unmatched_reference_review",
    "capacity_status": "not_available"
  },
  "high": {
    "school_name": "Jay M Robinson HS",
    "has_assignment": true,
    "match_confidence": "normalized_exact",
    "capacity_status": "not_available"
  },
  "school_assignment_confidence": "review",
  "school_assignment_review_required": true,
  "school_capacity_data_available": false,
  "school_capacity_score": null,
  "school_constraint_score": null,
  "school_constraint_class": "not_scored",
  "school_summary_status": "assignment_available_capacity_pending",
  "recommended_action": "capacity_data_needed",
  "data_quality_flags": [
    "unmatched_or_non_exact_school_reference",
    "capacity_not_available"
  ]
}
```

## Filter

Request:

```text
GET /constraints/schools/filter?school_assignment_review_required=true&limit=5
```

Example response:

```json
{
  "filters_applied": {
    "school_assignment_review_required": true
  },
  "limit": 5,
  "offset": 0,
  "total_count": 75143,
  "results": [
    {
      "official_parcel_id": "CFS-PARCEL-0149720360",
      "pin14": "131 092",
      "elementary_school_name": null,
      "middle_school_name": null,
      "high_school_name": null,
      "has_elementary_assignment": false,
      "has_middle_assignment": false,
      "has_high_assignment": false,
      "school_assignment_confidence": "low",
      "school_assignment_review_required": true,
      "school_capacity_data_available": false,
      "school_constraint_class": "not_scored",
      "recommended_action": "capacity_data_needed"
    }
  ]
}
```

## District Summary

Request:

```text
GET /constraints/schools/district-summary?school_level=elementary
```

Example response:

```json
{
  "filters_applied": {
    "school_level": "elementary"
  },
  "total_rows": 19,
  "districts": [
    {
      "school_level": "elementary",
      "school_name": "W R Odell ES",
      "match_confidence": "normalized_exact",
      "parcel_count": 8493,
      "review_required_count": 0,
      "capacity_data_available_count": 0,
      "capacity_status": "not_available"
    }
  ]
}
```

## QA Summary

Request:

```text
GET /constraints/schools/qa-summary
```

Example response:

```json
{
  "school_reference_count": 53,
  "included_public_ccs_count": 34,
  "unmatched_zone_names": [
    {
      "issue_type": "unmatched_zone_reference",
      "severity": "review",
      "school_level": "elementary",
      "school_name": "Hickory Ridge ES",
      "detail": "Included CCS attendance zone has no matching school reference point record."
    }
  ],
  "parcel_assignment_count": 110017,
  "missing_elementary_assignment_count": 18856,
  "missing_middle_assignment_count": 23796,
  "missing_high_assignment_count": 18856,
  "capacity_available": false,
  "safe_for_api_exposure": true
}
```
