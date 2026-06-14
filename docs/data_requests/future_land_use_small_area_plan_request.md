# Future Land Use and Small-Area Plan Data Request

## CFS Context

Cabarrus FutureScape is a planning intelligence prototype for parcel review,
constraint overlays, and internal model research. It is not a public prediction
decision system.

## What Data Is Requested

Requested data includes countywide future land use polygons, small-area plan
geography, place types, activity centers, growth areas, preservation areas, and
adopted policy geography outside the already-found Concord-only Land Use Plan
2030 layer.

## Why It Is Useful

Future land use and small-area plans connect parcel activity to adopted policy
direction. They help CFS separate growth that aligns with plan intent from
activity in constrained or preservation-oriented areas.

## Acceptable Formats

- REST service
- File geodatabase
- Shapefile
- GeoPackage
- CSV with geometry
- Excel with parcel IDs or named plan areas
- Generalized planning polygons

## Minimum Needed Fields

- plan name
- future land use category or place type
- jurisdiction
- adoption date
- effective date, if different
- source document or plan URL
- notes

## Optional Helpful Fields

- growth area flag
- activity center flag
- employment area flag
- mixed-use node flag
- preservation area flag
- plan horizon year
- amendment date
- policy priority or implementation status

## Sensitivity Note

Adopted plan layers are usually public. Draft, pre-adoption, or staff-review
layers can be stored as internal-only context until they are ready to share.

## Prototype Note

CFS will label this as planning policy context. It will not be used as a public
prediction decision system.
