# CFS Missing Data Tracker

This tracker separates already-found sources from datasets still needed for
stronger CFS planning intelligence and future model comparison. Do not request
the already-found Concord Land Use Plan 2030, NCDOT STIP, NCDOT AADT stations,
or Concord Planning Cases sources again unless their URLs move or schemas
change.

## Very High Priority

### WSACC Utility Capacity / Service-Area GIS

- Why it matters: Water/sewer service and capacity strongly shape development
  feasibility and phasing.
- Needed fields: service area, utility type, capacity status, available
  capacity, constraint status, improvement project status, expected year,
  source date, notes.
- Preferred geometry: polygon service areas, line networks, point facilities,
  and planned project geometries where available.
- Priority: very high.
- Current status: missing.
- Likely owner: WSACC, county infrastructure/planning staff, municipal utility
  partners.
- Caveat: Capacity and security-sensitive infrastructure details may need
  restricted/internal handling.

### Countywide Small-Area Plan / Future Land Use GIS

- Why it matters: Countywide future land use and small-area plan geography are
  needed to compare development activity against adopted policy direction
  outside Concord.
- Needed fields: plan name, future land use category, place type/growth area,
  adoption date, effective date, jurisdiction, source document, notes.
- Preferred geometry: polygons.
- Priority: very high.
- Current status: missing outside the already-found Concord-only plan layer.
- Likely owner: Cabarrus County Planning, municipal planning departments.
- Caveat: Concord-only data must not be treated as countywide coverage.

### Local Planned Road Projects / Future Transportation Network

- Why it matters: Local planned roads, widening projects, intersections, and
  concept corridors may be more relevant to parcel development pressure than
  statewide STIP alone.
- Needed fields: project name, project type, road name, status, expected year,
  funding status, plan/adoption year, jurisdiction, source plan, notes.
- Preferred geometry: lines for corridors/roads, points for intersections,
  polygons where project areas are defined.
- Priority: very high.
- Current status: partially covered by NCDOT STIP only; local concept/project
  layers still missing.
- Likely owner: Cabarrus County Transportation/Planning, municipalities,
  MPO/RPO partners, NCDOT division staff.
- Caveat: Unfunded concept projects should be clearly separated from funded or
  committed projects.

## High Priority

### Countywide / Municipal Official Rezoning Case Records

- Why it matters: Official rezoning approval history can make zoning-change
  features more precise than map-change detection alone.
- Needed fields: case number, jurisdiction, application date, approval/effective
  date, old zoning, new zoning, status/decision, applicant, parcel IDs,
  geometry, notes.
- Preferred geometry: parcel/case polygons or linked parcel IDs.
- Priority: high.
- Current status: Concord Planning Cases found, but countywide/municipal
  official approval history remains missing.
- Likely owner: county and municipal planning departments.
- Caveat: Case creation is not the same as approval; status and decision fields
  are essential.

### Development Pipeline / Subdivision Approval GIS

- Why it matters: Approved subdivisions, site plans, and development pipeline
  records can reveal committed future growth not captured by permit labels yet.
- Needed fields: project name, approval status, approval date, expected units or
  square footage, use type, phase, parcel IDs, jurisdiction, source date, notes.
- Preferred geometry: project polygons with parcel links.
- Priority: high.
- Current status: missing.
- Likely owner: county and municipal planning/development review departments.
- Caveat: Preliminary concepts should be separated from approved/active
  pipeline projects.

## Medium-High Priority

### Plan-Based Suitability / Land Supply GIS

- Why it matters: Suitability, land supply, and constrained land analyses help
  distinguish buildable opportunity from raw parcel availability.
- Needed fields: suitability class, land supply category, excluded/constrained
  reason, source plan, adoption date, jurisdiction, notes.
- Preferred geometry: polygons.
- Priority: medium-high.
- Current status: missing.
- Likely owner: county planning, municipal planning, consultant plan products.
- Caveat: Suitability logic should be documented because it may combine policy
  judgment and data constraints.

## Medium Priority

### Parks / Greenways / Bike-Ped Future Amenity GIS

- Why it matters: Planned amenities and access networks can contribute to
  place-based attractiveness and future development context.
- Needed fields: amenity/project name, type, status, expected year, funding
  status, plan source, jurisdiction, notes.
- Preferred geometry: lines for greenways/bike-ped networks, points/polygons for
  parks and facilities.
- Priority: medium.
- Current status: missing.
- Likely owner: parks and recreation, planning departments, municipal partners.
- Caveat: Planned amenities should be separated from existing amenities and
  unfunded concepts.
