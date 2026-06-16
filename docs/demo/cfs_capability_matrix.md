# CFS Capability Matrix

## Parcel Intelligence

- Current capability: Search, select, focus, and review parcel-level context in
  a unified dashboard.
- Data source basis: Local parcel base, enriched parcel records, zoning context,
  and selected parcel detail APIs.
- Current limitation: Review workflow is local prototype mode; production user
  roles and audit trails are not implemented.
- Next improvement: Add staff review notes, persistent issue tracking, and
  production authentication.

## Zoning / Planning

- Current capability: Shows current zoning context and inventories historical
  zoning sources for time-aware research.
- Data source basis: Cabarrus and municipal zoning services plus historical
  zoning layers.
- Current limitation: Historical zoning map changes are not official rezoning
  case approvals.
- Next improvement: Add official rezoning case records with approval dates,
  old zoning, new zoning, jurisdiction, and decision status.

## Development Activity

- Current capability: Shows development activity, permit events, hotspots, and
  permit segmentation.
- Data source basis: Permit records, permit-to-parcel joins, segment summaries,
  and development activity APIs.
- Current limitation: Segment logic is descriptive and does not prove causality.
- Next improvement: Add review-stage and project-pipeline records with dates,
  status, and geography.

## Flood / Environmental Constraints

- Current capability: Shows FEMA NFHL parcel flood constraints and FEMA source
  flood polygons.
- Data source basis: FEMA NFHL Layer 28 ingestion and parcel overlay.
- Current limitation: CFS supports screening and review, not engineering
  determinations.
- Next improvement: Add supplemental local hydrology, soils, watershed, and
  environmental constraint QA layers when vetted.

## Schools

- Current capability: Shows public CCS attendance-zone assignment and
  presentation-derived utilization caveats.
- Data source basis: Attendance-zone polygon overlay and SY 2024-2025
  presentation-derived utilization seed.
- Current limitation: Official capacity and enrollment data are not yet loaded;
  school capacity pressure is not scored.
- Next improvement: Ingest official enrollment, functional capacity,
  grade-level enrollment, projections, and planned capacity changes.

## Transportation

- Current capability: Provides transportation accessibility, STIP proximity,
  and AADT context for planning review and internal model research.
- Data source basis: County centerlines, rail layers, STIP inventory, and AADT
  context.
- Current limitation: Transportation features are current-context only unless
  historical or dated project data is available.
- Next improvement: Add dated local transportation projects, road extensions,
  funded improvements, and construction/completion status.

## Utility / Infrastructure

- Current capability: Shows utility and infrastructure proxy context where
  available.
- Data source basis: Available GIS utility proxy layers and planning source
  inventories.
- Current limitation: Proxy layers do not confirm service capacity, allocation,
  or availability.
- Next improvement: Request WSACC/service-provider capacity, allocation,
  service area, and project status data.

## Model Research

- Current capability: Documents internal model research, feature governance,
  aggregate metrics, and safety flags in Methodology.
- Data source basis: New construction permit labels, time-aware feature
  matrices, zoning/transportation/tax-value model experiments, and QA outputs.
- Current limitation: Calibration remains under review; no parcel-level
  probabilities or ranking classes are exposed.
- Next improvement: Add missing official feature groups, improve calibration,
  and complete governance review before any public-facing signal is considered.

## Reporting / Executive Print

- Current capability: Provides an Executive Print report preview for selected
  parcel review.
- Data source basis: Selected parcel APIs and frontend due diligence state.
- Current limitation: It is a report preview, not a complete production export
  system.
- Next improvement: Add versioned report exports, staff notes, attachments, and
  sign-off workflow.
