# CFS Presentation Runbook

Use this runbook for the CFS Planning and CFS Economics presentation.

## Startup

From `C:\CabarrusFutureScape`:

```powershell
npm run dev:cfs
```

Local URLs:

- Frontend: http://localhost:3000
- Backend: http://127.0.0.1:8000
- API docs: http://127.0.0.1:8000/docs

Presentation checks:

```powershell
npm run check:presentation
cd C:\CabarrusFutureScape\backend
python -m app.scripts.check_cfs_ai
```

The AI diagnostic reports whether OpenAI is configured and whether CFS used provider enhancement or deterministic fallback. It does not print the API key.

## Demonstration Sequence

### CFS Planning

1. Open Planning Overview.
2. Explain that CFS combines parcel, permit, infrastructure, environmental, school, and service-pressure evidence for planning review.
3. Go to Workspace.
4. Show the existing map and panel structure.
5. Open Explore Countywide.
6. Open Indicator Center and show:
   - Development Activity
   - Infrastructure and Access
   - Environmental Constraints
   - Schools and Public Services
   - Data Readiness
7. Ask CFS:
   - `What are the main permit trends?`
   - `Which school areas need review?`
8. Open Model Lab and describe it as internal research only.
9. Open Planning Snapshot and show how findings are summarized for reporting.

Planning talk track:

- "CFS Planning is a screening and coordination layer for countywide planning questions."
- "Observed permit activity is not a prediction."
- "School pressure is a preliminary planning review signal, not an official enrollment forecast."
- "Model Lab does not expose exact probabilities or production approval decisions."

### CFS Economics

1. Open Economic Intelligence.
2. Start with Executive Brief.
3. Explain: "CFS Economics is the economic-analysis side of CFS. It connects parcel value, land utilization, growth, constraints, infrastructure, and public-service burden."
4. Open Economic Dashboard and show each presentation segment:
   - Executive Pulse
   - Land Economics
   - Scenario Burden
   - Data Confidence
5. Ask CFS:
   - `Summarize the county economic condition.`
   - `What does value per acre tell me?`
6. Use Reset Filters before moving on if slicers were changed.

Economics talk track:

- "Compare value per acre inside similar segments, not across every property type at once."
- "Special assets should be separated from ordinary parcel peers."
- "CFS Economics is not an appraisal, tax bill, fiscal impact study, or project approval recommendation."

### Power BI & Tools

1. Open Power BI & Tools.
2. Show the four workflow tabs:
   - Report Builder
   - Data Tables
   - Land Screener
   - Report Bucket
3. In Report Builder, ask CFS:
   - `Build me a Power BI report.`
4. Click `Apply AI Plan`.
5. Review the generated report title, purpose, visuals, filters, and build order.
6. Save the plan or report to the Report Bucket.
7. In Data Tables, show the Power BI-ready tables, row counts, and field structure.
8. In Land Screener, explain that parcel review candidates are for manual due diligence, not purchase recommendations.
9. In Report Bucket, send selected items to Print.

Power BI talk track:

- "CFS configures a report plan and report canvas inside CFS. It does not call Power BI APIs or require external credentials."
- "Only safe fields are exported. Owner, mailing, raw scores, and exact probabilities are excluded."

## Recovery Steps

### If OpenAI Is Unavailable

Use the deterministic fallback. Ask CFS should still return a grounded answer with evidence and recommended actions.

Say:

"OpenAI enhances wording when available. The CFS data context and deterministic analysis remain available locally."

Run:

```powershell
cd C:\CabarrusFutureScape\backend
python -m app.scripts.check_cfs_ai
```

### If The Backend Stops

Run:

```powershell
cd C:\CabarrusFutureScape
npm run dev:cfs
```

Then verify:

```powershell
npm run check:presentation
```

### If A Stale Process Holds A Port

The startup script identifies and stops CFS local dev processes on ports 3000 and 8000. If a non-CFS process is holding a port, stop it manually only after confirming it is safe.

Manual checks:

```powershell
Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue
Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
```

### If Data Is Slow On First Load

Prewarm:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health
Invoke-RestMethod http://127.0.0.1:8000/health/database
Invoke-RestMethod http://127.0.0.1:8000/indicators/intelligence
Invoke-RestMethod http://127.0.0.1:8000/economics/intelligence
Invoke-RestMethod http://127.0.0.1:8000/economics/powerbi-export
Invoke-RestMethod http://127.0.0.1:8000/ai/status
```

## Emergency Fallback Demo

If live Ask CFS or the database becomes unavailable:

- Use cached or deterministic Ask CFS response.
- Use the already loaded Economics dashboard.
- Use a previously generated Report Bucket item.
- Use Print preview.
- Explain that OpenAI enhances wording, but CFS data and deterministic analysis remain available when the provider is unavailable.

## Safe Language

Use:

- Screening-level planning intelligence
- Observed permit activity
- Preliminary school capacity watch
- Sewer proximity proxy
- Utility-readiness proxy
- Data confidence
- Manual due diligence required

Avoid:

- Official appraisal
- Official tax bill
- Official prediction
- Guaranteed return
- Will develop
- Confirmed utility capacity
- Transaction, acquisition, or financial advice
- Project approval recommendation
