# Constraint Scoring Framework

The CFS constraint score is a deterministic review score from `0` to `100`.
It is not a forecast, prediction, recommendation, or legal determination.

## Score Bands

| Score Range | Class | Meaning |
| --- | --- | --- |
| 0 to 24 | `low` | Constraint context exists but does not usually require major review. |
| 25 to 49 | `moderate` | Constraint may affect layout, timing, service review, or mitigation. |
| 50 to 74 | `high` | Constraint likely requires staff review or coordination. |
| 75 to 100 | `severe` | Constraint may substantially affect buildability, safety, cost, or timing. |

`unknown` should be used when source quality does not support scoring.

## Core Fields

Future table: `public.parcel_constraint_score`

Recommended fields:

- `official_parcel_id`
- `constraint_score`
- `constraint_class`
- `review_required`
- `dashboard_safe`
- `buildability_impact`
- `dominant_constraint_category`
- `highest_severity_category`
- `flood_component_score`
- `school_component_score`
- `transportation_component_score`
- `water_sewer_component_score`
- `fire_ems_component_score`
- `heat_runoff_component_score`
- `environmental_component_score`
- `scoring_version`
- `source_freshness_status`
- `transformed_at`

## Component Scoring

Each domain should produce a `0` to `100` component score before the combined
score is calculated.

Example planning weights for a future multi-constraint score:

- Flood / Floodway: 25 percent
- Water / Sewer: 20 percent
- Transportation: 15 percent
- School Capacity / District: 15 percent
- Fire / EMS: 10 percent
- Heat / Impervious / Runoff: 10 percent
- Environmental Sensitivity: 5 percent

Weights are placeholders only. They should be approved through governance before
dashboard or API use.

## Review Flags

`review_required=true` when:

- any domain severity is `high` or `severe`
- data quality is `unknown` for a high-priority domain
- source metadata is missing
- no-match or multi-match assignment affects interpretation
- the domain steward requires human review

`dashboard_safe=false` when:

- source authority is not approved
- source date/effective date is missing
- sensitive attributes would be exposed
- severity logic has not been reviewed
- capacity estimates are unverified

## Buildability Impact

Suggested categories:

- `none`
- `minor`
- `moderate`
- `major`
- `severe`
- `unknown`

Buildability impact should be descriptive and review-oriented. It should not be
treated as an approval decision.

## Why This Is Not Forecasting

Constraint scoring summarizes current known conditions. It does not forecast
future demand, school enrollment, flood probability, permit volume, or
development outcomes.

Forecasting should wait until:

- source data is governed and versioned
- deterministic overlays are validated
- historical outcomes can be linked to parcel and permit records
- data owners approve model assumptions
- confidence and uncertainty can be shown clearly
