# Cabarrus FutureScape Executive One-Pager

## Project Name

Cabarrus FutureScape (CFS)

## One-Sentence Summary

CFS is an internal parcel-based planning intelligence prototype that brings
property, zoning, permits, flood, school, transportation, utility proxy, and
model-governance context into one due diligence workspace.

## Problem

Parcel review often requires staff to move between GIS layers, public records,
permit systems, spreadsheets, and planning documents. That makes it harder to
answer basic leadership questions quickly:

- What do we know about this parcel?
- What constraints apply?
- What development activity exists nearby?
- What should staff review next?

## Solution

CFS organizes local planning evidence around the parcel. A user can search for a
parcel, focus the 3D map, review due diligence context, toggle real constraint
layers, and generate an Executive Print report for discussion.

## What CFS Can Do Today

- Search and select parcels by parcel ID, PIN, owner, address, subdivision, or
  neighborhood.
- Focus the map on the selected parcel with a visible parcel cage/highlight.
- Review zoning, development activity, permit history, flood constraints,
  school assignment, transportation context, and utility proxy context.
- Display FEMA flood constraints and FEMA flood zone polygons.
- Show school assignment and presentation-derived utilization caveats.
- Produce a stakeholder-friendly Executive Print report preview.
- Explain data sources, assumptions, limitations, and model safety in
  Methodology.

## Data Domains Integrated

- Parcels and assessor-derived parcel context.
- Current and historical zoning source context.
- Development activity and permit intelligence.
- New construction permit labels for internal model research.
- FEMA NFHL flood constraints and local flood reference context.
- Public CCS school attendance-zone assignments.
- Presentation-derived SY 2024-2025 school utilization seed values.
- Transportation accessibility, STIP, and AADT context.
- Utility and infrastructure proxy context.
- Internal model QA, feature governance, and readiness metadata.

## Current Model Status

The current best internal model research variant is Zoning + Transportation +
Tax/Value.

This remains internal research only:

- `model_active=false`
- `prediction_probability_available=false`
- `production_ready=false`
- `public_exposure_allowed=false`
- no parcel-level prediction probability is shown
- no parcel-level ranking class is shown
- no public parcel-level prediction endpoint exists

## Key Limitations

- CFS is not production-ready.
- Model probabilities are not exposed because calibration remains under review.
- School utilization is presentation-derived and needs verification against
  official enrollment/capacity data.
- Utility context is proxy-only and does not confirm service capacity.
- Planning and development pipeline data needs broader official coverage.
- Current model research should not be used for public decisions or entitlement
  decisions.

## Recommended Next Steps

1. Review the prototype with planning, GIS, and leadership stakeholders.
2. Prioritize official data requests for school capacity, utility capacity,
   rezoning cases, future land use, and development pipeline records.
3. Validate the due diligence workflow with staff using real review scenarios.
4. Continue model governance only after data gaps and calibration issues are
   addressed.
5. Decide whether CFS should become an internal operational tool, a portfolio
   prototype, or both.

## Value To Cabarrus County

CFS demonstrates how Cabarrus County could reduce parcel review friction, make
constraint evidence easier to explain, improve handoff between GIS and planning
staff, and create a transparent foundation for future data-informed planning
tools without overclaiming model readiness.
