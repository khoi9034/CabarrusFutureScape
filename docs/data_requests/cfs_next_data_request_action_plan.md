# CFS Next Data Request Action Plan

Phase 14A recommends requesting high-value planning data in this order. The
goal is to improve planning intelligence and future model readiness without
adding fake data or public prediction output.

## 1. WSACC Utility Capacity and Service Area GIS

- Who to ask if known: WSACC, Cabarrus County infrastructure/planning staff,
  municipal utility partners.
- Why it matters: Utility capacity and service readiness are core development
  feasibility constraints.
- Minimum fields needed: utility type, service status, capacity status, basin or
  service area name, project name, project status, expected year, source date.
- Preferred geometry: service-area polygons, basin polygons, generalized
  capacity-limited areas, planned project lines or polygons.
- Sensitivity alternative: generalized planning polygons or basin-level
  capacity categories instead of exact pipe/facility locations.

## 2. Countywide Future Land Use and Small-Area Plan GIS

- Who to ask if known: Cabarrus County Planning, municipal planning
  departments, planning consultants.
- Why it matters: CFS needs countywide policy geography outside the already
  found Concord-only source.
- Minimum fields needed: plan name, future land use category or place type,
  jurisdiction, adoption date, effective date, source document.
- Preferred geometry: polygons.
- Sensitivity alternative: adopted generalized plan polygons if draft or
  internal layers are restricted.

## 3. Local Planned Road Projects and Future Transportation Network

- Who to ask if known: Cabarrus County Transportation/Planning, municipal
  transportation/planning departments, MPO/RPO partners, NCDOT division staff.
- Why it matters: Local projects can explain development access changes not
  fully represented in NCDOT STIP.
- Minimum fields needed: project name, project type, road name, status,
  expected year, funding status, jurisdiction, source plan.
- Preferred geometry: project lines, corridor polygons, intersection points, or
  generalized project areas.
- Sensitivity alternative: generalized corridors and status categories if exact
  alignments are not ready to share.

## 4. Official Rezoning Case Records

- Who to ask if known: county and municipal planning departments.
- Why it matters: Official approval records are needed to move from map-change
  detections to verified rezoning history.
- Minimum fields needed: case number, jurisdiction, application date, approval
  or effective date, old zoning, new zoning, status/decision, parcel IDs or
  PINs.
- Preferred geometry: case polygons or linked parcel IDs.
- Sensitivity alternative: public case fields only, with staff notes removed.

## 5. Development Pipeline and Subdivision Approvals

- Who to ask if known: county and municipal planning/development review
  departments.
- Why it matters: Pipeline records show proposed or approved development before
  building permits are issued.
- Minimum fields needed: project name, project status, review stage, approval
  date, use type, expected units or square footage, parcel IDs or PINs,
  jurisdiction.
- Preferred geometry: project polygons with parcel links.
- Sensitivity alternative: exclude pre-application or confidential prospects;
  use generalized project areas for sensitive active reviews.

## Action Notes

- Send the dataset-specific request templates from this folder.
- Ask for REST services first, then geodatabase/GeoPackage/shapefile, then CSV
  or Excel if geometry is unavailable.
- Record every received source with `cfs_new_source_intake_checklist.md`.
- Do not ingest into PostGIS until schema, geometry, sensitivity, and temporal
  safety are reviewed.
