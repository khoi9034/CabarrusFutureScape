# CFS Higher-Up Presentation Outline

This outline is structured as a 10-slide leadership presentation. It is meant
for supervisors, managers, GIS/planning leadership, and portfolio reviewers.

## Slide 1 — Cabarrus FutureScape

- Key message: Cabarrus FutureScape is an internal planning intelligence
  prototype for parcel due diligence, constraint review, and transparent model
  governance.
- Suggested screenshot: `docs/demo/screenshots/01_overview_landing.png`
- Speaker notes: "CFS brings parcel search, map focus, due diligence,
  Executive Print, and Methodology into one local review workspace. It is
  demo-ready, but it is not a public prediction system."

## Slide 2 — The Problem: Planning Data Is Spread Across Many Systems

- Key message: Staff often need to move across parcel systems, GIS layers,
  permit records, flood maps, school data, transportation plans, and local
  knowledge before they can explain one parcel.
- Suggested screenshot: Due Diligence or Methodology overview.
- Speaker notes: "The challenge is not a lack of data. The challenge is that
  the data is fragmented, unevenly caveated, and difficult to explain quickly."

## Slide 3 — The Solution: Parcel-Based Planning Intelligence

- Key message: CFS uses the parcel as the common object and organizes relevant
  evidence around it.
- Suggested screenshot: `docs/demo/screenshots/03_active_selection_map_focus.png`
- Speaker notes: "When staff select a parcel, the map, due diligence panels,
  report preview, and methodology context all stay tied to that same parcel."

## Slide 4 — What CFS Can Do Today

- Key message: CFS can search parcels, focus the map, review due diligence,
  show real constraints, preview a planning memo, and explain model boundaries.
- Suggested screenshot: `docs/demo/screenshots/04_due_diligence_snapshot.png`
- Speaker notes: "The value today is review speed and clarity: parcel snapshot,
  high-priority flags, zoning, permits, flood, school, transportation, utility
  proxy context, and recommended review actions."

## Slide 5 — Live Demo Flow

- Key message: The demo follows a simple story: search, select, review,
  report, explain.
- Suggested screenshot: `docs/demo/screenshots/02_parcel_search_selected.png`
- Speaker notes: "Use `CFS-PARCEL-0149726579`. Start in Overview, search the
  parcel, show Active Selection, open Due Diligence, then Executive Print, then
  Methodology."

## Slide 6 — Data Domains Included

- Key message: CFS already combines parcel, zoning, permits, FEMA flood,
  school assignment, transportation, utility proxy, and model governance
  context.
- Suggested screenshot: `docs/demo/screenshots/06_due_diligence_constraints.png`
- Speaker notes: "Each domain is labeled according to its maturity. FEMA flood
  context is authoritative source-based; school utilization is
  presentation-derived; utility context is proxy-only."

## Slide 7 — Internal Model Research and Safety Guardrails

- Key message: Model work remains aggregate-only and internal. Parcel-level
  probabilities and ranking classes are intentionally not exposed.
- Suggested screenshot: `docs/demo/screenshots/09_methodology_model_governance.png`
- Speaker notes: "The current best internal research variant is Zoning +
  Transportation + Tax/Value. It is useful for governance and QA, not public
  decision-making. Safety flags remain `model_active=false`,
  `prediction_probability_available=false`, `production_ready=false`, and
  `public_exposure_allowed=false`."

## Slide 8 — Known Limitations

- Key message: CFS is honest about missing data and does not overclaim.
- Suggested screenshot: Executive Print caveats or Methodology limitations.
- Speaker notes: "Official school capacity is not loaded. Utility proxy layers
  do not confirm capacity. Historical zoning changes are map-change detections,
  not official rezoning approvals. Some transportation and planning features
  are current-context only."

## Slide 9 — Data Needed Next

- Key message: The next step is not more UI polish; it is official data access
  and governance.
- Suggested screenshot: Data request docs or Methodology data roadmap.
- Speaker notes: "Priority data requests include WSACC true utility capacity,
  official school enrollment/capacity, countywide future land use GIS, and
  official rezoning case records."

## Slide 10 — Recommended Next Phase

- Key message: Move from demo-ready prototype to governed internal planning
  tool by adding official missing data, refining suitability, and validating
  internal model research.
- Suggested screenshot: `docs/demo/screenshots/07_executive_print_header.png`
- Speaker notes: "Recommended next work: stabilize handoff, secure official
  data, add refined parcel suitability scoring, validate the internal model,
  then consider scenario planning and executive reporting. Public model
  exposure remains locked down until validation improves."
