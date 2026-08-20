# Investment Environmental Context

> **Retired historical reference:** The Investments product and CASE-1 workflow are retired and are not part of the active Demo, Local, Enterprise, acceptance, or deployment surface. This document is retained only as historical design or evidence and must not be used as an operating runbook.

This phase adds an environmental and physical-land screening foundation for internal CFS Investment.

## Sources

- FEMA National Flood Hazard Layer: already loaded in CFS and reused through the parcel flood constraint overlay.
- USFWS National Wetlands Inventory: loaded from the official NWI map service for Cabarrus County screening context; 9,384 source wetland features are stored locally.
- USGS 3DEP elevation and slope: loaded through a cached local 512 x 512 GeoTIFF screening raster exported from the USGS 3DEP ImageServer. Parcel terrain summaries cover 110,017 parcels.
- NRCS soil survey context: loaded from USDA NRCS Soil Data Access / SSURGO `mapunitpolyextended`; 16,656 source soil polygons are stored locally.
- EPA regulated-facility proximity: loaded from EPA ECHO All Media Programs Facility Search. The raw 1,523 ECHO rows are deduplicated to 1,497 physical facility points before parcel proximity screening.

## Parcel Summary

CFS Investment uses `investment_parcel_environmental_context` as the candidate-facing summary table. It contains one row per parcel when refreshed. The table is designed for screening-level fields:

- flood context from existing FEMA parcel overlay
- mapped wetland context
- terrain and slope context
- soil limitation context
- regulated-facility proximity context
- usable-area screening proxy
- overall environmental constraint band
- environmental data confidence
- professional verification requirements

The current local refresh reuses the existing FEMA overlay and adds NWI wetland, USGS terrain, NRCS soil, and EPA facility context. Missing source tables are explicitly reported as unavailable; missing evidence is not treated as evidence that no condition exists.

## Usable-Area Screening Proxy

`usable_area_screening_proxy` is not a certified site-area calculation. It is a conservative screening label based on mapped constraints available in the local summary. Where source groups are missing, the proxy remains limited or insufficient.

Overlapping mapped constraints are not subtracted cumulatively. The current parcel summary uses the largest mapped flood, capped mapped-wetland, or steep-slope percentage as the controlling screening limitation so overlapping areas are not double-counted. The fast NWI summary caps percentages at 100; exact parcel wetland-union geometry is the upgrade path if acreage accounting becomes decision-critical.

## Terrain Method

`python -m app.scripts.refresh_investment_environmental --source terrain` downloads the official USGS 3DEP raster once to the local user cache (`%USERPROFILE%\.cfs_cache\environmental`) and does not commit the raw raster. The workflow reads the GeoTIFF with Pillow/numpy, calculates slope as percent rise from the elevation gradient, creates temporary sample points in PostGIS, and summarizes those samples by parcel. Elevation units are meters; the current screening raster resolution is about 106.91 x 106.91 meters per pixel in Web Mercator.

Terrain thresholds are screening classes, not development standards:

- Generally Level: mean slope below 4% and no high local maximum slope signal.
- Moderate Terrain: mean slope at least 4% or local maximum slope at least 8%.
- Mixed Terrain: mean slope at least 8%, local maximum slope at least 15%, or at least 10% steep sample cells.
- Higher-Slope Constraint: mean slope at least 15%, local maximum slope at least 25%, or at least 30% steep sample cells.

## EPA Facility Method

ECHO rows are normalized to physical facility points using rounded coordinates and normalized facility names. Program categories are grouped as Hazardous Waste / RCRA, Air-Regulated Facility, Water-Discharge / NPDES, Superfund or Cleanup, Other Regulated-Facility, or Insufficient Program Information where supported by source fields. Parcel proximity uses parcel geometry distance and qualitative bands: immediately adjacent, within 0.25 mile, 0.25-0.5 mile, 0.5-1 mile, or no facility identified within one mile.

## Bands

Mapped wetland context:

- No Mapped Intersection
- Limited Mapped Intersection
- Moderate Mapped Intersection
- Substantial Mapped Intersection
- Data Unavailable

Terrain context:

- Generally Level
- Moderate Terrain
- Mixed Terrain
- Higher-Slope Constraint
- Data Unavailable

Usable-area screening proxy:

- Broad Usable-Area Signal
- Moderate Usable-Area Limitations
- Material Usable-Area Limitations
- Insufficient Environmental Information

Overall environmental constraint band:

- Limited Mapped Constraint
- Moderate Mapped Constraint
- Material Mapped Constraint
- High Verification Need
- Insufficient Information

## Candidate Use

Candidate Intake and Compare Selected now display Environmental & Physical Context. Ask CFS Investment Research can summarize major physical constraints and next due-diligence steps.

This context is a separate evidence dimension. It should be reviewed alongside utility-readiness proxy, market-area context, sale/comparable context, zoning/planning alignment, access, and flood review.

## Caveats

CFS environmental context is screening-level only. Users should treat it as a prompt for professional review, not as a site-specific determination, clearance, appraisal, or value assurance.

Professional verification may include wetland delineation, topographic survey, engineering review, geotechnical investigation, regulated-facility due diligence, title/easement review, and local planning or utility confirmation.

Mapped NWI context does not prove wetlands are present or absent. EPA facility proximity does not imply contamination on a parcel. NRCS soils are generalized mapping context and do not replace geotechnical or septic evaluation. Terrain and slope are screening summaries and do not determine engineering feasibility.

## Refresh Commands

- `python -m app.scripts.refresh_investment_environmental --source nwi`
- `python -m app.scripts.refresh_investment_environmental --source terrain`
- `python -m app.scripts.refresh_investment_environmental --source soils`
- `python -m app.scripts.refresh_investment_environmental --source epa`
- `python -m app.scripts.refresh_investment_environmental --source summaries`
- `python -m app.scripts.refresh_investment_environmental --source all`
