# Development Pipeline and Subdivision Data Request

## CFS Context

Cabarrus FutureScape is a planning intelligence prototype for parcel review,
constraint overlays, and internal model research. It is not a public prediction
decision system.

## What Data Is Requested

Requested data includes proposed, in-review, approved, active, and phased
development pipeline records, including subdivisions, site plans, major
commercial projects, multifamily projects, and mixed-use development areas.

## Why It Is Useful

Development pipeline records appear before building permits and can show
committed or likely near-term growth. They would improve due diligence and
future model interpretation without relying only on permit history.

## Acceptable Formats

- REST service
- File geodatabase
- Shapefile
- GeoPackage
- CSV with geometry
- Excel with parcel IDs/PINs
- Generalized project polygons

## Minimum Needed Fields

- project name
- project status
- review stage
- approval date
- use type
- expected units or square footage
- phase
- parcel IDs or PINs
- jurisdiction
- source date
- notes

## Optional Helpful Fields

- applicant or developer
- expected buildout year
- plan number
- staff contact
- conditions
- active/inactive flag
- entitlement type

## Sensitivity Note

Pre-application discussions, confidential economic development prospects, or
draft concepts should be excluded, generalized, or stored as internal-only data.

## Prototype Note

CFS will label this as development pipeline context. It will not be used as a
public prediction decision system.
