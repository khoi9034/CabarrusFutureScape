# Official Rezoning Case Records Data Request

## CFS Context

Cabarrus FutureScape is a planning intelligence prototype for parcel review,
constraint overlays, and internal model research. It is not a public prediction
decision system.

## What Data Is Requested

Requested data includes official rezoning, conditional zoning, zoning map
amendment, and related planning case records from county and municipal sources.

## Why It Is Useful

CFS already has historical zoning map-change detections. Those are useful, but
they are not official approval records. Official case records would clarify
approval dates, decisions, old zoning, new zoning, and jurisdictional review
history.

## Acceptable Formats

- REST service
- File geodatabase
- Shapefile
- GeoPackage
- CSV with geometry
- Excel with parcel IDs/PINs
- Generalized case polygons

## Minimum Needed Fields

- case number
- jurisdiction
- application date
- approval or effective date
- old zoning
- new zoning
- status/decision
- parcel IDs or PINs
- geometry, if available
- notes

## Optional Helpful Fields

- hearing date
- ordinance number
- staff recommendation
- applicant
- acreage
- proposed units or square footage
- condition type
- source URL or agenda link

## Sensitivity Note

Staff notes, applicant details, or pre-application records may require
internal-only handling. Status and decision fields are essential because a case
record is not the same as an approved rezoning.

## Prototype Note

CFS will label this as official planning case context. It will not be used as a
public prediction decision system.
