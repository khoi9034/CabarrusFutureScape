# Plan-Based Suitability and Land Supply Data Request

## CFS Context

Cabarrus FutureScape is a planning intelligence prototype for parcel review,
constraint overlays, and internal model research. It is not a public prediction
decision system.

## What Data Is Requested

Requested data includes suitability, land supply, developability,
constraint-weighted opportunity, and plan-based land availability layers.

## Why It Is Useful

Suitability and land supply layers help distinguish theoretical vacant land
from parcels that are practical, policy-supported, and less constrained.

## Acceptable Formats

- REST service
- File geodatabase
- Shapefile
- GeoPackage
- CSV with geometry
- Excel with parcel IDs or planning area references
- Generalized planning polygons

## Minimum Needed Fields

- suitability class
- land supply category
- constraint or exclusion reason
- source plan
- source date or adoption date
- jurisdiction
- notes

## Optional Helpful Fields

- suitability score components
- acreage
- allowed use category
- residential capacity assumption
- employment capacity assumption
- constraint weights
- methodology notes

## Sensitivity Note

Suitability layers often combine policy judgment and technical criteria. CFS
should preserve methodology notes and avoid treating suitability scores as
objective truth without review.

## Prototype Note

CFS will label this as plan-based suitability context. It will not be used as a
public prediction decision system.
