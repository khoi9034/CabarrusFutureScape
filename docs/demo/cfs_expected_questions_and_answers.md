# CFS Expected Questions And Answers

## Is this production-ready?

No. CFS is demo-ready as an internal planning intelligence prototype. It is
useful for showing workflow value, data integration, due diligence structure,
and model-governance direction, but it has not gone through production
deployment, security review, user acceptance testing, or operational support
planning.

## Is this public-facing?

No. The current prototype is intended for internal review and portfolio/demo
discussion. It should not be treated as a public decision tool.

## Does it predict development?

It includes internal development model research, but the public-facing product
does not expose predictions. The model work helps evaluate whether historical
parcel conditions are associated with future new construction permits. It is
not production-ready.

## What is Model Lab?

Model Lab is the UI place where CFS explains internal development model
research. It shows the historical outcome, target, feature rows, current best
internal variant, aggregate metrics, feature groups that helped, feature groups
excluded for now, and missing data needed. It does not show exact parcel
probabilities, parcel-level ranking classes, or official parcel scores.

## Can it show exact probability?

No. Exact parcel-level probabilities are intentionally not shown. Calibration
remains under review, so CFS keeps model outputs aggregate-only and
governance-focused.

## What does the Development Research Signal mean?

It is a relative research band, not a probability. Higher, moderate, lower, and
insufficient-data bands help staff see where parcel context resembles places
where new construction occurred historically. The explanation should always be
read with the driver context and caveat: it is internal research only and not an
official parcel score.

At countywide zoom, Model Lab uses an aggregated research surface so the map is
not overwhelmed by points. As the user zooms in, CFS can show clustered context
and then parcel-scale research markers. The labels still mean relative research
signal only, not a chance of development.

## What data is missing?

The highest-value missing data includes:

- official school enrollment and capacity;
- true utility capacity or service availability;
- official rezoning case records with dates and decisions;
- countywide future land use GIS;
- countywide development pipeline and subdivision approvals;
- dated local transportation projects.

## How does this help planning staff?

It reduces the time needed to assemble parcel context and makes review language
more consistent. Staff can search a parcel, review constraints, understand
activity history, and see caveats in one workflow.

## How does this help GIS staff?

It demonstrates how GIS layers can become operational planning evidence through
API-backed summaries, spatial overlays, layer toggles, and repeatable QA
outputs.

## Why not use the planning/utility features in the model?

Some planning and utility features are current-context only, sparse,
Concord-specific, or proxy-only. Phase 16C ablation showed that the full
planning/pipeline/utility feature group did not improve the ranking objective.
Those features remain useful as planning context, but they need better temporal
coverage and official source data before model use.

## What would make the model stronger?

The model would be stronger with official rezoning case dates, future land use,
dated transportation projects, official school capacity/enrollment, true utility
capacity, economic controls, and additional validation. Better calibration is
also required before any public model signal is considered.

## What is the next practical step?

Run a structured review with planning and GIS staff, then prioritize the next
data request packet. The most practical next step is to validate the due
diligence workflow with real review questions while collecting the official data
needed for stronger future analysis.

## How hard would it be to maintain?

The prototype already has organized frontend components, FastAPI endpoints,
PostGIS tables, pipeline scripts, and documentation. Maintenance would still
require ownership for data refreshes, API uptime, GIS source changes, QA
checks, and user support.

## Can this become an official county tool?

Potentially, yes, but only after production hardening. That would require
security review, deployment planning, data governance, formal QA, user testing,
support ownership, and careful decisions about what model information, if any,
should ever be shown.
