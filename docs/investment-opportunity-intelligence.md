# CFS Investment Opportunity Intelligence

CFS Investment opportunity intelligence is a screening-level consulting workflow for finding search areas, organizing opportunity references, matching those references to CFS parcels, and preparing client or internal diligence work.

It is not financial guidance, an appraisal, a complete listing feed, a purchase recommendation, or a guarantee of future value.

## Source Modes

Opportunity sources are governed before use. The current source modes are:

- Approved API: disabled until a real access agreement and credentials exist.
- Public Government Feed: official public references, limited to metadata unless machine-readable terms allow more.
- Broker or MLS Export: analyst-provided export only, subject to license terms.
- CSV Import: user-provided private reference data.
- External Search Link: opens a source website in the browser; CFS does not scrape or synchronize results.
- Manual / Off-Market Lead: analyst-entered opportunity reference.

Current enabled official references:

- Cabarrus County Tax Foreclosures: official Tax Administration reference for foreclosure notices.
- North Carolina State Surplus Property: official state surplus-property reference.

Current external search references:

- Crexi
- LoopNet

External search references are browser links only. Listing availability and content must be verified on the source platform.

## Opportunity Normalization

Opportunity references are normalized into a common shape containing source, property type, listing status, asking basis where available, acreage, general location, parcel-match status, source URL, freshness, attribution, and storage policy.

CFS does not ingest owner names, mailing addresses, personal phone numbers, personal email addresses, or private broker contact data.

## Parcel Matching

Matching is attempted in this order when evidence is available:

1. Exact parcel ID
2. Normalized parcel ID
3. Point-in-polygon or coordinate match, when a valid point exists
4. Safe address or location match, when permitted
5. Spatial nearest parcel with verification flag
6. Manual match

Match statuses are qualitative:

- Matched
- Potential Match
- Multiple Possible Matches
- Unmatched
- Manual Verification Required

CFS does not silently select a parcel when the evidence is ambiguous.

## Area Opportunity Radar

Area Opportunity Radar groups existing CFS parcel evidence by available geography labels and classifies search areas qualitatively:

- Priority Search Area
- Strong Search Area
- Emerging Search Area
- Mixed Evidence
- Limited Current Signal
- Insufficient Information

The radar uses strategy-specific evidence ordering, but it does not change underlying factual evidence by strategy. It is a search aid, not a ranking guarantee and not a complete inventory of available properties.

## Engagement Workspace

Engagements organize a consulting brief, criteria matrix, shortlist, portfolio notes, and deliverables.

Criteria types:

- Must Have
- Preferred
- Informational
- Disqualifier
- Needs Verification

Shortlist statuses:

- Longlist
- Shortlist
- Needs Verification
- Client Review
- Removed
- Finalist for Further Diligence

Use “Recommended for additional diligence,” not “recommended purchase.”

## Underwriting Prefill

Smart prefill reduces manual underwriting setup by combining:

- CFS evidence
- CFS-derived proxies
- User-entered or opportunity-source references
- Analyst template defaults
- Existing analyst overrides

Existing analyst-entered assumptions are preserved. Prefill does not verify third-party listing content and does not confirm utility capacity, entitlement outcome, environmental conditions, or financing terms.

## Assumption Templates

Default templates are analyst defaults only:

- Development Land - Residential
- Development Land - Commercial
- Development Land - Industrial
- Long-Term Land Banking
- Entitlement / Repositioning
- Existing-Use - Retail
- Existing-Use - Industrial
- Existing-Use - Office
- Existing-Use - Multifamily
- Custom

Template values must be reviewed before calculation.

## Limitations

CFS Investment provides screening-level planning, economics, market, environmental, utility-proxy, basis, and underwriting context. It does not provide financial guidance, appraisal conclusions, utility-service assurance, capacity assurance, formal valuation conclusions, return assurance, or a complete listing feed.
