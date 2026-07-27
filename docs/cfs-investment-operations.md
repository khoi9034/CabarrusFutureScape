# CFS Investment Operations

## One-command startup

From `C:\CabarrusFutureScape`:

```powershell
npm run dev:cfs
```

Expected local URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://127.0.0.1:8000`
- API docs: `http://127.0.0.1:8000/docs`

The startup script checks ports `3000` and `8000`, stops only local CFS dev processes that are holding those ports, starts FastAPI from `backend`, starts Next.js from the repo root, and checks database health. It should not print environment values.

## Restart procedure

Use the same command:

```powershell
npm run dev:cfs
```

If a non-CFS process owns a required port, the script stops and reports the PID instead of killing it. Close that app manually or move it to another port.

## Enter CFS Investment

Open CFS Economics, use the lower-right `CFS Investment` entry, and enter the local demo code when prompted. The gate is a local convenience gate only. Production authentication is not enabled.

For localhost sessions, successful access is remembered only for the current browser session or short local period.

## Daily analyst flow

1. Open CFS Investments Home.
2. Use Find Sites to load screening criteria or add an external opportunity.
3. Choose `Review Property`.
4. Review Property Review tabs: Summary, Property, Market, Constraints, Financial, Due Diligence, Sources.
5. Add useful candidates to the active project.
6. Compare two to four candidates from the project shortlist when needed.
7. Review assumptions from the active-property menu or project underwrite step.
8. Generate a report from the active project, property review, comparison, or saved scenario.
9. Save useful outputs to Supporting Exhibits and print from the report workflow.

## Adding an opportunity

Use Find Sites -> Add External Opportunity. Enter only available source context such as asking price, asking date, source name, and source URL. Do not enter private identity or contact fields.

## Data status

CFS Investments Home includes a compact System Status line. Data & Methods covers parcels, economics, ACS, FEMA, NWI, terrain, soils, EPA, transportation, utility proxies, comparable context, opportunity references, and workspace records.

Refresh actions are available only where an existing refresh service exists. Refresh failures must preserve last-good data.

## Supported refresh commands

Run only when needed and after confirming local database connectivity:

```powershell
cd C:\CabarrusFutureScape\backend
python -m app.scripts.refresh_investment_acs
python -m app.scripts.refresh_investment_environmental --source summaries
```

## Known limitations

- CFS Investment is screening-level research, not investment advice.
- ACS context is area-level and does not prove parcel demand.
- WSACC evidence is sewer proximity and basin context only; service and capacity are not confirmed.
- Environmental context is mapped screening evidence and does not replace professional wetland, engineering, geotechnical, survey, zoning, utility, or environmental review.
- Underwriting outputs are scenario calculations from user-entered assumptions, not forecasts or guarantees.
- Opportunity references are not a complete listing inventory and must be verified at the source.

## Safety rules

Never present CFS Investment output as a purchase recommendation, appraisal, official valuation, utility or service confirmation, environmental clearance, development assurance, return assurance, or future-value assurance.

Use: screening-level review, due diligence required, CFS-derived proxy, analyst-entered assumption, recommended for additional diligence, verify with planning/utilities/engineering/legal/tax professionals.
