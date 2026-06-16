# Cabarrus FutureScape Portfolio Case Study

## Project Overview

Cabarrus FutureScape (CFS) is a full-stack planning intelligence prototype for
parcel-level due diligence and constraint review in Cabarrus County. The system
combines GIS, parcel records, permits, zoning, flood, school, transportation,
utility proxy, and model-governance context into a local executive dashboard.

The project is designed as an internal planning prototype, not a public
decision engine.

## Problem

Planning review depends on many disconnected sources: parcel records, zoning
layers, permit data, flood maps, school assignments, transportation context, and
planning documents. When those sources are separated, staff must spend more time
assembling evidence and less time interpreting it.

CFS explores a parcel-centered workflow for answering:

- What is happening on or near this parcel?
- What constraints and caveats matter?
- What evidence should staff review before making a planning recommendation?

## My Role

I built and coordinated the prototype across frontend, backend, spatial data,
pipeline, model-governance, and documentation layers. Work included:

- designing the parcel due diligence workflow;
- wiring FastAPI endpoints into a Next.js/TypeScript frontend;
- building ArcGIS SceneView overlay interactions;
- creating PostGIS-backed spatial overlay outputs;
- documenting model safety and data limitations;
- packaging demo, handoff, and leadership materials.

## Technical Stack

- Next.js, React, and TypeScript for the frontend.
- ArcGIS Maps SDK SceneView for 3D map exploration.
- FastAPI for local API endpoints.
- PostGIS for spatial storage, overlay, and parcel-level joins.
- Python data pipelines for ingestion, transformation, QA, and model research.
- Local full-stack launcher through `npm run dev:cfs`.

## Data Integrated

CFS integrates or inventories:

- about 110,017 parcels;
- permit and new construction context;
- current and historical zoning source context;
- FEMA NFHL flood constraints and FEMA flood zone polygons;
- public CCS attendance-zone school assignment;
- presentation-derived SY 2024-2025 school utilization seed values;
- transportation accessibility, STIP, and AADT context;
- utility and infrastructure proxy context;
- internal model QA and governance outputs.

The modeling feature work includes about 1,430,221 parcel-year feature rows from
earlier development prediction research phases.

## System Architecture

CFS uses a parcel ID as the common join key across the system. The frontend
requests parcel search/detail data, the backend retrieves and summarizes
PostGIS-backed context, and the SceneView renders selected parcel focus plus
optional overlays.

The core architecture is:

- frontend workspace: Overview, Due Diligence, Methodology, Executive Print;
- API layer: parcel, development, flood, school, transportation, and aggregate
  model-governance endpoints;
- database layer: spatial tables and summary tables in PostGIS;
- pipeline layer: repeatable source inspection, ingest, transform, QA, and
  model-research scripts.

## Parcel Due Diligence Workflow

The user searches for a parcel, selects a result, and sees the map focus on the
selected parcel. The Due Diligence view organizes the review into:

- parcel snapshot;
- high-priority review flags;
- planning and zoning;
- development activity;
- new construction history;
- flood constraints;
- school context;
- transportation context;
- utility/infrastructure context;
- model research status;
- recommended review actions.

This keeps the workflow focused on evidence and caveats rather than scattered
technical metrics.

## Executive Print / Reporting

Executive Print converts the selected parcel review into a planning memo-style
report preview. It is intended for stakeholder conversation and internal review,
not as a final legal or regulatory determination.

The print view emphasizes:

- selected parcel identity;
- key findings;
- review flags;
- limitations and caveats;
- recommended next review actions.

## Model Research And Governance

CFS includes internal development model research based on new construction
permit outcomes and parcel/context features. The current best internal research
variant is Zoning + Transportation + Tax/Value.

The model is intentionally not production-ready:

- exact parcel-level probabilities are not exposed;
- parcel-level ranking classes are not exposed;
- no public prediction endpoint exists;
- Methodology shows aggregate governance status only.

This separation makes the prototype useful for responsible model discussion
without turning research outputs into decision outputs.

## Safety / Ethics / Caveats

CFS explicitly separates verified data, presentation-derived data, proxy
context, and internal model research.

Important caveats:

- school utilization values are presentation-derived and need verification;
- official school capacity scoring is not active;
- utility context is proxy-only and does not confirm available capacity;
- FEMA NFHL remains the regulatory flood source;
- model research is aggregate-only and not public-facing;
- planning decisions remain human-reviewed.

## Results

The prototype now supports:

- parcel search and selected parcel map focus;
- selected parcel due diligence review;
- 3D map overlays for flood, development, and school utilization context;
- Executive Print report preview;
- Methodology transparency;
- leadership, handoff, portfolio, and demo documentation.

Latest demo evidence includes 9 captured screenshots and a completed dry run
showing the Overview, selected parcel workflow, Due Diligence, Executive Print,
and Methodology modes.

## What I Learned

This project reinforced that planning intelligence is as much about clarity and
governance as it is about data volume. A useful tool needs to show what is
known, what is missing, what is provisional, and what should not be claimed.

Technically, the project required coordinating GIS geometry, API contracts,
frontend state, map rendering, model QA, and executive communication into one
coherent workflow.

## Next Steps

Recommended next improvements:

- verify official school capacity and enrollment data;
- acquire true utility capacity/service availability data;
- add official rezoning case dates and future land use GIS;
- validate the due diligence workflow with planning and GIS staff;
- continue model calibration and governance before any public-facing model use.
