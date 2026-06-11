# Permit Intelligence Segmentation

This module creates an interpretable permit segmentation layer for CFS V1. It
classifies observed permit records into planning-friendly segments and rolls
those permit signals up to parcels.

This is not a prediction model. It does not train, infer, or expose future
development probabilities. It creates transparent readiness features that can
support future modeling only after the permit labels, parcel relationships,
constraints, and temporal validation strategy are stable.

## Inputs

Primary input:

- `public.real_property_permit_clean`

Supporting input:

- `public.real_property_permit_parcel_relationship`

## Outputs

PostGIS tables:

- `public.permit_intelligence_segments`
- `public.parcel_permit_segment_summary`

Validation and summary files:

- `outputs/permit_segmentation_validation.json`
- `outputs/permit_segment_summary.csv`
- `outputs/permit_growth_signal_summary.csv`
- `outputs/permit_status_stage_summary.csv`
- `outputs/permit_value_class_summary.csv`
- `outputs/permit_segment_by_year_summary.csv`
- `outputs/permit_segment_examples.csv`
- `outputs/parcel_permit_segment_summary_validation.json`
- `outputs/parcel_permit_segment_top_residential_growth.csv`
- `outputs/parcel_permit_segment_top_commercial_activity.csv`
- `outputs/parcel_permit_segment_top_redevelopment_signal.csv`
- `outputs/parcel_permit_segment_top_major_value.csv`
- `outputs/permit_intelligence_segmentation_summary.json`

Current materialized result:

- Permit source rows: `64,426`
- Permit segment rows: `64,426`
- Unique permit IDs: `64,426`
- Parcel permit segment summary rows: `43,474`
- Segment row count matches source row count: `true`
- Parcel summary rows match matched parcels with permit activity: `true`

Top permit-level segments:

- `residential_growth`: `42,206`
- `redevelopment_signal`: `7,866`
- `administrative_or_unknown`: `5,792`
- `commercial_activity`: `2,993`
- `accessory_or_misc`: `2,251`
- `minor_maintenance`: `1,866`
- `demolition`: `1,421`

Parcel summary permit totals can exceed the permit source row count where the
relationship model preserves multiple parcel matches. The parcel table still
contains exactly one row per matched parcel with permit activity.

## Rule Configuration

Rules live in `permit_segmentation_rules.yaml`. The YAML controls:

- allowed output values
- permit type, work type, note, and keyword rules
- value thresholds
- status mappings
- segment priority
- scoring weights
- map relevance flags
- future prediction-readiness flags

The generated `permit_signal_score` is a 0-100 operational signal score. It is
not a probability and should not be shown as a predictive confidence.

## Run

From the repository root:

```powershell
$env:CFS_POSTGRES_PASSWORD = "your-local-password"
python models\permit_intelligence\classify_permit_segments.py
python models\permit_intelligence\create_parcel_permit_segment_summary.py
```

Optional validation-only runs:

```powershell
python models\permit_intelligence\classify_permit_segments.py --skip-table
python models\permit_intelligence\create_parcel_permit_segment_summary.py --skip-table
```

## Interpretation

Permit segments are designed for executive and planning interpretation:

- `residential_growth`: residential construction, additions, modular or
  manufactured-home activity.
- `commercial_activity`: commercial construction, additions, upfits, signs,
  shell work, and commercial repair.
- `industrial_activity`: warehouse, manufacturing, distribution, and industrial
  activity when detectable from permit fields.
- `institutional_activity`: school, church, hospital, civic, medical, or
  government/institutional activity.
- `redevelopment_signal`: remodels, upfits, alterations, moved structures, and
  change-of-use signals.
- `minor_maintenance`: repair, replacement, utility, wall, sign, and similar
  lower-intensity maintenance.
- `accessory_or_misc`: pools, decks, outbuildings, accessory structures, and
  extra features.
- `demolition`: demolition/removal activity.
- `administrative_or_unknown`: records that cannot be responsibly classified.

## Prediction Readiness Boundary

Future prediction should wait until CFS has:

- stable permit labels and audited segmentation rules
- reliable parcel relationship joins
- constraint overlays such as flood, school, utilities, and transportation
- temporal backtesting by year
- leakage controls that prevent future permits from influencing historical
  training windows
- stakeholder review of what "growth" means operationally

Until then, this module is a descriptive intelligence layer.
