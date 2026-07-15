# CFS Investment Guided Experience

CFS Investment now defaults to a guided workflow:

- Home: task cards, natural-language start, recent work, shortlist, readiness summary.
- Find: guided search flow for areas, parcels, and opportunity references.
- Analyze: one property workspace with Summary, Property, Market, Constraints, Financial, Due Diligence, and Sources tabs.
- Compare: side-by-side tradeoffs.
- Projects: engagements, criteria, shortlists, and Candidate Intake handoff.
- Reports: Report Studio and Report Bucket.
- More: source methodology and advanced tools.

Advanced tools remain available through More and contextual actions. The default UI uses progressive disclosure: essential inputs and result explanations appear first; detailed filters, source evidence, and advanced assumptions stay collapsed until requested.

My Shortlist, Recent Work, and Saved Searches are persistent backend workspace records:

- `investment_saved_item` stores safe references to areas, parcels, opportunities, intake candidates, scenarios, reports, or engagements.
- `investment_recent_work` stores the latest useful analyst work items, capped at 50 records.
- `investment_saved_search` stores guided or advanced search criteria so users can rerun a search or convert it into a Project.

The browser stores only low-risk display preferences such as Guided versus Advanced view and the last selected Investment page. It does not store authoritative shortlist, recent-work, search, parcel, or scenario records.

Safety language remains unchanged: CFS Investment is screening-level research, not financial guidance, not an appraisal, not utility confirmation, and not a guarantee of future value.
