# Missing Feature Groups Roadmap

Phase 14A identifies the highest-value planning datasets that should be
requested before CFS expands model research. These are planned feature groups
only. No feature matrix is changed in this phase.

## Utility Capacity and Service Readiness

Source need: WSACC utility capacity, service-area, basin, and project GIS.

Future features:

- `water_service_area_flag`
- `sewer_service_area_flag`
- `utility_capacity_status`
- `wastewater_basin`
- `capacity_limited_area_flag`
- `planned_utility_extension_within_1_mile`
- `utility_project_year`
- `service_readiness_score`

Model value: Utility capacity and service readiness may explain why some
otherwise attractive parcels remain undeveloped and why others become feasible
after infrastructure investment.

Temporal requirement: Use only service status, capacity status, or project
records known on or before the model snapshot year for strict training.

## Future Land Use and Small-Area Plans

Source need: Countywide or multi-jurisdiction future land use and small-area
plan GIS outside the already-found Concord-only layer.

Future features:

- `future_land_use_category`
- `growth_area_flag`
- `activity_center_flag`
- `employment_area_flag`
- `mixed_use_node_flag`
- `preservation_area_flag`
- `plan_policy_alignment`

Model value: Plan policy context can help distinguish growth-supportive areas
from preservation, rural, or limited-growth areas.

Temporal requirement: Use adopted plan layers and adoption/effective dates.
Draft layers should remain current-context or internal-only.

## Local Transportation Projects

Source need: Local planned road projects, future transportation network,
transportation CIP, widening, extension, and intersection improvement GIS.

Future features:

- `local_project_within_half_mile`
- `local_project_within_1_mile`
- `project_type`
- `project_status`
- `funded_project_flag`
- `expected_year`
- `future_access_improvement_flag`

Model value: Local projects can reveal access improvements not represented in
NCDOT STIP and can make transportation context more time-aware.

Temporal requirement: Project adoption, funding, expected year, and status dates
are required before these features are treated as time-safe.

## Official Rezoning Case Records

Source need: Countywide and municipal official rezoning, map amendment,
conditional zoning, and planning case records.

Future features:

- `official_rezoning_prior_1yr`
- `official_rezoning_prior_3yr`
- `official_rezoning_prior_5yr`
- `approval_date`
- `old_zoning`
- `new_zoning`
- `decision_status`
- `years_since_official_rezoning`

Model value: Official case records can replace or validate map-change
detections and make zoning-change signals more legally and temporally precise.

Temporal requirement: Approval/effective date and decision status are required.
Case creation date alone is not enough.

## Development Pipeline and Subdivision Approvals

Source need: Proposed, in-review, approved, active, and phased development
pipeline and subdivision records.

Future features:

- `approved_subdivision_flag`
- `in_review_development_flag`
- `approved_units_nearby`
- `multifamily_pipeline_flag`
- `project_status`
- `approval_date`
- `expected_buildout_year`

Model value: Pipeline records can detect growth before permits and improve
interpretation of emerging development pressure.

Temporal requirement: Review-stage and approval dates are required. Preliminary
or confidential projects should be excluded or generalized.

## Suitability and Land Supply

Source need: Plan-based suitability, developability, land supply, and
constraint-weighted opportunity layers.

Future features:

- `vacant_land_flag`
- `underbuilt_flag`
- `developable_land_score`
- `septic_suitability`
- `constraint_weighted_land_supply`
- `residential_suitability_score`
- `commercial_suitability_score`
- `industrial_suitability_score`

Model value: Suitability and land supply can help explain opportunity while
accounting for constraints and policy assumptions.

Temporal requirement: Source methodology, adoption/source date, and component
weights are required before scores are modeled.

## Parks, Greenways, and Bike-Ped Amenities

Source need: Planned parks, greenways, trail corridors, bike-ped facilities,
and future public amenity GIS.

Future features:

- `planned_greenway_proximity`
- `park_access_score`
- `trail_corridor_proximity`
- `bike_ped_access_context`
- `open_space_priority_flag`

Model value: Future amenity context may support place-based analysis,
especially for residential and mixed-use planning.

Temporal requirement: Adopted or funded project status and expected year should
be available before strict temporal modeling.

## Recommended Feature Expansion Order

1. Utilities and service readiness.
2. Future land use and small-area plans.
3. Local transportation projects.
4. Official rezoning case records.
5. Development pipeline and subdivision approvals.
6. Suitability and land supply.
7. Parks, greenways, and bike-ped amenities.

## Guardrails

- Do not train a new model from these planned features until sources are
  received and validated.
- Do not use current-context data as historical data.
- Do not infer missing capacity, approvals, dates, or project status.
- Do not expose parcel-level prediction probabilities or rank classes.
