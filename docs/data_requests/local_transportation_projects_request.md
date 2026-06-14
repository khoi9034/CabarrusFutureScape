# Local Transportation Projects Data Request

## CFS Context

Cabarrus FutureScape is a planning intelligence prototype for parcel review,
constraint overlays, and internal model research. It is not a public prediction
decision system.

## What Data Is Requested

Requested data includes local road projects, future transportation network
segments, roadway widening projects, planned extensions, intersection
improvements, corridors, and transportation CIP or concept projects.

## Why It Is Useful

CFS already incorporates NCDOT STIP and AADT data. Local plan, CIP, and concept
projects are still needed because they often explain parcel-level access
changes that are not fully represented in statewide datasets.

## Acceptable Formats

- REST service
- File geodatabase
- Shapefile
- GeoPackage
- CSV with geometry
- Excel with project location fields
- Generalized project corridors or planning polygons

## Minimum Needed Fields

- project name
- project type
- road name
- status
- expected year or year range
- funding status
- plan/adoption year
- jurisdiction
- source plan
- notes

## Optional Helpful Fields

- project ID
- responsible agency
- project phase
- cost range
- completion year
- improvement type
- geometry confidence
- public or internal status

## Sensitivity Note

Unfunded concepts and early planning corridors should be clearly labeled and may
need internal-only or generalized geometry treatment.

## Prototype Note

CFS will label this as transportation planning context. It will not be used as
a public prediction decision system.
