# CFS Investment Case-Study Interview Walkthrough

## 30-second description

I used CFS Investment to answer a real-estate screening question: which large Cabarrus County parcels should advance into formal acquisition diligence for future residential or mixed-use development. I built a repeatable countywide funnel, scored candidates with a transparent 100-point analyst model, compared three properties, estimated preliminary developable acreage without double-counting overlapping flood and wetland constraints, and prepared draft underwriting scenarios and a due-diligence plan.

## Two-minute walkthrough

CFS reviewed 110,017 cloud-safe parcel rows. Of those, 241 met the 100-acre threshold, 241 had usable Planning and Investment evidence, 62 passed the initial utility/environmental screen, 10 went to manual review, and 3 were shortlisted for comparison.

The priority candidate is CFS-PARCEL-0149758869. It has 489.43 gross acres, adjacent sewer-proximity proxy, strong utility-readiness proxy, very high development-activity context, and moderate mapped environmental constraints. The recommendation is conditional advancement for additional acquisition review, not a purchase recommendation.

## Five-minute walkthrough

The workflow was Define Strategy, Find, Shortlist, Analyze, Compare, Underwrite, Recommend, Report. During readiness review I found two important issues: minimum acreage filtering did not exist in the Investment screen, and Investment candidate detail depended on a limited 120-row Power BI export instead of the full cloud-safe candidate universe. I fixed both at the shared service/source level.

For developable area, I did not subtract constraints independently. For CFS-PARCEL-0149758869, the unioned flood/wetland constraint is 28.13 acres, not 8.83 plus 22.08 without adjustment, because 2.78 acres overlap. After a 15 percent open-space/stormwater assumption, the screening estimate is 392.11 developable acres.

Underwriting uses draft analyst assumptions only. The base case uses 392.11 developable acres, 2.4 units/lots per developable acre, 941 units/lots, a $125,000 finished-lot or unit value assumption, and an $18,000,000 analyst scenario acquisition basis. Those assumptions are awaiting review before any workbook is created.

## Technical architecture

The case study uses the CFS cloud-safe PostGIS dataset, Investment workspace services, the Investment screening service, CFS Underwriting Lab calculations, ACS market context, environmental context, and Report Studio output. Restricted data remains excluded. No owner names, mailing addresses, grantor/grantee fields, raw scores, exact probabilities, tokens, or connection strings are included.

## Analytical judgment

The main judgment is that acreage alone is not enough. The priority parcel has the best balance of size, sewer-proximity proxy, development momentum, and manageable mapped constraints. The secondary parcel is still relevant because of scale, but it carries a larger verification burden. The deferred parcel proves the model is not just ranking by acreage; it meets the size threshold but fails the utility/environmental tradeoff.

## Main limitations

Utility proximity is a proxy, not capacity confirmation. Zoning overlay is not entitlement. Transportation proximity is not legal access. ACS context is aggregate, not parcel-level demand. Preliminary developable acreage is not certified. Underwriting values are assumptions, not facts.

## Likely interviewer questions and strong answers

**Why did you not use owner data?** Because the Azure staging work intentionally excludes private identity fields. The case focuses on acquisition-screening evidence and leaves identity/contact verification as a professional diligence task.

**Why does the deferred candidate matter?** It demonstrates disciplined screening. A parcel can meet the acreage requirement and still fail because environmental and utility evidence make near-term acquisition review inefficient.

**What was the biggest engineering fix?** Investment was relying on a report-sized export for candidate rows. I changed the shared loader to use cloud-safe parcel evidence directly, so countywide Investment screening can see the full candidate universe.

**What would you verify first before real outreach?** Zoning interpretation, water/sewer service and capacity, legal access, title/easements, asking basis, comparable sales, and field environmental conditions.

**What is the strongest business takeaway?** CFS does not replace professional due diligence, but it narrows the search from countywide noise into a reviewable acquisition shortlist with explicit risks and next steps.
