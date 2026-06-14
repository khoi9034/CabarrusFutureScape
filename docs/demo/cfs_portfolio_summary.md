# Cabarrus FutureScape Portfolio Summary

## Project Title

Cabarrus FutureScape: Parcel-Based Planning Intelligence and Constraint Review Prototype

## Problem

County planning review requires analysts to connect parcels, zoning, permit history, flood constraints, school assignments, and development activity across multiple systems. Those workflows can be slow, hard to explain, and difficult to present to stakeholders. CFS prototypes a unified planning intelligence workspace that makes parcel due diligence and constraint review easier to inspect.

## Data Sources

- Parcel and assessor-derived parcel intelligence.
- Zoning context and historical zoning source inventory.
- Permit/development activity with permit-to-parcel relationships.
- New construction permit labels for internal model research.
- FEMA NFHL flood hazard zones and parcel flood overlay.
- CCS public school attendance-zone assignment.
- Presentation-derived SY 2024-2025 school utilization seed values.
- Internal model QA and ranking research aggregates.

## Technical Stack

- Next.js and React frontend.
- TypeScript component and API-client layer.
- ArcGIS SceneView for 3D map exploration.
- FastAPI backend.
- PostGIS database.
- Python data pipelines for ingestion, transformation, QA, and model research.
- Local full-stack launcher through `npm run dev:cfs`.

## Key Workflows

- Search a parcel by parcel ID, PIN, owner, address, subdivision, or neighborhood.
- Focus the 3D map on the selected parcel and display a selected parcel cage.
- Review selected parcel due diligence: parcel characteristics, zoning context, flood constraints, development activity, permit events, and school assignment.
- Toggle live map overlays for Development Hotspots, Flood Constraints, FEMA Flood Zones, and School Utilization Seed.
- Review Methodology for data inputs, assumptions, limitations, and model safety boundaries.
- Use Executive Print mode as a stakeholder-facing report preview.

## Model Work

CFS includes internal development ranking research using time-safe features and zoning-enhanced model comparison. The research is intentionally not production-facing. The UI shows aggregate model status, safety flags, and class distribution only.

The model work does not expose:

- exact parcel probabilities;
- parcel-level ranking classes;
- public prediction endpoints;
- production-ready claims.

## Responsible AI and Governance

CFS treats model research as internal QA. It separates descriptive evidence from predictive claims and clearly labels limitations:

- prediction probabilities are not available;
- model calibration remains weak;
- school capacity data is not official yet;
- school utilization is presentation-derived and needs verification;
- planning decisions remain human-reviewed.

## Impact

The prototype demonstrates how a county planning team could move from scattered records to a transparent parcel intelligence workflow. It supports faster parcel review, clearer map-based communication, and better documentation of caveats before any model signal is considered.

## Future Work

- Verified school capacity/enrollment ingestion.
- Transportation and utility readiness overlays.
- Official rezoning case history and future land use.
- Additional environmental and public safety constraints.
- Model calibration and governance review.
- Production deployment and reporting/export hardening.
