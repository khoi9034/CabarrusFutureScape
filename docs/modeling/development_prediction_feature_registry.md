# Development Prediction Feature Registry

Phase 10B creates a parcel-year feature matrix for future development prediction work. It does **not** train a model, publish probabilities, or change the dashboard.

The registry in `config/development_prediction_features.json` is the source of truth for feature group, source table, temporal status, leakage risk, and whether a feature is safe for a baseline or future model.

## Temporal Policy

Features fall into three categories:

- `time_safe`: derived only from records dated on or before December 31 of `snapshot_year`.
- `current_context`: useful for planning review, but not a historical snapshot.
- `not_available`: deliberately null or placeholder until the correct source exists.

The Phase 10A label columns remain targets only:

- `new_construction_next_1yr`
- `new_construction_next_3yr`
- `residential_new_construction_next_3yr`
- `commercial_new_construction_next_3yr`
- `co_issued_next_3yr`

## Feature Groups

- `parcel_static_features`: parcel area, valuation, size and quality fields.
- `zoning_features`: current dominant zoning and assignment confidence.
- `flood_constraint_features`: FEMA NFHL-derived parcel flood constraint attributes.
- `school_assignment_features`: attendance-zone assignment fields and explicit capacity-not-available placeholders.
- `permit_history_features`: prior-window permit counts by date and segment.
- `new_construction_history_features`: prior-window staff-provided new-construction permit history.
- `development_pressure_features`: current-context dashboard activity fields for review only.
- `jurisdiction_features`: current planning/zoning jurisdiction context.
- `future_placeholder_features`: planned features that are intentionally null in Phase 10B.

## Leakage Caveats

Current zoning, current school assignment, current parcel valuation, and current development activity summaries are not historical snapshots. They may be useful for present-day due diligence, but should not be treated as fully time-safe model features until historical source series exist.

The matrix includes a `temporal_leakage_status` field set to `mixed_time_safe_and_current_context_features` to make this caveat visible in downstream review.

