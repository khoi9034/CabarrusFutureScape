# CFS Final Screenshot Plan

Use `http://localhost:3000` for the frontend and demo parcel
`CFS-PARCEL-0149726579`.

Do not claim a screenshot was captured unless the image file exists. If
capturing manually, save files under `docs/demo/screenshots/`.

## 01 Overview Landing

- File name: `01_overview_landing.png`
- What to show: Overview mode, dark executive dashboard, top search, map, and
  clean layer rail.
- Talking point: CFS opens as a parcel-centered planning intelligence
  workspace, not a generic GIS viewer.
- Caveat: Detailed evidence lives in Due Diligence and Methodology.

## 02 Parcel Search Selected

- File name: `02_parcel_search_selected.png`
- What to show: Search for `CFS-PARCEL-0149726579`, selected parcel visible in
  Overview intelligence.
- Talking point: The top search hydrates parcel intelligence from the local
  FastAPI/PostGIS stack.
- Caveat: Local demo mode uses `http://localhost:3000`; avoid
  `http://127.0.0.1:3000`.

## 03 Active Selection Map Focus

- File name: `03_active_selection_map_focus.png`
- What to show: Active Selection overlay with parcel ID, owner/account, zoning,
  and API source.
- Talking point: The map and dashboard stay tied to one selected parcel.
- Caveat: The parcel cage/boundary is a review focus aid, not a final survey
  product.

## 04 Due Diligence Parcel Snapshot

- File name: `04_due_diligence_snapshot.png`
- What to show: Due Diligence mode with Parcel Snapshot and selected parcel
  identity.
- Talking point: Staff can start with a concise parcel memo instead of jumping
  between systems.
- Caveat: Due Diligence summarizes evidence; it does not automate decisions.

## 05 High-Priority Review Flags

- File name: `05_due_diligence_priority_flags.png`
- What to show: High-Priority Review Flags section.
- Talking point: CFS surfaces the review themes staff should inspect first.
- Caveat: Flags guide review; they are not approvals, denials, or final
  determinations.

## 06 Development Activity

- File name: `06_due_diligence_development_activity.png`
- What to show: Development Activity and New Construction History.
- Talking point: Permit history gives staff a grounded activity signal around
  the parcel.
- Caveat: Permit segmentation is descriptive and should not be described as a
  causal model.

## 07 Flood Constraints

- File name: `07_due_diligence_flood_constraints.png`
- What to show: Flood Constraints card and FEMA caveat language.
- Talking point: Flood screening is based on FEMA NFHL parcel overlay
  intelligence.
- Caveat: FEMA is authoritative for regulatory flood context; CFS is a review
  interface, not an engineering determination.

## 08 School Context

- File name: `08_due_diligence_school_context.png`
- What to show: School Assignment / School Context section.
- Talking point: School assignment is based on attendance-zone polygon overlap.
- Caveat: Presentation-derived utilization needs verification; official school
  capacity scoring is not active.

## 09 Transportation Context

- File name: `09_due_diligence_transportation_context.png`
- What to show: Transportation Context section.
- Talking point: Transportation features help staff understand accessibility,
  traffic, and project proximity context.
- Caveat: Current transportation features are context only unless dated project
  or historical source data is available.

## 10 Utility / Infrastructure Context

- File name: `10_due_diligence_utility_context.png`
- What to show: Utility / Infrastructure Context section.
- Talking point: Utility context helps frame questions for service providers.
- Caveat: Utility layers are proxy-only and do not confirm capacity or
  allocation.

## 11 Model Research Status

- File name: `11_due_diligence_model_research_status.png`
- What to show: Model Research Status card or equivalent safety note.
- Talking point: CFS separates descriptive due diligence from internal model
  research.
- Caveat: No parcel-level probability or ranking class is exposed.

## 12 Executive Print Header

- File name: `12_executive_print_header.png`
- What to show: Executive Print header, generated date, selected parcel ID, and
  report badges.
- Talking point: Executive Print creates a report-style review memo surface.
- Caveat: It is a report preview; production export packaging remains future
  work.

## 13 Executive Print Key Findings

- File name: `13_executive_print_key_findings.png`
- What to show: Key Findings and High-Priority Review Flags in Executive Print.
- Talking point: The report carries the same evidence hierarchy into a
  leadership-ready memo.
- Caveat: Findings are review prompts, not automated decisions.

## 14 Executive Print Limitations / Recommended Actions

- File name: `14_executive_print_limitations_actions.png`
- What to show: limitations, caveats, and recommended review actions.
- Talking point: A good planning memo should say what is known and what still
  needs verification.
- Caveat: Model research, school capacity, and utility capacity remain
  intentionally caveated.

## 15 Methodology Current Best Internal Model

- File name: `15_methodology_current_best_internal_model.png`
- What to show: Methodology model status and current best internal model
  governance.
- Talking point: The current best internal model research variant is
  Zoning + Transportation + Tax/Value.
- Caveat: The model remains internal research only and is not production-ready.

## 16 Methodology Feature Governance

- File name: `16_methodology_feature_governance.png`
- What to show: Feature governance, assumptions, limitations, and model safety
  flags.
- Talking point: CFS makes model limitations explicit before any public-facing
  signal is considered.
- Caveat: No parcel-level prediction probabilities or ranking classes should
  appear in screenshots.
