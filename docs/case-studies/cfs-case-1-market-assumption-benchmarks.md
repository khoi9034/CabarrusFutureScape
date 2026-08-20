# CASE-1 Market Assumption Benchmarks

> **Retired historical reference:** The Investments product and CASE-1 workflow are retired and are not part of the active Demo, Local, Enterprise, acceptance, or deployment surface. This document is retained only as historical design or evidence and must not be used as an operating runbook.

CASE-3A.1 proposes underwriting assumptions for user review. These values are not approved, not an appraisal, not investment advice, and not a final acquisition recommendation.

## Recommended Program

Use **Large Residential Finished-Lot Development** as the primary underwriting program: land acquisition, entitlement, horizontal development, finished residential lots, and sale of finished lots to builders. Do not model vertical home construction or commercial/retail income in the primary case. Mixed-use potential can remain a planning consideration, but it is not a modeled revenue source without separate evidence.

Recommended first product: **conventional detached single-family lots**, with an upside sensitivity for smaller-lot detached residential if planning and civil evidence later support it.

## Sources Reviewed

| Source | Date | Benchmark | Relevance | Limitation |
| --- | --- | --- | --- | --- |
| [City of Concord Development Ordinance](https://concordnc.gov/Departments/Planning-Development-Services/Development-Ordinance) | Accessed 2026-07-20 | Concord regulates land development, zoning, subdivision, density, streets, stormwater, stream buffers, and floodplain development. | Priority parcel is in Concord. | Not a subject-site entitlement. |
| [Cabarrus County Planning agenda](https://docs.cabarruscounty.us/WebLink/1/edoc/3735934/January-14-2025%20Agenda.pdf) | 2025-01-14 | Low Density Residential plan reference of up to 2 to 3 dwelling units per acre in a cited area. | Conservative local density anchor. | Different site and plan context. |
| [Concord staff report Z(CD)-10-25](https://apps.concordnc.gov/legacy/PlanningWeb/CaseManager/Cases/Z%28CD%29-10-25/Z%28CD%29-10-25%20FULL%20Staff%20Report.pdf) | 2025 | Urban Neighborhood context can include small-lot detached and townhomes. | Supports smaller-lot sensitivity only. | Different site; not revenue evidence. |
| [Canopy Realtor Association 2025 summary](https://www.canopyrealtors.com/press-releases/1/30/2026/charlotte-market-finds-footing-2025) | 2026-01-30 | Charlotte region 2025 median sales price $399,990; single-family median $415,000. | Regional home-price context. | Not finished-lot comps. |
| [Redfin Cabarrus County market](https://www.redfin.com/county/2019/NC/Cabarrus-County/housing-market) | May 2026 | Cabarrus median sale price $370,289; 321 sales; 51 median days on market. | County pricing and pace context. | All-home data, not new-home or lot data. |
| [FRED/FHFA Cabarrus HPI](https://fred.stlouisfed.org/series/ATNHPIUS37025A) | Updated 2026-03-31 | Cabarrus HPI 264.31 in 2025 versus 258.89 in 2024. | Public price-trend cross-check. | Index only. |
| [NAHB 2024 construction-cost survey summary](https://eyeonhousing.org/2025/01/cost-of-constructing-a-home-in-2024/) | 2025-01-29 | Finished lot 13.7% of sales price; builder profit 11.0%. | Bridge from home price to finished-lot benchmark. | National survey. |
| [NAHB 2024 lot-value summary](https://eyeonhousing.org/2025/07/lot-values-trend-higher-in-2024/) | 2025-07-14 | U.S. median lot value $60,000; South Atlantic $53,000. | Lot-value floor/context. | Spec-home lots, not Cabarrus finished-lot sales. |
| [NAHB 2026 regulation study](https://www.nahb.org/news-and-economics/housing-economics-plus/special-studies/special-studies-pages/government-regulation-in-the-price-of-new-homes-2026) | 2026 | Long-run finished lot share 20.4%; developer lot mark-up 30.7%; land acquisition/development costs 14.1% of final house price. | Lot-share and margin cross-check. | National model assumptions. |
| [WSACC System Development Fees](https://www.wsacc.org/system-development-fees/) | FY 2027 available | Utility system development fee schedule and analysis. | Utility-fee reference. | Does not confirm service or capacity. |
| [Concord FY26 fee schedule](https://concordnc.gov/Portals/0/Concord/Departments/Finance/Fee%20Schedule/FY26%20Fee%20Schedule_July_1_2025_1.pdf) | 2025-07-01 | Residential water/wastewater charges include system development, installation, and meter fees. | Fee-order-of-magnitude reference. | Not a project-specific extension budget. |

## Proposed Assumptions

| Input | Downside | Base | Upside | Unit | Evidence type |
| --- | ---: | ---: | ---: | --- | --- |
| Developable acreage | 350.00 | 392.11 | 430.00 | acres | CFS-derived screening evidence plus analyst sensitivity |
| Modeled density | 2.2 | 2.8 | 3.4 | lots per developable acre | Analyst assumption |
| Finished-lot value | 55,000 | 70,000 | 85,000 | dollars per finished lot | Analyst benchmark |
| Horizontal development cost | 85,000 | 70,000 | 60,000 | dollars per lot | Analyst benchmark pending civil estimate |
| Road/intersection allowance | 15,000,000 | 8,000,000 | 4,000,000 | fixed dollars | Analyst allowance |
| Water extension allowance | 6,000,000 | 3,000,000 | 1,500,000 | fixed dollars | Analyst allowance |
| Sewer/special utility allowance | 10,000,000 | 5,000,000 | 2,000,000 | fixed dollars | CFS proxy plus analyst allowance |
| Other off-site/pump-station allowance | 5,000,000 | 2,000,000 | 0 | fixed dollars | Analyst allowance |
| Soft costs | 15 | 12 | 10 | percent of hard and off-site costs | Analyst assumption |
| Contingency | 20 | 15 | 10 | percent of hard, off-site, and soft costs | Analyst assumption |
| Due diligence | 12 | 9 | 6 | months | Analyst assumption |
| Entitlement | 24 | 18 | 12 | months | Analyst assumption |
| Horizontal development | 30 | 24 | 18 | months | Analyst assumption |
| Lot absorption | 48 | 36 | 24 | months | Analyst assumption |
| Developer margin | 18 | 15 | 12 | percent of gross development revenue | Analyst assumption |
| Selling/transaction costs | 4 | 3 | 2 | percent of lot-sale revenue | Analyst assumption |
| Financing/carry allowance | 10 | 8 | 6 | percent of hard, off-site, soft, and contingency costs | Analyst assumption |

All rows are **Proposed - User Review Required**. No assumption is approved.

## Formula Structure

Developable acres x modeled density = estimated lots.

Estimated lots x finished-lot value = gross development revenue.

Gross development revenue minus horizontal development cost, off-site infrastructure, soft costs, contingency, selling costs, financing or carry allowance, and required developer margin = preliminary maximum supportable land price.

Developer margin is proposed as a percent of gross development revenue. Financing is simplified as a carry allowance. The first model should avoid false precision and should not include IRR or discounting unless the user asks for a more advanced structure in CASE-3B.

## Sensitivity Design

Primary sensitivity table: finished-lot value versus horizontal development cost per lot.

Second sensitivity table: developable acreage versus modeled density.

Optional third table: utility/off-site allowance versus development timeline, only if the user wants to isolate infrastructure and timing risk.

## Missing Evidence

Missing evidence includes verified Cabarrus finished-lot sale comparables, builder lot takedown terms, civil quantity takeoff, utility availability and capacity response, traffic impact scope, entitlement path, approved density, absorption study, and acquisition basis.

## Professional Estimates Required

Professional estimates are required from civil engineering, utility engineering, transportation engineering, planning/entitlement counsel, survey/title, environmental/wetland/geotechnical consultants, market study or brokerage support, and sponsor/capital-markets review.

## User Decisions Required

Approve or revise the primary product, developable acreage cases, modeled density cases, finished-lot values, horizontal cost range, off-site allowances, soft-cost percentage, contingency, timeline, developer margin convention, selling costs, financing/carry allowance, and whether CASE-3B should calculate preliminary maximum supportable land price before testing acquisition-basis points.

## Recommendation for CASE-3B

Use the base case as the first workbook scaffold only after user approval. Calculate preliminary maximum supportable land price first, then compare optional lower/middle/higher analyst acquisition-basis test points if the user wants a sensitivity view. Do not invent a current asking price.
