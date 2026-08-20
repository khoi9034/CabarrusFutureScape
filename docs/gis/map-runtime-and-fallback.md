# Map Runtime And Fallback

## Normal runtime

ArcGIS MapView is the primary renderer in demo, local, and enterprise modes.
It starts with a custom `Basemap` made from the existing same-origin Cabarrus
county outline, municipality, hydrography, major-road, and place-label
graphics. It then loads the ArcGIS SDK `OpenStreetMapLayer` underneath that
context without a Portal item, API key, or ArcGIS sign-in. Once OpenStreetMap
is ready, its labels replace the local place labels while the same-origin
layers remain the required interactive fallback.

`NEXT_PUBLIC_CFS_BASEMAP_URL_TEMPLATE` may point Enterprise deployments to one
approved web-tile host using either `{z}/{x}/{y}` or
`{level}/{col}/{row}` placeholders. The URL must use HTTPS and must not contain
credentials, a query, a fragment, subdomain expansion, or any other template
tokens. `NEXT_PUBLIC_CFS_BASEMAP_ATTRIBUTION` supplies the provider attribution;
it defaults to `© OpenStreetMap contributors`. A failed visual basemap is
removed without destroying MapView; the same-origin context and local labels
remain interactive and a small nonblocking warning is shown.

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
pan, zoom, hit testing, layers, attribution, snapshot capture, route
restoration, mobile, slow-network, blocked external visual-basemap services,
and WebGL fallback/retry.
