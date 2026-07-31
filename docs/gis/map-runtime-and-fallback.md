# Map Runtime And Fallback

## Public demo

1. Mount the same-origin SVG context map immediately.
2. Load county boundary, municipalities, roads, hydrography, and place labels
   before optional analytical overlays.
3. Do not load ArcGIS unless `NEXT_PUBLIC_CFS_DEMO_INTERACTIVE_MAP=true` was
   explicitly set at build time.

The guaranteed map requires no Esri key and no external service.

## Local live mode

ArcGIS loads progressively above the same-origin map. The interactive surface
stays transparent until the view is ready, has valid dimensions and extent,
has finished updating, contains expected layers, and produces a nonblank pixel
sample. A later fatal, rendering, or map-content error reveals the still-mounted
vector map.

## States

The map publishes `data-map-renderer-state` as:

- `static_loading`
- `static_ready`
- `interactive_loading`
- `interactive_ready`
- `static_degraded`
- `fatal`

It also publishes `data-map-renderer`, `data-static-context-ready`,
`data-interactive-ready`, and `data-map-fatal`. `static_degraded` is usable and
shows only a small enhancement notice. A blocking error is reserved for the
case where the same-origin context itself is unavailable.

Retry increments the renderer attempt while leaving context visible. Effect
cleanup cancels stale initialization, listeners, watches, layers, and views so
an old failure cannot replace a newer renderer or update an unmounted route.

## Static interactions

The fallback preserves zoom in/out, county reset, selected parcel focus,
legends, and development, flood, school, and Model Lab overlays. ArcGIS adds
pan, hit testing, and richer graphics when available.

## Assets and validation

The build copies required same-origin geometry WASM, workers, libtess WASM, and
Zoom localization assets. `npm run check:map-resilience` verifies clean,
slow-asset, failed-asset, WebGL-off, external-blocked, mobile, retry,
route-return, refresh, controls, nonblank context, request-loop, console, and
required-asset behavior.
