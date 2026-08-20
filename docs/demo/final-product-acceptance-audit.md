# Final Product Acceptance Audit

> **Retired historical reference:** The Investments product and CASE-1 workflow are retired and are not part of the active Demo, Local, Enterprise, acceptance, or deployment surface. This document is retained only as historical design or evidence and must not be used as an operating runbook.

Date: 2026-07-27
Production audited: https://cabarrus-future-scape.vercel.app
Production commit audited before fixes: 2574fdc55027c9ca49923c6fc1be4842e62745f2

## Inventory Basis

Inventory count: 1,161 visible control instances across the audited production states below.

Repeated global chrome is counted in each audited state where it is visible and usable. ArcGIS embedded map controls are counted as visible embedded-map controls; one unlabeled embedded ArcGIS application node is treated as an external-map accessibility limitation, not an app-owned silent control.

| Product | State | Visible controls | Status |
| --- | ---: | ---: | --- |
| Master Home | Clean first visit | 3 | Fix |
| CFS Planning | Selected parcel workspace | 25 | Pass |
| CFS Planning | Layers expanded | 51 | Pass |
| CFS Planning | Indicator Center | 112 | Pass |
| CFS Planning | Model Lab entry | 27 | Pass |
| CFS Planning | Planning Snapshot | 39 | Pass |
| CFS Economics | Dashboard | 29 | Pass |
| CFS Economics | Power BI & Tools | 48 | Pass |
| CFS Economics | Advanced Scenario Model | 84 | Intentional limitation |
| CFS Economics | Print | 25 | Pass |
| CFS Investments | Projects | 25 | Fix |
| CASE-1 | Define | 34 | Pass |
| CASE-1 | Screen | 36 | Pass |
| CASE-1 | Shortlist | 44 | Pass |
| CASE-1 | Analyze | 33 | Pass |
| CASE-1 | Underwrite | 33 | Pass |
| CASE-1 | Review Assumptions panel | 34 | Pass |
| CASE-1 | Decide | 32 | Fix |
| CASE-1 | Deliver | 43 | Pass |
| CASE-1 | Deliver artifact panels 0-8 | 404 | Pass / Intentional limitation |

## Findings Fixed

- Master Home now states that this is a portfolio demonstration using sanitized, cached public demo data where applicable.
- Investments no longer exposes `CFS Consulting` as the primary user-facing product name.
- CASE-1 Decide now states `Targeted diligence only`, `Do not advance to acquisition pricing yet`, and `No current scenario supports a positive land basis`.

## Intentional Limitations

- CFS Economics advanced scenario controls use development type, intensity band, value-per-acre assumption, burden, utility, transportation, and flood/environmental confidence instead of the old Planning year/intensity sliders.
- The Report Bucket collection deliverable has a review panel but no downloadable artifact; the panel clearly reports that no downloadable artifact is registered.
- CASE invalid-step URLs fall back to a usable CASE state rather than rewriting the stale query parameter immediately.
- Browser Tab traversal could not be completed through the in-app browser keypress bridge; semantic controls, labels, Enter search activation, Back, Forward, and Escape map-focus recovery were covered separately.
