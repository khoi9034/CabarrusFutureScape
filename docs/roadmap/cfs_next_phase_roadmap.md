# CFS Next Phase Roadmap

This roadmap keeps public model exposure locked down until official data,
validation, and governance improve.

## Phase 1 — Demo / Handoff Stabilization

- Goal: Preserve the current demo-ready state and make it easy for leadership
  or supervisors to understand.
- Work needed: Commit/checkpoint the demo package, review presentation docs,
  gather stakeholder feedback, and keep local startup reliable.
- Data needed: No new data.
- Risk level: Low.
- Expected value: A stable handoff package for portfolio, supervisor, and
  internal planning/GIS review.

## Phase 2 — Official Missing Data Ingestion

- Goal: Replace proxy or presentation-derived context with official data where
  possible.
- Work needed: Ingest official school capacity/enrollment, utility capacity,
  future land use, rezoning cases, transportation projects, and development
  pipeline records after source access is confirmed.
- Data needed: Priority 1 and 2 datasets from
  `docs/data_requests/cfs_next_data_request_packet.md`.
- Risk level: Medium.
- Expected value: Stronger due diligence evidence and fewer caveats.

## Phase 3 — Refined Parcel Suitability Scoring

- Goal: Create transparent, non-predictive parcel suitability/review scoring
  based on vetted constraints and planning context.
- Work needed: Define scoring rules, separate regulatory constraints from
  planning context, document weights, add QA outputs, and keep score caveats
  visible.
- Data needed: Official constraints, future land use, utility readiness, school
  capacity, and transportation project context.
- Risk level: Medium.
- Expected value: More consistent staff review triage without claiming
  prediction.

## Phase 4 — Validated Internal Model

- Goal: Improve internal model research after official time-aware features are
  available.
- Work needed: Rebuild feature matrices with vetted data, audit leakage,
  rerun model comparisons, improve calibration, and update model governance.
- Data needed: Official dated rezoning cases, future land use adoption dates,
  school capacity/enrollment, utility capacity, transportation project dates,
  and development pipeline records.
- Risk level: High.
- Expected value: Better internal ranking research and clearer governance
  decisions.

## Phase 5 — Scenario Planning / Executive Reports

- Goal: Expand executive reporting and scenario planning after core data
  confidence improves.
- Work needed: Add scenario assumptions, report templates, staff notes,
  export/versioning, and executive comparison views.
- Data needed: Validated planning, infrastructure, and constraint inputs.
- Risk level: Medium.
- Expected value: Better manager-facing communication and planning discussion.

## Phase 6 — Optional Public-Facing Simplified Viewer

- Goal: Consider a simplified public viewer only after governance and data
  policy decisions are complete.
- Work needed: Define public-safe data, remove internal-only model outputs,
  security review, accessibility review, hosting/deployment planning, and
  communications review.
- Data needed: Public-approved layers only.
- Risk level: High.
- Expected value: Public transparency, if leadership determines it is
  appropriate.

## Model Exposure Guardrail

Do not expose parcel-level prediction probabilities, parcel-level ranking
classes, or public prediction endpoints until:

- official missing data is ingested and QA'd;
- model calibration improves;
- governance review is complete;
- leadership approves a public communication strategy.
