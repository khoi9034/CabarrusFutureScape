# Parcel Search Specification

Future endpoint:

```http
GET /parcels/search
```

This specification defines search behavior only. It does not implement search,
FastAPI routes, caching, vector search, or frontend integration.

## Search Goals

Support operational parcel lookup by:

- `official_parcel_id`
- `pin14`
- owner/account name
- mailing address
- subdivision
- neighborhood
- zoning code
- zoning jurisdiction
- planning jurisdiction
- municipality once authoritative boundary data exists
- partial text search

## Request Parameters

| Parameter | Type | Default | Notes |
| --- | --- | --- | --- |
| `q` | string | required unless filters/spatial params exist | Free text query. |
| `fields` | string[] | all searchable fields | Optional scope list. |
| `limit` | integer | `25` | Maximum `100`. |
| `cursor` | string | null | Opaque keyset cursor. |
| `sort` | string | `relevance` | See sorting section. |
| `include_geometry` | boolean | `false` | List results should avoid full geometry by default. |
| `geometry_format` | string | `centroid` | `centroid`, `geojson`, or `none`. |
| `bbox` | string | null | Future spatial constraint. |
| `radius` | string | null | Future spatial constraint. |
| `polygon` | GeoJSON/reference | null | Future spatial constraint. |

Supported `fields` values:

- `official_parcel_id`
- `pin14`
- `owner`
- `mailing_address`
- `subdivision`
- `neighborhood`
- `zoning_code`
- `zoning_jurisdiction`
- `planning_jurisdiction`
- `municipality`
- `all`

## Matching Behavior

Recommended matching tiers:

1. Exact `official_parcel_id`.
2. Exact `pin14`.
3. Prefix `pin14`.
4. Exact normalized owner/account phrase.
5. Partial owner/account text.
6. Mailing address token match.
7. Subdivision/neighborhood token match.
8. Zoning code/jurisdiction match.
9. Planning jurisdiction match.

Partial text search should normalize:

- case
- punctuation spacing
- repeated whitespace
- common mailing abbreviations where safe

Do not use AI or vector search in this phase.

## Ranking Strategy

Initial rank should combine:

- match tier
- exact match before partial match
- `safe_for_dashboard=true` before review rows when otherwise tied
- higher `zoning_assignment_confidence`
- stable tie-breaker `official_parcel_id`

Example rank order:

```text
exact official_parcel_id
exact pin14
pin14 prefix
owner phrase
owner partial
address phrase
subdivision/neighborhood
zoning fields
planning fields
```

## Sorting Strategy

Supported `sort` values:

- `relevance`
- `official_parcel_id`
- `pin14`
- `parcel_area_acres_calc`
- `marketvalue_numeric`
- `assessedvalue_numeric`
- `zoning_jurisdiction_name`
- `dominant_zoning_code_raw`
- `zoning_assignment_confidence`
- `primary_governance_warning`

Every non-relevance sort must use `official_parcel_id` as the final key.

## Pagination

Use keyset pagination.

Response metadata:

```json
{
  "pagination": {
    "limit": 25,
    "next_cursor": "opaque-cursor",
    "has_more": true
  }
}
```

Avoid exposing SQL offsets for public endpoints.

## Search Result Shape

Each result should include:

- `official_parcel_id`
- `pin14`
- `owner_display`
- `mailing_address`
- `subdivision`
- `neighborhood`
- `parcel_area_acres`
- `valuation_band`
- `zoning_summary`
- `governance`
- `match`
- optional centroid/geometry

## Future SQL Planning

Likely joined source:

```sql
public.parcels_enriched AS parcel
JOIN public.parcel_zoning_intelligence_qa AS qa
  ON qa.official_parcel_id = parcel.official_parcel_id
```

Recommended future indexes:

- btree: `official_parcel_id`, `pin14`
- trigram: `acctname1`, `acctname2`, `mailaddr1`, `subdiv_name`, `nbh_name`
- btree: `zoning_jurisdiction_name`, `dominant_zoning_code_raw`
- btree: `safe_for_dashboard`, `primary_governance_warning`
- GiST: `geometry`

## Spatial Search Readiness

Search may combine text and spatial constraints:

- `bbox`: restrict to map extent.
- `radius`: restrict to distance from point.
- `polygon`: restrict to a polygon area.
- `viewport`: same behavior as bbox.

Spatial filters should run before expensive text ranking when selective.

## Error Cases

- Empty query with no filters: return `400 invalid_request`.
- Query too short for partial text: return `400 invalid_request` or require exact field.
- Unsupported field scope: return `400 invalid_request`.
- Invalid cursor: return `400 invalid_cursor`.
- Excessive spatial search: return `400 query_too_large`.
