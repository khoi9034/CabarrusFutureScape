# CFS Screenshot Checklist

Use parcel `CFS-PARCEL-0149726579` for all selected-parcel screenshots.

## Phase 18B Minimum Capture Set

Capture these screenshots for the leadership or portfolio package:

- Overview landing state.
- Parcel search result for `CFS-PARCEL-0149726579`.
- Active selected parcel map focus with parcel cage/boundary visible.
- Due Diligence parcel snapshot.
- High-Priority Review Flags.
- Flood, School, and Transportation cards.
- Executive Print header.
- Executive Print key findings.
- Methodology current best internal model section.
- Methodology feature governance and model safety section.

Do not include browser dev tools, console panels, exact model probabilities, or
parcel-level ranking classes in screenshots.

## 1. Overview Default Dashboard

What to show:

- Dark executive dashboard shell.
- 3D SceneView centered on Cabarrus County.
- Top parcel search visible.
- Left `Map Layers` rail collapsed or cleanly closed.
- Concise Overview workspace, not a debug/status page.

Expected visible labels:

- `Cabarrus FutureScape`
- `Overview`
- `Map Layers`
- `Active Overlays`

What to avoid:

- Console overlay or browser dev tools covering the app.
- Disabled legacy placeholders as if they are active layers.
- Any model probability or parcel-level ranking language.

Caveat to mention:

- Overview is the entry point for exploration; detailed evidence lives in Due Diligence and Methodology.

## 2. Top Parcel Search With Selected Parcel

What to show:

- Top search bar after searching `CFS-PARCEL-0149726579`.
- Search result selected.
- Selected parcel card updated with live parcel data.

Expected visible labels:

- `CFS-PARCEL-0149726579`
- parcel owner/account if available
- PIN or zoning context if available

What to avoid:

- Empty search dropdown.
- Static/mock-only parcel guidance.
- Browser network or console panels.

Caveat to mention:

- Search is API-backed in local demo mode and hydrates selected parcel detail.

## 3. Selected Parcel Active Overlay and Parcel Cage

What to show:

- Map focused on the selected parcel.
- Active selection overlay showing the selected parcel ID.
- 3D selected parcel cage/boundary highlight visible.

Expected visible labels:

- `CFS-PARCEL-0149726579`
- `Focused on map`
- `Parcel boundary highlighted` or equivalent focus status

What to avoid:

- Oversized focus marker covering the parcel boundary.
- Popup covering top-right map controls.
- Flood/FEMA/school layers turned on unless they are the screenshot subject.

Caveat to mention:

- The cage is a selected-parcel focus aid, not a permanent parcel layer.

## 4. Due Diligence Parcel Summary

What to show:

- Due Diligence mode with selected parcel summary.
- Parcel characteristics, zoning, development activity, permit events, flood, and school cards.

Expected visible labels:

- `Due Diligence`
- `Selected Parcel`
- `Development Activity`
- `Permit Events`
- `Flood Constraints`
- `School Assignment`

What to avoid:

- No-selected-parcel empty state.
- Selected-parcel panels stuck on loading.
- Any school score shown as `0`.

Caveat to mention:

- Due Diligence is descriptive evidence review, not an automated decision.

## 5. Flood Constraints Layer

What to show:

- `Flood Constraints` layer toggled on.
- High-review parcel markers visible.
- A clicked marker card or selected parcel flood summary if practical.

Expected visible labels:

- `Flood Constraints`
- `FEMA NFHL`
- `High-review only`
- `Engineering Review Recommended` or flood review language where available

What to avoid:

- Rendering all parcels.
- Treating flood markers as final engineering determinations.

Caveat to mention:

- Flood Constraints are parcel overlay intelligence derived from FEMA NFHL regulatory polygons.

## 6. FEMA Flood Zones Layer

What to show:

- `FEMA Flood Zones` toggled on.
- Transparent FEMA NFHL polygons visible with legend.
- Basemap, buildings, and roads still readable.

Expected visible labels:

- `FEMA Flood Zones`
- `Floodway`
- `SFHA`
- `Moderate`
- `Minimal`

What to avoid:

- Confusing FEMA source polygons with parcel review markers.
- Fully opaque polygons hiding the map.

Caveat to mention:

- FEMA Flood Zones are source/reference polygons; Flood Constraints are parcel-based review markers.

## 7. School Utilization Seed Layer With Hover/Click Detail

What to show:

- `School Utilization Seed` toggled on.
- Attendance-zone polygons colored by presentation-derived utilization.
- Hover or click detail if feasible.

Expected visible labels:

- `School Utilization Seed`
- `Presentation-derived`
- `Needs verification`
- `Capacity Data Needed`

What to avoid:

- Calling the values official enrollment/capacity.
- Using `overcrowded` as an unqualified claim.
- Suggesting school capacity scoring is active.

Caveat to mention:

- Utilization values are manually read from SY 2024-2025 planning maps and must be verified against official school data.

## 8. Methodology Model Transparency Page

What to show:

- Methodology mode.
- Model foundation, active data inputs, assumptions, and limitations.

Expected visible labels:

- `Methodology`
- `CFS Model Foundation and Data Transparency`
- `Internal only`
- `Not scored`
- `FEMA NFHL`

What to avoid:

- Map-only screenshot that hides the transparency content.
- Any parcel-level prediction output.

Caveat to mention:

- Methodology explains how CFS joins records and where model boundaries remain.

## 9. Development Prediction Research Status Section

What to show:

- `Development Prediction Research Status` card in Methodology.
- Aggregate ranking distribution only.
- Internal model comparison metrics.
- Safety flags.

Expected visible labels:

- `Internal research only`
- `Prediction probabilities: Not available`
- `Public exposure: Not allowed`
- `Aggregate ranking classes`
- `model_active=false`
- `prediction_probability_available=false`
- `production_ready=false`
- `public_exposure_allowed=false`

What to avoid:

- Parcel IDs.
- Exact probabilities.
- Parcel-level ranking classes.
- Production-ready wording.

Caveat to mention:

- Ranking research improved internal QA metrics, but weak calibration prevents public probability display.

## 10. Executive Print Mode

What to show:

- Executive Print mode with report-style summary.
- Selected parcel evidence blocks if a parcel is selected.
- Clear caveats around flood, school, and model status.

Expected visible labels:

- `Executive Print`
- `Selected Parcel`
- `Development`
- `Constraints`
- `Permit Events`

What to avoid:

- Empty report state.
- Exact prediction probabilities.
- Claiming print export is final production PDF generation.

Caveat to mention:

- Executive Print is a demo/report preview surface; automated export packaging remains future work.

## 11. Map Fullscreen Mode

What to show:

- Fullscreen or focused map exploration mode.
- Left layer rail available.
- Right/bottom panels reduced so the map is central.

Expected visible labels:

- `Map Layers`
- `Layers` rail label if collapsed
- map controls unobstructed

What to avoid:

- Intelligence panel covering map controls.
- Bottom KPI strip dominating the fullscreen view.

Caveat to mention:

- Fullscreen mode is for map exploration and layer inspection.

## 12. Layer Rail Collapsed State

What to show:

- Left layer rail collapsed to a slim rail.
- The word `Layers` visible.
- No clipped layer-card text.

Expected visible labels:

- `Layers`

What to avoid:

- One-letter badges or unreadable clipped labels.
- Hidden text bleeding out of the collapsed rail.

Caveat to mention:

- The rail can be expanded for operational layer toggles and collapsed for map exploration.
