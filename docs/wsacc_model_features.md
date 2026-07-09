# WSACC Model Features

## What Was Built

WSACC sewer pipes, manholes, and Cabarrus-only subbasins are ingested into PostGIS
and summarized into parcel-level sewer-proximity proxy features.

Derived tables:

- `parcel_wsacc_utility_features`
- `parcel_development_model_features`
- `parcel_development_screening_output`

Build command:

```powershell
python scripts/build_parcel_wsacc_features.py --dry-run
python scripts/build_parcel_wsacc_features.py --apply
```

## Projection And Distance Assumption

Source WSACC layers are EPSG:3857. The build script transforms WSACC and parcel
geometries to EPSG:2264 before distance calculations because EPSG:2264 uses
feet in North Carolina StatePlane.

Distance thresholds:

- 250 ft: adjacent sewer infrastructure proxy
- 500 ft: near sewer infrastructure proxy
- 1,000 ft: moderate sewer proximity proxy

## Feature Fields

`parcel_wsacc_utility_features` includes nearest sewer pipe/manhole distances,
250/500/1,000 ft flags, WSACC subbasin label, sewer proxy class, utility
readiness proxy class, proxy confidence, and data-needed capacity/planned
extension statuses.

Model-ready fields include encoded sewer proxy class, utility readiness class,
proxy confidence, and interaction placeholders for permit pressure, underbuilt
status, zoning support, corridor access, flood constraint, and school pressure.

## Safe Interpretation

This dataset supports:

- sewer infrastructure proximity proxy
- sewer basin context
- screening-level utility readiness proxy
- capacity and planned-extension data gap reporting

This dataset does not support:

- confirmed water service
- confirmed sewer capacity
- committed service availability
- planned extension timing
- moratorium or constrained-capacity findings
- project approval or development guarantees

Use language such as `capacity data needed`, `planned extension data needed`,
`sewer infrastructure proximity proxy`, and `screening-level development
readiness signal`.

## Public Demo Masking

Public demo outputs use aggregated/sanitized proxy classes and summary fields.
Raw WSACC source files are not committed and `data/WSACC` remains ignored.
