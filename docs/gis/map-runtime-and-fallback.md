# Map Runtime And Fallback

## Normal runtime

ArcGIS MapView is the primary renderer in demo, local, and enterprise modes.
It starts with a custom `Basemap` made from the existing same-origin Cabarrus
county, municipality, hydrography, major-road, and place-label graphics. It
then adds the public World Dark Gray Canvas base and reference-label cached
services directly by URL, without a Portal item, API key, or ArcGIS sign-in.
These direct services restore the original dark-gray street and place context
while the same-origin layers remain the required interactive fallback.

`NEXT_PUBLIC_CFS_REFERENCE_BASEMAP_URL` and
`NEXT_PUBLIC_CFS_REFERENCE_LABELS_URL` may point Enterprise deployments to
approved public or organization-hosted cached map services. They must not
contain credentials. A failed reference service is removed without destroying MapView;
the neutral same-origin context remains interactive and shows a small,
nonblocking warning.

The SVG renderer mounts underneath MapView while the SDK loads. MapView becomes
visible and receives pointer input only after it reports `ready`, has a valid
extent and nonzero dimensions, finishes its initial update, creates the required
layer views, and produces a nonblank screenshot. A later fatal, rendering, or
map-content error immediately reveals the still-mounted SVG fallback.

## States

The map publishes `data-map-renderer-state` as:

- `static_loading`
- `static_ready`
- `interactive_loading`
- `interactive_ready`
- `static_degraded`
- `fatal`

It also publishes `data-map-renderer`, `data-static-context-ready`,
`data-interactive-ready`, `data-map-view-ready-state`, and `data-map-fatal`.
`static_degraded` is reserved for a genuine ArcGIS/WebGL failure and offers one
user-controlled retry. A blocking error is reserved for the case where both
ArcGIS and the required same-origin context are unavailable.

Retry increments the renderer attempt while leaving context visible. Effect
cleanup cancels stale initialization, listeners, watches, layers, and views so
an old failure cannot replace a newer renderer or update an unmounted route.

## Emergency fallback

The fallback preserves zoom in/out, county reset, selected parcel focus,
legends, and development, flood, school, and Model Lab overlays. During normal
operation it is opacity zero with pointer events disabled; ArcGIS owns pan,
wheel and touch zoom, keyboard navigation, hit testing, parcel selection, and
snapshot capture.

## Assets and validation

Every build copies the complete installed `@arcgis/core/assets` tree to the
versioned `/arcgis-assets/<sdk-version>` path. The generated manifest records
the SDK version, every path, byte size, SHA-256 checksum, and generation time;
`npm run check:arcgis-assets` fails if source, copy, or manifest differs. The
versioned tree may be cached immutably without keeping incompatible worker
chunks after an SDK upgrade.

`npm run check:interactive-map` proves primary rendering, local assets, paint,
pan, zoom, hit testing, layers, snapshot capture, route restoration, mobile,
slow-network, blocked external Esri services, and WebGL fallback/retry.

## Optional hosted Esri basemap

Set `NEXT_PUBLIC_CFS_ESRI_BASEMAP_ENABLED=true`, provide a browser-safe
`NEXT_PUBLIC_CFS_ESRI_API_KEY`, and optionally set
`NEXT_PUBLIC_CFS_ESRI_BASEMAP_STYLE`. MapView first becomes interactive with the
same-origin basemap, then loads the hosted style underneath it. A timeout or
hosted-service error leaves the local interactive map unchanged. All
`NEXT_PUBLIC_` values are visible in the browser, so restrict the key to the
deployed HTTPS origins and only the basemap services it needs; never use a
server credential here.
