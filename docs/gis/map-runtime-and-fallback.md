# Map Runtime And Fallback

## Renderer sequence

1. Mount the same-origin SVG context map immediately.
2. Load county boundary, municipalities, roads, hydrography, place labels, and
   available CFS overlays.
3. Initialize ArcGIS MapView progressively above that context.
4. Cross-fade to ArcGIS only after `view.when()` succeeds.
5. Keep the context map mounted if runtime, WebGL, worker, WASM, localization,
   online basemap, or view initialization fails.

The guaranteed map requires no Esri key and no external service.

## States

The map publishes `data-map-renderer-state` as:

- `loading_context`
- `loading_interactive`
- `interactive_ready`
- `degraded_static`
- `fatal`

`degraded_static` is usable. It shows a small `Static Map Mode` status and
`Retry interactive map`. A blocking error is reserved for the case where the
same-origin context itself is unavailable.

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
