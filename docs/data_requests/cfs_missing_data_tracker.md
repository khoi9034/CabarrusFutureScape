# CFS Missing High-Value Planning Data Tracker

Phase 14A pauses model expansion and organizes the next high-value data
requests. The purpose is to make CFS ready to ingest better planning context
when it is received, without inventing data, training a new model, or exposing
predictions.

## Already Incorporated

Do not request these again right now unless a source URL moves or the owner
offers a better replacement:

- new construction permit data;
- historical zoning layers and zoning map-change detections;
- current road and rail accessibility;
- NCDOT 2026-2035 STIP projects;
- NCDOT AADT traffic count stations;
- school zones, assignment, utilization seed, and capacity ingestion
  infrastructure;
- FEMA NFHL flood constraints and flood zones;
- current parcel intelligence;
- internal model research, ranking classes, and methodology transparency.

## Found But Not Fully Feature-Engineered

These are useful but limited sources. Do not treat either as countywide
coverage.

- City of Concord Land Use Plan 2030 GIS layer:
  `https://maps2.concordnc.gov/server/rest/services/Planning_Webmap_Public_MIL1/MapServer/48`
  - Status: found and inventoried.
  - Caveat: Concord only, not countywide future land use.
- Concord Planning Cases layer:
  `https://maps2.concordnc.gov/server/rest/services/Planning_Webmap_Public_MIL1/MapServer/9`
  - Status: found and inventoried.
  - Caveat: Concord only, not countywide official rezoning history.

## Very High Priority

### WSACC Utility Capacity and Utility Project GIS

- Dataset name: WSACC utility capacity, service areas, basins, and planned
  utility projects.
- Current status: still needed.
- Already found or still needed: still needed.
- Priority: very high.
- Why it matters for CFS: Water and sewer service readiness directly shapes
  development feasibility, phasing, and review risk.
- Why it matters for the development model: Utility availability and capacity
  constraints are likely stronger planning signals than many current-context
  parcel attributes.
- Preferred geometry: generalized service-area polygons, wastewater basin
  polygons, capacity-limited area polygons, planned project lines/polygons, and
  facility points where appropriate.
- Required fields: utility type, service status, capacity status, basin or
  service area name, project name, project status, expected year if applicable,
  source date, owner/steward, notes.
- Nice-to-have fields: available capacity category, planned capacity added,
  constraint reason, CIP identifier, funding status, project phase, update
  frequency.
- Likely owner/department: WSACC, Cabarrus County infrastructure/planning staff,
  municipal utility partners.
- Sensitivity caveat: Exact pipe locations or facility details may be sensitive.
  Generalized planning polygons are acceptable.
- CFS feature group: utilities and infrastructure readiness.
- Future ingestion phase: Phase 14B candidate.
- Notes: Highest-value next request because utilities are a major missing
  readiness layer.

### Countywide Small-Area Plan and Future Land Use GIS

- Dataset name: Countywide future land use, place type, growth area, and
  small-area plan GIS.
- Current status: still needed outside Concord.
- Already found or still needed: Concord-only source found; countywide and
  non-Concord sources still needed.
- Priority: very high.
- Why it matters for CFS: Future land use connects parcel activity to adopted
  planning intent.
- Why it matters for the development model: Plan alignment can separate growth
  supported by policy from activity occurring in constrained or preservation
  areas.
- Preferred geometry: polygons.
- Required fields: plan name, future land use category, place type or policy
  category, adoption date, effective date if different, jurisdiction, source
  document, notes.
- Nice-to-have fields: growth area flag, activity center flag, employment area
  flag, mixed-use node flag, preservation area flag, plan horizon, amendment
  date.
- Likely owner/department: Cabarrus County Planning, municipal planning
  departments, planning consultants.
- Sensitivity caveat: Usually public, but draft or pre-adoption layers may need
  internal-only handling.
- CFS feature group: planning policy and future land use.
- Future ingestion phase: Phase 14C candidate.
- Notes: Concord Land Use Plan 2030 cannot stand in for countywide coverage.

### Local Planned Road Projects and Future Transportation Network

- Dataset name: Local planned road projects, future road network, and
  transportation CIP/concept projects.
- Current status: still needed.
- Already found or still needed: NCDOT STIP and AADT are incorporated; local
  projects still needed.
- Priority: very high.
- Why it matters for CFS: Local road projects can change parcel access and
  development readiness before building permits appear.
- Why it matters for the development model: Dated local project records can make
  transportation features time-safe instead of current-context only.
- Preferred geometry: project lines, corridor polygons, intersection points, or
  generalized project areas.
- Required fields: project name, project type, road name, status, expected
  year, funding status, plan/adoption year, jurisdiction, source plan, notes.
- Nice-to-have fields: project ID, improvement type, project phase, cost range,
  responsible agency, completion year, geometry confidence.
- Likely owner/department: Cabarrus County Transportation/Planning, municipal
  transportation/planning departments, MPO/RPO partners, NCDOT division staff.
- Sensitivity caveat: Unfunded concepts should be labeled clearly and may need
  internal-only treatment.
- CFS feature group: transportation project context.
- Future ingestion phase: Phase 14D candidate.
- Notes: This complements, but does not replace, NCDOT STIP.

## High Priority

### Countywide and Municipal Official Rezoning Case Records

- Dataset name: Official rezoning, conditional zoning, map amendment, and
  planning case records.
- Current status: still needed.
- Already found or still needed: historical zoning map changes exist; official
  approval records still needed.
- Priority: high.
- Why it matters for CFS: Official case records clarify what changed, when it
  changed, who approved it, and whether it was approved or denied.
- Why it matters for the development model: Dated approval records can create
  time-safe features that are stronger than map-change detections.
- Preferred geometry: case polygons or parcel links. CSV/Excel is acceptable if
  it contains parcel IDs or PINs.
- Required fields: case number, jurisdiction, application date, approval or
  effective date, old zoning, new zoning, status/decision, applicant if
  available, parcel IDs/PINs, notes.
- Nice-to-have fields: hearing date, ordinance number, staff recommendation,
  condition type, land use category, acreage, units or square footage proposed.
- Likely owner/department: county and municipal planning departments.
- Sensitivity caveat: Staff notes or applicant details may require internal-only
  handling.
- CFS feature group: official zoning and planning case history.
- Future ingestion phase: Phase 14E candidate.
- Notes: Case creation is not approval. Status and decision fields are
  essential.

### Development Pipeline and Subdivision Approval GIS

- Dataset name: Proposed, in-review, approved, and active development pipeline
  and subdivision records.
- Current status: still needed.
- Already found or still needed: still needed.
- Priority: high.
- Why it matters for CFS: Pipeline records show committed or proposed growth
  before permits are issued.
- Why it matters for the development model: Approved subdivision and site-plan
  records can improve label lead time and reduce reliance on permit-only
  signals.
- Preferred geometry: project polygons with parcel links.
- Required fields: project name, project status, review stage, approval date,
  use type, expected units or square footage, phase, parcel IDs/PINs,
  jurisdiction, source date, notes.
- Nice-to-have fields: applicant/developer, expected buildout year, plan number,
  staff contact, conditions, active/inactive flag.
- Likely owner/department: county and municipal planning/development review
  departments.
- Sensitivity caveat: Pre-application or confidential economic development
  prospects should be excluded or generalized.
- CFS feature group: development pipeline and subdivision readiness.
- Future ingestion phase: Phase 14F candidate.
- Notes: Separate approved projects from preliminary concepts.

## Medium-High Priority

### Plan-Based Suitability and Land Supply Layers

- Dataset name: Plan-based suitability, land supply, land availability, and
  developability layers.
- Current status: still needed.
- Already found or still needed: still needed.
- Priority: medium-high.
- Why it matters for CFS: Suitability and land supply layers help distinguish
  raw parcels from practical opportunities.
- Why it matters for the development model: Constraint-weighted land supply can
  improve interpretation of parcels that appear developable but are constrained
  by policy, environment, or infrastructure.
- Preferred geometry: polygons.
- Required fields: suitability class, land supply category, constraint or
  exclusion reason, source plan, adoption date or source date, jurisdiction,
  notes.
- Nice-to-have fields: suitability score components, acreage, allowed use
  category, housing or employment capacity assumptions, constraint weights.
- Likely owner/department: county planning, municipal planning, consultant plan
  products.
- Sensitivity caveat: Suitability logic may include policy judgment and should
  be documented before use.
- CFS feature group: suitability and land supply.
- Future ingestion phase: Phase 14G candidate.
- Notes: Do not combine into a score unless the source logic is documented.

## Medium Priority

### Parks, Greenways, and Bike-Ped Future Amenity GIS

- Dataset name: Planned parks, greenways, trails, bike-ped facilities, and
  future amenity investments.
- Current status: still needed.
- Already found or still needed: still needed.
- Priority: medium.
- Why it matters for CFS: Planned amenities contribute to place-based context
  and quality-of-life planning.
- Why it matters for the development model: Amenity proximity may help explain
  future residential or mixed-use interest when combined with other signals.
- Preferred geometry: lines for greenways and bike-ped networks; points or
  polygons for parks, trailheads, and facilities.
- Required fields: project name, amenity type, status, expected year, funding
  status, plan source, jurisdiction, notes.
- Nice-to-have fields: project phase, implementation priority, connection type,
  adoption year, public access status.
- Likely owner/department: parks and recreation, planning departments, municipal
  partners.
- Sensitivity caveat: Unfunded or conceptual alignments should be clearly
  labeled and may need generalized geometry.
- CFS feature group: future amenities and access context.
- Future ingestion phase: Phase 14H candidate.
- Notes: Keep planned amenities separate from existing amenity layers.
