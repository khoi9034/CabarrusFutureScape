# CFS Technical Architecture Summary

## Overview

Cabarrus FutureScape is a local full-stack planning intelligence prototype. It
uses a Next.js frontend, FastAPI backend, PostGIS database, ArcGIS Maps SDK
SceneView, and Python data pipelines.

## Local Runtime

- Frontend: `http://localhost:3000`
- Backend: `http://127.0.0.1:8000`
- FastAPI docs: `http://127.0.0.1:8000/docs`
- Health: `http://127.0.0.1:8000/health`
- Database health: `http://127.0.0.1:8000/health/database`
- PostGIS likely local development host: `localhost`
- PostGIS likely local development port: `5433`
- PostGIS likely database: `cfs_dev`

No passwords or secrets are documented here.

## Next.js Frontend

The frontend provides:

- dark executive dashboard shell;
- top parcel search;
- Overview, Due Diligence, Methodology, and Executive Print modes;
- API clients and hooks for parcel, development, flood, school,
  transportation, and model summary data;
- selected parcel state and map focus wiring;
- safety wording that prevents parcel-level prediction exposure.

## FastAPI Backend

The backend provides local REST endpoints for:

- parcel search and parcel detail;
- development activity and hotspots;
- new construction permit summaries;
- flood constraints and FEMA zones;
- school assignment and utilization seed summaries;
- transportation accessibility summaries;
- aggregate model governance and ranking summary endpoints.

Allowed aggregate model endpoints include:

- `/development/prediction/features/summary`
- `/development/prediction/ranking/summary`

No public parcel-level prediction endpoint should be added without governance
approval.

## PostGIS Database

PostGIS stores parcel, zoning, permit, flood, school, transportation,
planning/utility proxy, and model research tables. The project uses spatial
overlay and parcel-level joins to create due diligence and feature outputs.

PostGIS schemas should not be modified during demo/handoff work.

## ArcGIS Maps SDK / SceneView

The SceneView provides:

- Cabarrus County operating context;
- selected parcel focus and cage/boundary highlight;
- live overlay layers such as Development Hotspots, Flood Constraints, FEMA
  Flood Zones, and School Utilization Seed;
- click-to-select workflows for supported layer markers.

## Parcel-Centric Data Model

CFS treats the parcel as the common review unit. Parcel ID ties together:

- zoning;
- permit history;
- flood overlay;
- school assignment;
- transportation and utility context;
- due diligence report sections;
- internal model feature rows.

## Ingestion Pipelines

Python scripts under `cfs-data-pipelines/` handle:

- source inspection;
- ingestion;
- transformation;
- validation outputs;
- feature matrix creation;
- internal model experiments and QA.

Current handoff work does not rebuild these pipelines.

## Feature Matrices and Model Governance Outputs

CFS includes internal feature matrices and model research outputs for new
construction permit outcomes. The current best internal research variant is
Zoning + Transportation + Tax/Value.

Safety flags remain:

- `model_active=false`
- `prediction_probability_available=false`
- `production_ready=false`
- `public_exposure_allowed=false`

## Safety Guardrails

- Do not expose parcel-level prediction probabilities.
- Do not expose parcel-level ranking classes.
- Do not add public parcel prediction endpoints.
- Do not describe the model as production-ready.
- Keep Methodology as the aggregate model transparency workspace.
- Keep school utilization and utility capacity caveats visible.
