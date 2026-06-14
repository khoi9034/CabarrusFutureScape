# WSACC Utility Capacity Data Request

## CFS Context

Cabarrus FutureScape is a planning intelligence prototype for parcel due
diligence, constraint review, and internal model research. It is not a public
prediction decision system.

## What Data Is Requested

Requested WSACC or utility planning GIS includes service areas, sewer basins,
capacity-limited areas, generalized water/sewer readiness polygons, and planned
utility projects.

## Why It Is Useful

Utility service and capacity are among the strongest determinants of whether a
parcel can support near-term development. This data would help CFS distinguish
parcels with apparent land opportunity from parcels that need infrastructure
review or future service extension.

## Acceptable Formats

- REST service
- File geodatabase
- Shapefile
- GeoPackage
- CSV with geometry
- Excel with parcel IDs or geography references
- Generalized planning polygons

## Minimum Needed Fields

- utility type
- service area or basin name
- capacity status
- service status
- project name, if project data is provided
- project status
- expected year, if available
- source date
- owner/steward
- notes

## Optional Helpful Fields

- available capacity category
- planned capacity added
- constraint reason
- CIP identifier
- funding status
- project phase
- update frequency
- geometry confidence

## Sensitivity Note

Exact pipe locations, facility details, and security-sensitive infrastructure
data may be sensitive. Generalized service-readiness polygons, basin-level
capacity categories, or internal-only planning layers are acceptable.

## Prototype Note

CFS will label this as planning intelligence context. It will not be used as a
public prediction decision system.
