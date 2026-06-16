# CFS Seven-Minute Technical Demo Script

## 1. Opening

Cabarrus FutureScape is a parcel-centric planning intelligence prototype. It
uses parcels as the common object that connects zoning, permits, flood,
schools, transportation, utility context, and model governance.

The current release candidate is local and demo-safe. It is not a production
decision engine and does not expose parcel-level predictions.

## 2. Architecture Overview

The frontend is built with Next.js, React, and TypeScript. ArcGIS Maps SDK
SceneView provides the 3D map workspace. The backend is FastAPI, and the
spatial data lives in PostGIS. Python pipeline scripts handle ingestion,
transformation, QA outputs, and internal model research.

The local launcher is:

```powershell
npm run dev:cfs
```

That starts:

- Next.js at `http://localhost:3000`;
- FastAPI at `http://127.0.0.1:8000`;
- API health and database checks before demo use.

## 3. Parcel-Centric Design

The selected parcel is the central state. Search, map focus, Due Diligence,
Executive Print, permit events, flood context, school context, and
transportation context all key off the selected parcel.

The demo parcel is:

- `CFS-PARCEL-0149726579`

The top search calls parcel search, then selected parcel hydration calls parcel
detail with geometry so the map can focus and draw the selected parcel
cage/boundary.

## 4. Data Domains

CFS currently brings together:

- parcel and assessor-derived parcel context;
- current zoning and historical zoning research layers;
- permit and development activity;
- new construction permit labels for internal research;
- FEMA NFHL flood constraints and FEMA source polygons;
- public CCS attendance-zone school assignment;
- presentation-derived school utilization seed values;
- transportation accessibility, STIP, and AADT context;
- utility proxy context;
- model QA and governance outputs.

Each domain is caveated according to its source quality. For example, school
utilization is presentation-derived and utility context is proxy-only.

## 5. Due Diligence Workflow

Due Diligence is structured as a professional review memo:

1. Parcel Snapshot
2. High-Priority Review Flags
3. Planning and Zoning
4. Development Activity
5. New Construction History
6. Flood Constraints
7. School Context
8. Transportation Context
9. Utility / Infrastructure Context
10. Model Research Status
11. Recommended Review Actions

The goal is to help staff review the parcel without mixing verified evidence,
proxy context, and internal research.

## 6. Executive Print

Executive Print is a report-preview surface. It creates a planning memo style
summary with a header, parcel snapshot, key findings, review flags, domain
sections, caveats, and recommended follow-up actions.

It is not a final production export engine yet, but it demonstrates how CFS can
move from interactive review to stakeholder communication.

## 7. Model Governance

CFS has internal development model research. The current best internal variant
is:

- Zoning + Transportation + Tax/Value

The model research remains internal-only because calibration and governance
review are not complete.

CFS does not expose:

- exact parcel-level probabilities;
- parcel-level ranking classes;
- public parcel prediction endpoints;
- production-ready model wording.

Methodology is the only place where aggregate model status and governance
language appear.

## 8. Guardrails

Current guardrails:

- `model_active=false`
- `prediction_probability_available=false`
- `production_ready=false`
- `public_exposure_allowed=false`

The frontend should never show parcel-level prediction probability or ranking
class language.

## 9. Current Limitations

- School capacity and enrollment are not official yet.
- School utilization seed values require verification.
- Utility layers are proxy-only and do not confirm capacity.
- Historical zoning changes are map-change detections, not official rezoning
  case approvals.
- Some transportation features are current-context only.
- Model calibration remains under review.

## 10. Next Data Needed

The highest-value next data includes:

- official rezoning case records;
- official school enrollment and functional capacity;
- future land use / small area plans with dates;
- utility capacity and allocation data;
- dated transportation project data;
- subdivision and development pipeline records.

## 11. Close

Technically, CFS demonstrates a full-stack planning intelligence pattern:
PostGIS and FastAPI for data services, Next.js for the application shell,
ArcGIS SceneView for spatial interaction, and explicit methodology/governance
for responsible model research.
