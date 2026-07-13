# Investment Environmental Context

This phase adds an environmental and physical-land screening foundation for the internal Investment Panel.

## Sources

- FEMA National Flood Hazard Layer: already loaded in CFS and reused through the parcel flood constraint overlay.
- USFWS National Wetlands Inventory: staging table and refresh workflow are in place; official county-clipped source data still needs to be loaded.
- USGS 3DEP elevation and slope: registry and workflow status are in place; county-clipped terrain summaries are not loaded yet.
- NRCS soil survey context: staging table and registry entry are in place; focused soil attributes are not loaded yet.
- EPA regulated-facility proximity: staging table and registry entry are in place; facility extracts are not loaded yet.

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

The first refresh reuses the existing FEMA overlay and marks NWI, slope, soil, and EPA source groups as `Data Unavailable` until official source extracts are loaded.

## Usable-Area Screening Proxy

`usable_area_screening_proxy` is not a certified site-area calculation. It is a conservative screening label based on mapped constraints available in the local summary. Where source groups are missing, the proxy remains limited or insufficient.

Overlapping mapped constraints must not be double-counted. Future wetland/slope/flood combination should use geometry unions before area subtraction.

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
