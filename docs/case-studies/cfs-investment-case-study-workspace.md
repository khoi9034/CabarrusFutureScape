# CFS Investment Case Study Workspace

CASE-2 makes case studies a first-class workspace under CFS Investment Projects.

## Architecture

- A case study is a specialized Investment Engagement/Project, not a separate project system.
- `investment_case_study` stores only case-study metadata, the source package snapshot, preserved user state, and activity history.
- Criteria, shortlists, saved items, saved searches, underwriting scenarios, report references, Report Bucket records, and Recent Work stay in the existing Investment workspace tables.
- The first package is `case-studies/large-development-land/case-study.json`, validated against `config/investment_case_study_schema.json`.

## Sync

Run from `C:\CabarrusFutureScape\backend` with process-only database settings:

```powershell
python -m app.scripts.sync_investment_case_studies --case-study large-development-land --dry-run --target local
python -m app.scripts.sync_investment_case_studies --case-study large-development-land --target local
```

The sync validates referenced package files, rejects restricted fields and credential-like text, upserts the linked Engagement, upserts shortlist references, attaches deliverable references, records Recent Work, and preserves user-edited state. It does not modify `backend.env` and does not write to Azure.

## Safety

The workspace is screening-level research only. It is not investment advice, not an appraisal, not utility service or capacity confirmation, not legal entitlement advice, and not professional environmental diligence.

Do not include owner names, mailing addresses, grantor or grantee names, raw WSACC records, raw model scores, exact probabilities, credentials, tokens, or database URLs. The Excel underwriting workbook remains `Not Started` until assumptions are reviewed.
