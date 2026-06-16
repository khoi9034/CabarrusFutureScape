# CFS Demo Walkthrough

Use this walkthrough for a clean local demo of Cabarrus FutureScape as an
internal planning intelligence prototype.

## Start Local CFS

From the project root:

```powershell
cd C:\CabarrusFutureScape
npm run dev:cfs
```

Expected local URLs:

- Frontend: `http://localhost:3000`
- Backend root: `http://127.0.0.1:8000`
- FastAPI docs: `http://127.0.0.1:8000/docs`
- Health check: `http://127.0.0.1:8000/health`

For UI testing, use `http://localhost:3000`. Avoid
`http://127.0.0.1:3000` because Next dev HMR origin protection can make the
page look loaded while leaving it less interactive.

Demo parcel:

- `CFS-PARCEL-0149726579`

## Recommended Demo Sequence

1. Open `Overview`.
2. Point out the `CFS Command Center`: Search Parcel, Countywide Intelligence,
   Save Snapshot, and Open Snapshots.
3. Search for `CFS-PARCEL-0149726579`.
4. Select the parcel and show the active map focus.
5. Point out the selected parcel cage or boundary highlight.
6. Click `Save Snapshot` from Overview.
7. Open `Planning Snapshot`.
8. Use the `Planning Snapshot Library` to show saved snapshots, thumbnails,
   Use / Open, and Delete.
9. Use `Snapshot Overview` to explain the saved command context, active layers, and map
   snapshot capture status.
10. Use `Explain the Numbers` to show source, method, caveat, and action for
   the major metrics.
11. Open `Executive Summary` and show that the report is generated from the
   saved snapshot.
12. Point out the `Print Executive Summary` action.
13. Open `Review Actions` and summarize staff follow-up items.
14. Open `Methodology`.
15. Explain model safety, missing data, and what is not public-facing.

## Suggested Talking Points

### Opening

"Cabarrus FutureScape brings parcel, zoning, permits, flood, school,
transportation, and model-governance context into one review workspace. The
goal is not to automate decisions. The goal is to make parcel due diligence
faster, clearer, and easier to explain."

### Parcel Search

"The top search is the main entry point. Staff can search by parcel ID, PIN,
owner, address, subdivision, or neighborhood, then CFS hydrates the selected
parcel from the local FastAPI and PostGIS stack."

### Map Focus

"When a parcel is selected, the map focuses on it and shows a parcel cage or
boundary highlight. This keeps the visual workflow tied to the same selected
parcel used to create the Planning Snapshot."

### Planning Snapshot

"Planning Snapshot is the saved review context. It captures the selected
parcel when available, active layer context, map snapshot
when available, caveats, and explainable metrics so the report is based on a
deliberate saved view instead of a loose screen of numbers."

### Executive Summary

"The Executive Summary is not another dataset or another model. It is generated
from the saved Planning Snapshot and formatted as a print-ready planning memo.
The map image is included when SceneView screenshot capture succeeds. Print
Executive Summary sends that snapshot report to print."

### Flood

"Flood constraints are based on FEMA NFHL source geometry and parcel overlay
logic. The map separates parcel-based review markers from FEMA source polygons
so users can see both the review signal and the authoritative source layer."

### Schools

"School assignment is based on attendance-zone polygon overlap, not school
point distance. Utilization values are presentation-derived and clearly marked
as needing verification. Official capacity scoring is not active."

### Transportation and Utilities

"Transportation layers provide accessibility, STIP, and traffic context.
Utility information is proxy/context only and does not confirm service capacity
or allocation."

### Model Governance

"The current best internal model research variant is Zoning + Transportation +
Tax/Value. It is not production-ready. Exact probabilities and parcel-level
ranking classes are intentionally not exposed because calibration and
governance review are still required."

### Close

"The value of CFS today is transparent planning intelligence: one place to
review what is known, what needs follow-up, and which caveats matter before a
parcel moves further through review."

## Demo Safety Checklist

- Do not claim CFS makes entitlement decisions.
- Do not claim CFS predicts exact parcel development probability.
- Do not claim school utilization is official capacity.
- Do not claim utility proxy layers confirm capacity.
- Do not show parcel-level prediction probabilities or ranking classes.
- Keep Methodology open as the transparency and caveat workspace.
