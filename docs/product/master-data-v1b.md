# Master Data V1B

Master Data V1B is the read-only governed catalog for Parcels, Permits,
Addresses, Zoning, Flood, and Schools. Dataset, field, relationship, filter,
sort, and export identifiers remain server-controlled; the browser never sends
table names or SQL.

## Runtime parity

| Dataset | Demo rows | Geometry | Exports |
| --- | ---: | --- | --- |
| Parcels | 6 | MultiPolygon, EPSG:4326 | CSV, XLSX, GeoJSON |
| Permits | 30 | None until the governed parcel join is enabled | CSV, XLSX; GeoJSON with attached parcel geometry |
| Addresses | 6 | Point, EPSG:4326 | CSV, XLSX, GeoJSON |
| Zoning | 6 | MultiPolygon, EPSG:4326 | CSV, XLSX, GeoJSON |
| Flood | 6 | MultiPolygon, EPSG:4326 | CSV, XLSX, GeoJSON |
| Schools | 6 | MultiPolygon, EPSG:4326 | CSV, XLSX, GeoJSON |

Portfolio Demo reads only
`public/demo-data/master_data_v1b.json`. The fixture is deterministic,
sanitized, bounded to Cabarrus County, and contains no owner, mailing,
applicant, contractor, note, appraiser, raw-source, or private-service fields.
It makes no FastAPI, Portal, OAuth, or sign-in request.

Local and Enterprise use the same `/api/v1/master-data/datasets` contract.
The verified Local snapshot on 2026-08-20 contained 110,017 parcels, 64,426
permits, 110,093 address records, 3,438 zoning features, 7,712 flood features,
and 35 school zones. Counts are source observations, not hard-coded catalog
requirements.

## Permit to parcel relationship

`permits_to_parcels` is the only V1B relationship. It preserves every permit,
preserves multiple parcel matches as separate output rows, and leaves unmatched
permits in the result. Attaching geometry copies only governed parcel geometry;
it does not change the authoritative sources.

The Demo fixture intentionally has 30 source permits, 24 matched permits, 6
unmatched permits, an 80% match rate, and 31 output rows because one permit has
two governed parcel matches. Joined GeoJSON keeps all 31 Features: the six
unmatched Features have `geometry: null` and the map renders the 25 non-null
matched geometries. The 2026-08-20 Local observation
was 64,426 source permits, 64,231 matched, 195 unmatched, a 99.7% match rate,
and 67,277 output rows.

## Preview, lineage, and exports

- Preview is explicitly triggered, field-selectable, filterable, sortable, and
  paginated at 25, 50, or 100 rows.
- Spatial previews use the existing CFS ArcGIS runtime and OpenStreetMap/same-
  origin fallback boundary. They do not introduce a private ArcGIS service.
- Every preview reports source datasets, query time, selected fields, filter
  field/operator pairs without values, relationship, geometry source, and
  input/match/output counts.
- Demo XLSX is a real minimal OOXML workbook created with the ZIP capability
  already bundled by `@arcgis/core`. String cells are inline strings, so values
  beginning with `=`, `+`, `-`, or `@` cannot become formulas. CSV applies the
  corresponding spreadsheet-formula prefix guard.
- GeoJSON is offered only for native spatial datasets or the permit join with
  `attach_geometry: true`.

## Focused checks

Static Demo contract, fixture safety, type parity, join arithmetic, spatial
bounds, UI test IDs, and export wiring:

```powershell
npm.cmd run check:master-data-v1b
```

With the already-running Local FastAPI service on loopback, the same check also
probes all six catalog entries, preview/pagination, the real join, and narrow
CSV/XLSX/GeoJSON exports. It opens the XLSX ZIP and verifies its workbook and
worksheet XML; checking only the filename or MIME type is not accepted.

```powershell
npm.cmd run check:master-data-v1b-local
```

The full Portfolio Demo browser check covers catalog search, field selection,
filtering, two-page Permit preview, join statistics, lineage, map preview,
CSV/XLSX/GeoJSON downloads, null-geometry retention, formula hardening, and the
zero-backend-request invariant:

```powershell
npm.cmd run check:demo-functionality
npm.cmd run check:demo-interactions
```

## Vercel deployment safety

The ignored local `.vercel/project.json` links this directory to the existing
Vercel project `cabarrus-future-scape`. There is intentionally no deploy script
in `package.json`, so a validation command cannot accidentally deploy.

Do not deploy until the Demo build and both Demo checks above pass and a human
separately authorizes production deployment. Confirm Vercel production uses
`NEXT_PUBLIC_CFS_DEPLOYMENT_MODE=demo` and
`NEXT_PUBLIC_USE_BACKEND_API=false`; Portfolio Demo must not contain a backend
API base URL. Once authorized, the linked-project command is:

```powershell
npx vercel deploy --prod --yes --token $env:VERCEL_TOKEN
```

This command was documented but not run for V1B. Never commit `.vercel`, a
token, or provider output.
