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
2. Point out that Overview is now the safe-use landing page: what CFS is, what
   it can do today, what remains internal research, what data is still needed,
   and what not to overclaim.
3. Click `Go to Workspace`.
4. Point out the `CFS Workspace Center`: Explore Countywide, Indicator Center,
   and Model Lab. Workspace now uses fixed, recommended layouts rather than
   local dashboard customization.
5. Use the global search bar to search for `CFS-PARCEL-0149726579`.
6. Select the parcel and show the active map focus.
7. Point out the selected parcel cage or boundary highlight.
8. Click `Explore Countywide` and explain that this is the layer-first
   workspace for advanced map controls and countywide indicators.
9. Click `Indicator Center` and explain that it is the deployable full-width
   map-free Mission Control dashboard: Critical Signals, Monitoring Charts,
   Priority Issues Board, School Capacity Watch drilldowns, and
   data gaps from existing CFS context without showing made-up numbers or
   official risk scores. Indicator details open in the dashboard drawer instead
   of a right-side Intelligence panel.
10. Click `Model Lab` and show that the left rail becomes Model Lab Controls,
   the map enters safe research mode, and the right rail shows Model Lab
   Intelligence.
11. Click `Save Snapshot` from the Workspace action area to capture the active
   intelligence context and show the saved confirmation. Indicator Center
   snapshots do not require a map image.
12. Open `Planning Snapshot`.
13. Use the `Planning Snapshot Library` to show saved snapshots, thumbnails,
   Use, Rename, and Delete.
14. Point out the map snapshot, legend, north arrow, scale note, active layers,
   and selected parcel context.
15. Use the Report Builder checkboxes to choose report sections. Leave `Explain
   the Numbers` off for the concise executive report, then turn it on briefly
   to show optional source/caveat cards.
16. Save a local Report Draft, reload it, and explain that drafts preserve the
   snapshot plus selected report sections.
17. Use the Executive Report Preview to show that the report is generated from
   the saved snapshot.
18. Point out the `Print Report` action.
19. Open `Methodology`.
20. Explain Model Lab, model safety, missing data, and what is not
   public-facing.

## Suggested Talking Points

### Opening

"Cabarrus FutureScape brings parcel, zoning, permits, flood, school,
transportation, and model-governance context into one planning intelligence
prototype. Overview explains the system; Workspace is where the live map and
parcel review happen. The goal is not to automate decisions. The goal is to
make parcel due diligence faster, clearer, and easier to explain."

### Parcel Search

"The global search is the main parcel entry point. Staff can search by parcel
ID, PIN, owner, address, subdivision, or neighborhood from any page. Selecting a
parcel opens Workspace, focuses the map, and hydrates the selected parcel from
the local FastAPI and PostGIS stack."

### Map Focus

"When a parcel is selected, the map focuses on it and shows a parcel cage or
boundary highlight. This keeps the visual workflow tied to the same selected
parcel used to create the Planning Snapshot."

### Planning Snapshot

"Planning Snapshot is the saved review context. It captures the selected
parcel when available, active layer context, map snapshot
when available, caveats, and selected report sections so the report is based on
a deliberate saved view instead of a loose screen of numbers. Report Drafts save
the current section selections for later editing or printing."

### Executive Summary

"The Executive Summary is not another dataset or another model. It is generated
from the saved Planning Snapshot and formatted as a print-ready planning memo.
The map image is included when SceneView screenshot capture succeeds. `Print
Report` sends only the report preview to print, without the dashboard controls."

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

### Model Lab

"Model Lab is a safe internal research preview inside Workspace. It uses Model
Lab controls, a Development Research Signal overlay, and aggregate-only Model
Lab Intelligence. The optional overlay is off by default. When enabled, it
shows relative research bands and driver context; it does not publish parcel
probabilities, hidden model outputs, or official parcel prediction classes."

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
