# CFS Next Data Request Packet

This packet organizes the next data requests needed to move CFS from
demo-ready prototype toward a governed internal planning tool.

PDF-only sources can be useful for reference, but GIS, REST, CSV, database
tables, or structured spreadsheets are much more useful for repeatable CFS
workflows.

## Priority 1

### WSACC True Utility Capacity / Service Area / Available Capacity Indicators

- Why CFS needs it: Current utility context is proxy-only and cannot confirm
  actual capacity or service availability.
- Useful fields: service area, facility/line ID, system type, available
  capacity, committed capacity, allocation status, project constraints,
  effective date, update date, source owner, notes.
- Due diligence value: Lets staff separate "near utility infrastructure" from
  "capacity may be available."
- Model readiness value: Enables future utility readiness features that are
  less noisy than proximity proxies.
- Preferred format: REST/GIS polygon or line service plus structured table.
- PDF warning: PDF-only capacity maps are difficult to update, join, and audit.

### Official School Enrollment and Capacity by School

- Why CFS needs it: School assignment exists, but official capacity scoring is
  intentionally disabled.
- Useful fields: school name, normalized school name, school level, school
  system, school year, functional capacity, current enrollment, available
  seats, utilization percent, source, update date, notes.
- Due diligence value: Helps explain whether assignment context has verified
  capacity information.
- Model readiness value: Supports future school capacity context after QA.
- Preferred format: CSV/XLSX or database export; grade-level detail preferred.
- PDF warning: PDF-only values should be treated as reference until verified.

### Countywide Future Land Use / Small-Area Plan GIS

- Why CFS needs it: Future land use is a high-value planning signal, but CFS
  needs countywide, adopted, date-aware GIS layers.
- Useful fields: plan name, adopted date, land use category, jurisdiction,
  status, source URL, update date, geometry.
- Due diligence value: Shows whether a parcel aligns with adopted planning
  intent.
- Model readiness value: Can become time-aware if adoption dates are reliable.
- Preferred format: REST/GIS polygon service with attributes.
- PDF warning: PDF maps are useful for reading plans but weak for parcel-level
  overlay and model features.

### Official Rezoning Case Records

- Why CFS needs it: Historical zoning maps show map changes, not official case
  decisions.
- Useful fields: case number, parcel/PIN, applicant, jurisdiction, application
  date, hearing date, approval date, old zoning, new zoning, decision/status,
  conditions, geometry or parcel links.
- Due diligence value: Connects parcel zoning context to official decisions.
- Model readiness value: Provides time-safe rezoning features with lower
  leakage risk.
- Preferred format: database table, CSV, GIS layer, or REST endpoint.
- PDF warning: Scanned agendas/minutes are not enough for reliable feature
  engineering without structured extraction and QA.

## Priority 2

### Countywide Development Pipeline / Subdivision Approvals

- Why CFS needs it: Permit history shows what happened; pipeline records show
  what is being reviewed or approved.
- Useful fields: project ID, project name, parcel/PIN, status, stage,
  application date, approval date, lots/units, use type, geometry, applicant,
  jurisdiction.
- Due diligence value: Identifies nearby or parcel-level planned activity.
- Model readiness value: Supports future project pipeline and timing features.
- Preferred format: REST/GIS or structured table.
- PDF warning: PDF-only staff reports are hard to keep current.

### Planned Local Road Projects With Dates/Status

- Why CFS needs it: Existing transportation features are current-context only.
- Useful fields: project ID, road name, project type, status, expected year,
  funded flag, jurisdiction, geometry, source, update date.
- Due diligence value: Helps staff explain future access and corridor changes.
- Model readiness value: Enables time-aware planned transportation features.
- Preferred format: GIS line/polygon service plus project table.
- PDF warning: PDF maps should be reference-only unless converted and QA'd.

### Planned Utility Extensions

- Why CFS needs it: Future service extensions may change development
  feasibility.
- Useful fields: project ID, utility type, status, expected year, service area,
  geometry, capacity impact if available, source, update date.
- Due diligence value: Helps identify parcels near future service improvements.
- Model readiness value: Supports future infrastructure timing features.
- Preferred format: GIS service and structured project table.
- PDF warning: PDF-only capital plans are useful but not enough for repeatable
  parcel overlay.

### Parks / Greenways / Bike-Ped Planned Improvements

- Why CFS needs it: Amenities and access can affect planning context and
  stakeholder review.
- Useful fields: project name, type, status, expected year, geometry,
  jurisdiction, funding status, source, update date.
- Due diligence value: Adds quality-of-place context.
- Model readiness value: Supports future amenity/access features.
- Preferred format: GIS line/polygon service.
- PDF warning: Plan PDFs are useful for narrative but weak for parcel features.

## Priority 3

### Environmental / Suitability Layers

- Why CFS needs it: CFS already has FEMA flood, but other constraints can
  matter for site review.
- Useful fields: layer type, source, effective date, geometry, restriction or
  review category, notes.
- Due diligence value: Improves constraint screening.
- Model readiness value: Supports future suitability features.
- Preferred format: GIS/REST layers.
- PDF warning: PDF-only maps should be used as references, not authoritative
  overlays.

### Land Supply / Vacant Developable Land

- Why CFS needs it: Development likelihood depends on whether land is
  available and developable.
- Useful fields: parcel ID, vacancy indicator, developable acreage, exclusions,
  ownership, constraints, source date.
- Due diligence value: Helps screen realistic site capacity.
- Model readiness value: Improves model target population definition.
- Preferred format: table joined to parcels plus GIS where needed.
- PDF warning: Static reports quickly become stale.

### Detailed Infrastructure Constraints

- Why CFS needs it: Utility, transportation, stormwater, and public safety
  constraints can shape review feasibility.
- Useful fields: constraint type, severity, capacity/status, effective date,
  geometry, source, owner, update date.
- Due diligence value: Adds review-specific infrastructure caveats.
- Model readiness value: Supports future readiness and suitability scoring.
- Preferred format: structured GIS layers and tables.
- PDF warning: Narrative-only constraints require manual interpretation.
