# School Constraint API Contract

Phase 8B exposes read-only school assignment and QA endpoints backed by the
Phase 8A attendance-zone overlay. These endpoints are safe for assignment and
QA review, but not for final capacity scoring because `public.school_capacity`
has no vetted enrollment/capacity rows yet.

## Source Tables

- `public.parcel_school_assignment`
- `public.parcel_school_summary`
- `public.school_reference`
- `public.school_zones`
- `public.school_capacity`

School points are reference/dictionary records only. Parcel assignment is based
on elementary, middle, and high attendance-zone polygon overlap.

## Endpoints

### `GET /constraints/schools/statistics`

Returns countywide or filtered school assignment and capacity-readiness
statistics.

Supported filters:

- `school_assignment_confidence`
- `school_assignment_review_required`
- `school_summary_status`
- `recommended_action`
- `elementary_school_name`
- `middle_school_name`
- `high_school_name`
- `has_elementary_assignment`
- `has_middle_assignment`
- `has_high_assignment`
- `capacity_data_available`

Response includes:

- assignment counts by level
- missing assignment counts
- assignment review count
- capacity availability counts
- score availability count
- school reference/zone counts
- confidence/status/class distributions
- `safe_for_api_exposure`
- caveats

### `GET /constraints/schools/{official_parcel_id}`

Returns selected parcel school assignment and capacity-readiness detail.

404 response:

```json
{
  "detail": "School constraint record not found"
}
```

Response includes:

- parcel identity
- elementary, middle, and high assignment objects
- zone ID and school name per level
- overlap area/percent per level
- name match confidence per level
- capacity status per level
- assignment confidence/review flags
- score fields, which remain `null`
- `school_constraint_class = not_scored`
- `recommended_action = capacity_data_needed`

### `GET /constraints/schools/filter`

Returns paginated parcel school assignment records.

Supported filters are the same as `/statistics`.

Pagination:

- `limit`: default `20`, clamped to max `100`
- `offset`: default `0`

Sorting:

1. review-required parcels first
2. assignment confidence
3. official parcel ID

### `GET /constraints/schools/district-summary`

Returns parcel counts grouped by assigned attendance-zone district.

Filters:

- `school_level`: `elementary`, `middle`, or `high`
- `school_name`: partial text match

Response includes:

- school level
- zone ID
- school name
- normalized school name
- reference match confidence
- assigned parcel count
- review-required parcel count
- capacity data availability count
- capacity status

### `GET /constraints/schools/qa-summary`

Returns QA readiness metrics for school assignment and future UI/API exposure.

Response includes:

- school reference count
- included public CCS count
- excluded count by reason
- school zone counts by level
- unmatched zone names
- duplicate normalized names
- missing assignment counts
- multi-zone overlap counts
- parcels assigned to unmatched/non-exact zones
- capacity availability
- `safe_for_api_exposure`
- caveats

## API Exposure Decision

`safe_for_api_exposure` is `true` for read-only assignment and QA endpoints
because:

- parcel assignment row count equals `public.parcels_enriched`
- assignment uses attendance-zone polygons, not school point distance
- excluded KCS/private/magnet/non-level records remain outside V1 assignment
- unresolved names remain flagged as QA review
- capacity scores are explicitly null/not scored

It is not safe to expose school capacity pressure scores until a vetted
capacity/enrollment source is ingested and reviewed.

## Error Handling

- Missing parcel detail returns `404`.
- Invalid `school_level` on district summary returns `422`.
- Empty filters return `200` with zero totals or empty arrays.
- Limit values above `100` are clamped to `100`.

## Caching and Performance Notes

Recommended future indexes already exist on assignment and summary IDs, school
names, status fields, and geometry. API caching can be added later for global
statistics and district summaries because these are stable generated overlays.

## Future Work

1. Resolve included unmatched CCS zone names.
2. Identify authoritative capacity/enrollment source.
3. Add read-only frontend selected parcel school panel.
4. Add school district map layer after UI review.
5. Add capacity scoring only after real capacity data exists.
