# Permit Segmentation and Prediction Readiness

## Purpose

The CFS permit intelligence segmentation layer converts raw Real Property Permit
records into transparent, auditable development-activity signals. It supports
dashboard interpretation, parcel screening, map relevance, and future modeling
readiness without claiming to predict future growth.

## Current Boundary

This layer is descriptive only.

It does not:

- train a model
- calculate prediction probabilities
- expose prediction scores in the frontend
- use random train/test splits
- forecast parcel growth
- change existing permit, parcel, flood, or development tables

The `permit_signal_score` is a 0-100 operational signal score based on rules,
permit value, status, and segment type. It is not a probability.

## Source Tables

Primary:

- `public.real_property_permit_clean`

Supporting:

- `public.real_property_permit_parcel_relationship`

Generated:

- `public.permit_intelligence_segments`
- `public.parcel_permit_segment_summary`

## Permit-Level Segmentation

Every permit receives:

- `permit_segment`
- `permit_growth_signal`
- `development_domain`
- `permit_value_class`
- `permit_status_stage`
- boolean planning flags
- `permit_signal_score`

Allowed segments:

- `residential_growth`
- `commercial_activity`
- `industrial_activity`
- `institutional_activity`
- `redevelopment_signal`
- `minor_maintenance`
- `accessory_or_misc`
- `demolition`
- `administrative_or_unknown`

Classification priority:

1. demolition
2. major new growth
3. redevelopment signal
4. commercial / residential / industrial / institutional activity
5. minor maintenance
6. accessory or miscellaneous
7. administrative or unknown

## Parcel-Level Summary

`public.parcel_permit_segment_summary` rolls matched permit segments up by
parcel. It includes counts by segment, active/completed counts, high/major value
counts, total permit amount, permit date range, dominant segment, dominant
growth signal, signal score max/average, and `current_activity_status`.

Current activity status values:

- `active_construction`
- `recently_issued`
- `completed_historical`
- `no_recent_activity`
- `unknown`

## API and Dashboard Visibility

Permit segmentation is now visible through read-only FastAPI endpoints and the
dashboard. This makes segmentation useful for parcel screening and map
filtering without turning it into a prediction system.

Backend endpoints:

- `GET /development/permit-segments/statistics`
- `GET /development/permit-segments/options`
- `GET /development/permit-segments/{official_parcel_id}`
- `GET /development/parcel/{official_parcel_id}/permits`
- `GET /development/hotspots`

The permit event endpoint now includes permit-level segmentation fields:

- `permit_segment`
- `permit_growth_signal`
- `development_domain`
- `permit_status_stage`
- `permit_value_class`
- `permit_signal_score`

The hotspot endpoint supports segment-aware filters:

- `permit_segment`
- `growth_signal`
- `permit_status_stage`
- `permit_value_class`
- `development_domain`

Dashboard surfaces:

- `Permit Intelligence Segments` panel in the Development Activity section.
- selected parcel segment summary in the selected parcel development activity
  card.
- segment badges in the selected parcel permit event list.
- segment-aware Development Hotspot controls and legend/help text.

This changes the dashboard language from raw permit volume alone to meaningful
permit intelligence categories such as residential growth, commercial activity,
redevelopment signal, minor maintenance, demolition, active construction,
completed activity, and high/major value permits.

## Why Prediction Should Wait

Prediction is premature until CFS completes the following:

- auditable segmentation QA
- stable parcel-permit relationships
- flood, school, transportation, utility, and emergency-service constraint
  overlays
- temporal holdout validation by year
- leakage checks that ensure future permit outcomes do not enter historical
  feature windows
- stakeholder review of target definitions, such as "major growth",
  "redevelopment", and "development pressure"

The correct next step is to use segmentation as a descriptive intelligence
layer, then design a temporal modeling experiment only after the data contracts
and validation windows are stable.

## Future Modeling Readiness

When CFS is ready for modeling, recommended safeguards include:

- train on historical years and validate on later years
- avoid random splits because permit activity is temporal and spatial
- separate label windows from feature windows
- track model performance by jurisdiction, zoning category, and constraint
  class
- expose model outputs only with clear uncertainty and governance language

Until those safeguards are in place, CFS should present permit segmentation as
observed intelligence, not prediction.
