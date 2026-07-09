# WSACC Data Inventory

Inventory date: 2026-07-09

Source folder: `data/WSACC`

## Summary

The current WSACC drop contains three Cabarrus-focused shapefile datasets:

| Dataset | Geometry | CRS | Features | Likely CFS Role | Public Demo Safety |
| --- | --- | --- | ---: | --- | --- |
| `WSACC_Manholes26.shp` | Point | EPSG:3857 | 2,083 | Sewer collection node proximity and QA context | Safe as aggregated/proxy context |
| `WSACC_Pipes26.shp` | LineString | EPSG:3857 | 2,075 | Sewer line/interceptor proximity and utility-readiness screening context | Safe as aggregated/proxy context |
| `WSACC_Subbasins_Cabarrus_Only.shp` | Polygon | EPSG:3857 | 55 | Sewer basin context and basin-level summaries | Safe as aggregated/proxy context |

No water service area, sewer service area, CIP project, planned extension,
capacity-constrained area, moratorium, or committed-capacity layer was found in
this folder. CFS should therefore treat this drop as sewer proxy context, not
confirmed water/sewer capacity or parcel service availability.

## Dataset Details

### `WSACC_Manholes26.shp`

- Geometry type: Point
- CRS/projection: EPSG:3857
- Feature count: 2,083
- Source/date fields observed: `UPDTON`, `YR`, `SOURCE`
- Attribute fields:
  `OBJECTID`, `WSACC_ID`, `X_COORD`, `Y_COORD`, `YR`, `INVERTOUT`,
  `INVERTIN`, `INVERTIN2`, `INVERTIN3`, `RIM_ELEV`, `GND_ELEV`,
  `VENT_ELEV`, `STATUS`, `SOURCE`, `SRCTYPE`, `SRCENT`, `UPDTON`,
  `UPDTBY`, `COMMENTS`, `NEW_ID`, `MH_Audit`, `Facility`, `NEAR_FID`,
  `NEAR_DIST`
- Likely use in CFS:
  sewer infrastructure proximity, sewer system QA, and utility context for
  planning review.
- Data quality notes:
  point infrastructure only; does not show service-area coverage, capacity,
  allocation, or committed service.
- Safe for public demo:
  yes, if used as aggregated/proxy infrastructure context.

### `WSACC_Pipes26.shp`

- Geometry type: LineString
- CRS/projection: EPSG:3857
- Feature count: 2,075
- Source/date fields observed: `UPDTON`, `YR`, `SOURCE`
- Attribute fields:
  `OBJECTID`, `WSACC_ID`, `SI_NAME`, `LENGTH`, `SZ`, `MA`, `U_S_NODE`,
  `D_S_NODE`, `YR`, `SUBBASIN`, `INVERTOUT`, `INVERTIN`, `TYPE`, `STATUS`,
  `SOURCE`, `SRCTYPE`, `SRCENT`, `SRCFLOLD`, `UPDTON`, `UPDTBY`,
  `COMMENTS`, `Shape_Leng`, `GlobalID`, `HighPriori`, `Shape__Len`
- Likely use in CFS:
  sewer line proximity, interceptor context, subbasin linkage, and screening
  for infrastructure-supported planning review.
- Data quality notes:
  sewer linework is not the same as available capacity or service commitment.
  No reliable water line, planned extension, or CIP project layer is present in
  this folder.
- Safe for public demo:
  yes, if summarized as proxy line proximity or basin context.

### `WSACC_Subbasins_Cabarrus_Only.shp`

- Geometry type: Polygon
- CRS/projection: EPSG:3857
- Feature count: 55
- Source/date fields observed: none beyond basin labels
- Attribute fields:
  `Shape_Leng`, `Basin`, `SubBasin`, `Shape__Are`, `Shape__Len`
- Likely use in CFS:
  sewer basin context, basin-level utility review, and summary grouping.
- Data quality notes:
  basin geography does not identify capacity limits, service commitments, or
  project timing.
- Safe for public demo:
  yes, if used as aggregated basin context.

## CFS Role Classification

| Role | Current WSACC Support | Notes |
| --- | --- | --- |
| Service availability | Not present | Water/sewer service area polygons are still needed. |
| Utility infrastructure | Present, sewer only | Pipes and manholes support sewer proxy context. |
| Sewer/watershed planning | Present | Cabarrus-only WSACC subbasins are available. |
| Capacity / constraints | Not present | No capacity-limited, constrained basin, or moratorium layer found. |
| Planned improvements | Not present | No CIP/planned extension layer found. |
| Connection/development indicators | Partial | Parcel overlays can be derived after ingestion; capacity still needs source data. |

## Derived Parcel Overlay

After ingestion, run `scripts/build_parcel_wsacc_features.py` to create
`parcel_wsacc_utility_features`, `parcel_development_model_features`, and
`parcel_development_screening_output`.

The overlay transforms parcel and WSACC geometries to EPSG:2264 for feet-based
distance calculations and classifies 250 ft, 500 ft, and 1,000 ft sewer
proximity bands. See `docs/wsacc_model_features.md` for feature definitions and
safe-use assumptions.

## Safe-Use Notes

- Use language such as `development-readiness signal`, `utility proxy context`,
  `infrastructure-supported review candidate`, and `future due diligence
  required`.
- Do not claim a parcel has available water/sewer capacity from these files
  alone.
- Do not present this as official approval, appraisal, tax, zoning, or
  financial guidance.
