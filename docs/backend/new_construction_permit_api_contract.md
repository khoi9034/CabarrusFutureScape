# New Construction Permit API Contract

These endpoints expose Phase 10A read-only historical new construction permit
intelligence and target-label summaries. They do not expose a prediction
probability.

## `GET /development/new-construction/statistics`

Purpose: countywide summary of the staff-provided new construction extract.

Response includes:

- total permits
- matched, unmatched, ambiguous, and invalid-placeholder permit counts
- unique matched parcel count
- CO issued/not issued counts
- permit and CO date ranges
- permit type, construction status, and match-confidence distributions
- `prediction_model_active = false`
- `prediction_probability_available = false`

## `GET /development/new-construction/trends`

Purpose: annual and monthly new construction permit trends.

Response includes:

- annual trend rows
- monthly trend rows
- residential/commercial counts
- completed and active-uncompleted counts
- `prediction_model_active = false`

## `GET /development/new-construction/parcel/{official_parcel_id}`

Purpose: selected parcel new construction history summary.

Response includes:

- total new construction permits
- residential/commercial split
- first/latest permit dates
- latest CO date
- completed count
- active uncompleted count
- average days to CO
- recent 1/3/5 year counts
- development stage
- source label
- no prediction score

No-result behavior: returns HTTP 200 with zero counts and
`development_stage = no_matched_new_construction_activity`.

## `GET /development/new-construction/labels/summary`

Purpose: QA summary for future model target labels.

Response includes:

- label table row count
- snapshot year range
- positive rate by snapshot year for next 1-year and next 3-year targets
- `labels_are_targets_only = true`
- `prediction_model_active = false`
- `prediction_probability_available = false`

## Caveats

Parcel matching is intentionally cautious. Null, short, placeholder, unmatched,
and ambiguous parcel numbers are not force-matched. These records remain visible
in QA outputs and aggregate match counts.
