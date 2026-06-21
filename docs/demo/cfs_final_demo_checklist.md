# CFS Final Demo Checklist

## Before Demo

- Confirm the branch is `main`.
- Confirm worktree is clean except known local ignored logs, or clearly
  understand any uncommitted demo work.
- Start local CFS:

```powershell
npm run dev:cfs
```

- Confirm frontend returns 200 at `http://localhost:3000`.
- Confirm backend returns 200 at `http://127.0.0.1:8000`.
- Confirm `GET /health` returns 200.
- Confirm `GET /health/database` returns 200.
- Use `http://localhost:3000` for the browser demo.
- Do not use `http://127.0.0.1:3000` for frontend testing.
- Confirm top nav shows `Overview`, `Workspace`, `Planning Snapshot`, and
  `Methodology`.
- Confirm Overview shows the landing/safe-use page and does not render the map
  workspace.
- Click `Go to Workspace` and confirm Workspace shows the `CFS Workspace
  Center`.
- Confirm the left `Layers` rail starts collapsed/slim.
- Confirm no dashboard customization controls or edit handles are visible.
- Confirm Workspace mode cards are `Explore Countywide`, `Indicator Center`,
  and `Model Lab`.
- Confirm `Search Parcel` and `Snapshot Builder` are not Workspace mode cards.
- Use the global search and confirm selected parcel intelligence appears in
  Workspace.
- Click `Explore Countywide` and confirm the left rail stays collapsed until
  opened, then shows layer controls without clipping.
- Click `Indicator Center` and confirm it renders a full-width map-free
  enterprise Mission Control dashboard with no SceneView, no left layer rail, no
  right Intelligence panel, Critical Signals, Monitoring Charts,
  Priority Issues Board, School Capacity Watch drilldowns, data
  readiness, existing CFS context, and no made-up numbers or official risk
  scores.
- Click `Model Lab` and confirm the left rail shows Model Lab Controls, the
  right rail shows Model Lab Intelligence, and the research overlay is off by
  default.
- Search for `CFS-PARCEL-0149726579`.
- Confirm the selected parcel appears in the Active Selection overlay.
- Click `Save Snapshot` from Workspace and confirm the saved confirmation.
- Open Planning Snapshot and confirm the Planning Snapshot Library appears.
- Confirm map snapshot appears, or a clean map-unavailable message appears.
- Confirm Report Drafts can save and reload report section selections.
- Confirm `Explain the Numbers` is off by default and optional.
- Confirm `Print Report` is visible near the top.
- Review the Executive Report Preview from inside Planning Snapshot.
- Open Methodology.
- Confirm no parcel-level prediction probabilities appear.
- Confirm no parcel-level ranking classes appear.

## During Demo

- Start with Overview as the landing/safe-use page.
- Use `Go to Workspace` and the Workspace Center to frame the workflow:
  Explore Countywide, Indicator Center, and Model Lab.
- Select `CFS-PARCEL-0149726579`.
- Show the map focus and selected parcel context.
- Use Explore Countywide to open advanced layer/indicator controls.
- Show Indicator Center as a full-width map-free Mission Control dashboard with
  Critical Signals, Monitoring Charts, Priority Issues Board, School Capacity Watch
  Inspect drawer, and no fake data.
- Use Model Lab to explain aggregate-only development model research and why
  exact parcel probabilities stay hidden.
- Save a Planning Snapshot for the selected parcel or map context from
  Workspace.
- Open Planning Snapshot and walk through the saved snapshot library and what
  was captured.
- Save and load a Report Draft to show section selections persist locally.
- Toggle Explain the Numbers only when you want to show concise source/caveat
  explanation cards.
- Show zoning, development, flood, school, transportation, and utility context.
- Show the Executive Report Preview and explain that it is generated from the
  saved snapshot.
- Point out the Print Report action.
- Open Model Lab and Methodology to explain model safety and missing data.
- Mention caveats honestly before discussing future work.

## Do Not Say

- "Production-ready prediction."
- "Exact probability."
- "This parcel will develop."
- "Official school capacity score."
- "Confirmed school overcrowding."
- "Confirmed utility capacity."
- "Automated entitlement decision."

## Approved Language

- "Internal planning intelligence prototype."
- "Parcel-based due diligence workflow."
- "Evidence review and constraint screening."
- "Internal model research only."
- "No public parcel-level predictions."
- "Utility context is proxy-only."
- "School utilization requires verification."

## After Demo

- Keep `docs/demo/cfs_what_not_to_claim.md` available for follow-up questions.
- Direct technical reviewers to `docs/demo/cfs_7_minute_technical_demo_script.md`.
- Direct leadership reviewers to `docs/demo/cfs_leadership_brief.md`.
- Capture screenshots using `docs/demo/cfs_final_screenshot_plan.md` if a
  presentation deck or portfolio page is being prepared.
