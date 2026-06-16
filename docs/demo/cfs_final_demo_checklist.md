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
- Confirm Overview shows the `CFS Command Center`.
- Confirm the left `Layers` rail starts collapsed/slim.
- Search for `CFS-PARCEL-0149726579`.
- Confirm the selected parcel appears in the Active Selection overlay.
- Click `Save Snapshot`.
- Open Planning Snapshot and confirm the Planning Snapshot Library appears.
- Confirm map snapshot appears, or a clean map-unavailable message appears.
- Open Executive Summary from inside Planning Snapshot.
- Open Methodology.
- Confirm no parcel-level prediction probabilities appear.
- Confirm no parcel-level ranking classes appear.

## During Demo

- Start with Overview and parcel search.
- Use the Command Center to frame the workflow: Search Parcel, Countywide
  Intelligence, Save Snapshot, and Open Snapshots.
- Select `CFS-PARCEL-0149726579`.
- Show the map focus and selected parcel context.
- Use Countywide Intelligence to open advanced layer/indicator controls.
- Save a Planning Snapshot for the selected parcel or map context.
- Open Planning Snapshot and walk through the saved snapshot library and what
  was captured.
- Open Explain the Numbers and show source/method/caveat/action cards.
- Show zoning, development, flood, school, transportation, and utility context.
- Open Executive Summary and show that it is generated from the saved snapshot.
- Point out the Print Executive Summary action.
- Open Methodology and explain model safety and missing data.
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
