# CFS Prototype Release Candidate Notes

## Current Scope

Cabarrus FutureScape is a local, FastAPI-backed planning intelligence
prototype for parcel due diligence and countywide growth review. The release
candidate supports:

- parcel search by parcel ID, PIN, owner, address, subdivision, and
  neighborhood;
- selected parcel due diligence with ownership, zoning, valuation, quality, and
  governance context;
- selected parcel map focus and 3D parcel cage highlight;
- permit and development activity intelligence;
- selected parcel permit events;
- permit segmentation and Development Hotspots;
- FEMA NFHL flood constraints and FEMA Flood Zones;
- public CCS school attendance-zone assignment;
- presentation-derived school utilization seed display;
- Executive Print report mode;
- Methodology transparency for data sources, assumptions, limitations, and
  internal model research.

## Real Data in the Prototype

The following CFS surfaces are backed by local FastAPI/PostGIS data:

- parcel detail and parcel search;
- zoning assignment and governance warning context;
- real property permit activity and parcel permit events;
- permit segmentation summaries;
- FEMA NFHL Layer 28 flood zone ingestion and parcel overlay;
- FEMA Flood Zones visualization;
- school attendance-zone parcel assignment for CFS V1 public CCS scope;
- new construction permit label and internal model feature summaries.

## Presentation-Derived Data

School utilization is a temporary seed from SY 2024-2025 planning presentation
maps. It is useful for display and workflow testing, but it is not official
school capacity data.

Important caveats:

- utilization values need verification;
- functional capacity is not populated from this seed;
- enrollment is not populated from this seed;
- available seats are not calculated from this seed;
- school capacity scoring remains disabled.

## Internal-Only Model Research

Development prediction work is internal research only. The Methodology
workspace shows aggregate model transparency, not parcel-level predictions.

Current guardrails:

- `model_active=false`;
- `prediction_probability_available=false`;
- `production_ready=false`;
- `public_exposure_allowed=false`;
- no parcel-level prediction endpoint exists;
- no exact probabilities are shown in the frontend;
- no parcel-level ranking classes are shown in the frontend.

The internal ranking research uses the zoning-enhanced experiment
`phase10e_zoning_enhanced_v1`. It improved internal ranking metrics, but
probability calibration remains weak. Treat it as model QA, not a public
forecast.

## Placeholder and Mock-Readiness Elements

Some UI controls remain prototype placeholders for future enterprise services:

- Infrastructure Readiness;
- Opportunity Extrusions;
- Development Pressure;
- Scenario Envelope;
- internal registry and future service readiness notes.

These should be described as placeholders or readiness concepts during demos,
not as complete authoritative layers.

## Release Candidate Health

Expected local runtime:

- frontend: `http://localhost:3000`;
- backend: `http://127.0.0.1:8000`;
- FastAPI docs: `http://127.0.0.1:8000/docs`;
- service health: `GET /health`;
- database health: `GET /health/database`.

The demo should be run with:

```powershell
npm run dev:cfs
```

The launcher should confirm frontend, backend, parcel, development, flood, and
school endpoints before the demo begins.

## Demo Readiness Decision

The prototype is ready for portfolio and stakeholder demonstration as a local
release candidate, with clear caveats:

- do not present the internal development ranking research as production;
- do not present school utilization as official capacity;
- do not present placeholder infrastructure/readiness layers as authoritative;
- keep demo emphasis on parcel due diligence, real overlays, model
  transparency, and the future data roadmap.
