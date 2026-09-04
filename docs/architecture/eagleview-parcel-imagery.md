# EagleView parcel imagery

CFS treats EagleView/Pictometry as optional parcel enrichment. FastAPI owns the
provider boundary; the browser receives normalized availability metadata and
image bytes from CFS endpoints, never provider resource URLs or credentials.

Local or Enterprise backend configuration requires server-only
`CFS_EAGLEVIEW_API_KEY` and `CFS_EAGLEVIEW_SECRET_KEY`. An optional
`CFS_EAGLEVIEW_TIMEOUT_SECONDS` value defaults to 10 seconds. Keep these values
in `backend.env` or the deployment secret store, never in `NEXT_PUBLIC_*` or the
public Demo.

`GET /imagery/eagleview/parcel/{parcel_id}` reuses the parcel repository's
PostGIS `ST_PointOnSurface` WGS84 location and returns available north, south,
east, and west capture metadata. The corresponding `/image/{direction}` route
authenticates server-side and proxies a bounded 800x600 or 1600x1200 JPEG.
EagleView failure does not affect API readiness, parcel search, the planning
map, or other intelligence.

The public Demo makes no provider request and displays sanitized metadata with
a non-EagleView placeholder. A future approved imagery provider can implement
the small `ImageryProvider` protocol without changing Builder selection flow.
