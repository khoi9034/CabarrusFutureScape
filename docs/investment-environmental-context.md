# Investment Environmental Context

This phase adds an environmental and physical-land screening foundation for the internal Investment Panel.

## Sources

- FEMA National Flood Hazard Layer: already loaded in CFS and reused through the parcel flood constraint overlay.
- USFWS National Wetlands Inventory: loaded from the official NWI map service for Cabarrus County screening context; 9,384 source wetland features are stored locally.
- USGS 3DEP elevation and slope: connector and table are present, but the live ImageServer refresh timed out during bounded validation. Terrain remains `Data Unavailable` until a smaller/local raster workflow is used.
- NRCS soil survey context: loaded from USDA NRCS Soil Data Access / SSURGO `mapunitpolyextended`; 16,656 source soil polygons are stored locally.
- EPA regulated-facility proximity: loaded from EPA ECHO All Media Programs Facility Search; 1,523 facility points are stored locally for proximity screening.

## Parcel Summary

The Investment Panel uses `investment_parcel_environmental_context` as the candidate-facing summary table. It contains one row per parcel when refreshed. The table is designed for screening-level fields:

- flood context from existing FEMA parcel overlay
- mapped wetland context
- terrain and slope context
- soil limitation context
- regulated-facility proximity context
- usable-area screening proxy
- overall environmental constraint band
- environmental data confidence
- professional verification requirements

The current local refresh reuses the existing FEMA overlay and adds NWI wetland, NRCS soil, and EPA facility context. USGS terrain/slope is explicitly marked unavailable when the terrain table has no rows.

## Usable-Area Screening Proxy

`usable_area_screening_proxy` is not a certified site-area calculation. It is a conservative screening label based on mapped constraints available in the local summary. Where source groups are missing, the proxy remains limited or insufficient.

Overlapping mapped constraints are not subtracted cumulatively. The current parcel summary uses the largest mapped flood, wetland, or steep-slope percentage as the controlling screening limitation so overlapping areas are not double-counted. If the app later needs parcel-area accounting, use explicit geometry/raster unions before any area subtraction.

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

Mapped NWI context does not prove wetlands are present or absent. EPA facility proximity does not imply contamination on a parcel. NRCS soils are generalized mapping context and do not replace geotechnical or septic evaluation. Terrain remains unavailable until the USGS refresh succeeds.
