# Environmental Constraint Source Strategy

Phase 15B registers hydrology, local flood reference, soils, and watershed
sources for future environmental constraint work. This is source registration
and readiness only; no PostGIS schema changes, ingestion, overlay, scoring, or
frontend UI are active in this phase.

## Source Priority

Use newer Cabarrus topic-specific OpenData services before the legacy
`opendata/MapServer` service:

1. Primary hydrology:
   `OpenData/Hydrology/MapServer/0`
2. Primary local flood reference:
   `OpenData/Flood_Hazard_Areas/MapServer/0` for FloodWay
3. Primary local flood reference:
   `OpenData/Flood_Hazard_Areas/MapServer/1` for FloodPlain500year
4. Primary local flood reference:
   `OpenData/Flood_Hazard_Areas/MapServer/2` for FloodPlain100year

Legacy `opendata/MapServer` hydrology and flood layers remain fallback/reference
only. The legacy soils and water-supply watershed layers remain best-known
references until newer topic-specific services are found.

## Authority Boundary

FEMA NFHL remains the authoritative regulatory flood source for CFS flood
constraint intelligence. Cabarrus local floodway and floodplain layers are useful
for QA, comparison, local reference, and future environmental context, but they
do not replace FEMA NFHL for regulatory parcel flood constraints.

## Reorganization Rule

Cabarrus County GIS services are being reorganized. If a REST URL fails, do not
mark the layer unavailable immediately. First inspect:

- newer topic-specific OpenData service roots;
- the legacy `opendata/MapServer` root;
- layer IDs and service metadata;
- `config/environmental_constraint_sources.json`;
- fallback URLs listed for the source.

## Registered Sources

The source registry lives at:

- `config/environmental_constraint_sources.json`

It includes:

- `primary_hydrology_open_data`
- `primary_local_floodway_open_data`
- `primary_local_floodplain_500yr_open_data`
- `primary_local_floodplain_100yr_open_data`
- `legacy_hydro_fallback`
- `legacy_yadkin_hydrology_fallback`
- `soils_legacy_opendata`
- `water_supply_watershed_legacy_opendata`
- `legacy_floodway_fallback`
- `legacy_floodplain_100yr_fallback`
- `legacy_floodplain_500yr_fallback`

## Observed Metadata

Live metadata checks on June 14, 2026 found the primary hydrology and local
flood reference layers reachable. The legacy Hydro layer at
`opendata/MapServer/25` reports as a group layer, so it should not be used as
the preferred geometry layer.

## Future Work

Future phases may ingest these sources to support environmental sensitivity,
stream/buffer context, soils constraints, watershed context, or QA comparison
against FEMA NFHL. Any parcel overlay should preserve source authority labels
and should not alter the existing FEMA-based regulatory flood workflow.
