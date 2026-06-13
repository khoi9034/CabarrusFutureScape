# New Construction Permit Extract

## Source

- File: `data/development/raw/BuildingPermits_NewConstruction.csv`
- Source type: staff-provided new construction permit extract
- Source confidence: `staff_provided_extract`
- Loaded table: `public.new_construction_permits_raw`
- Clean table: `public.new_construction_permits_clean`

## Fields

| Field | Meaning |
| --- | --- |
| `B1_ALT_ID` | Source permit identifier. |
| `B1_APP_TYPE_ALIAS` | Permit type label. Observed values are `Building Residential New` and `Building Commercial New`, plus one blank row. |
| `B1_FILE_DD` | Permit file date. |
| `address` | Permit address text from source extract. |
| `parcelNum` | Source parcel number. Matched cautiously to `public.parcels_enriched.pin14`. |
| `CO_Issued` | Certificate of occupancy issued indicator. |
| `CO_Date` | Certificate of occupancy date. |

## Validated Range

The Phase 10A profile found 20,614 source rows. Parsed permit file dates run from
`2015-01-05` through `2026-06-11`. Parsed CO dates run from `2015-03-19`
through `2026-06-11`.

## Caveats

- This extract is a strong new-construction signal, but it is not the only growth signal.
- The source contains null, short, placeholder, unmatched, and ambiguous parcel numbers. Those are not force-matched.
- CO status is treated as completion context, not as a future feature unless the CO date exists before a modeling snapshot.
- The extract contains more than five years of permits, so time windows are derived from observed dates rather than assumptions.
- This layer does not replace the broader permit intelligence and segmentation workflow.

## Future Features Needed

Future predictive modeling should add zoning changes, land availability, parcel
size, land value, vacant/developable land, flood constraints, school constraints,
infrastructure readiness, road access, nearby development activity, and future
land use before any production score is exposed.
