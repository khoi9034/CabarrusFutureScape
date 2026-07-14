# CFS Investment Underwriting Methodology

CFS Investment Underwriting Lab is a screening-level scenario tool. It combines CFS parcel evidence with user-entered assumptions and deterministic calculations. It is not investment advice, not an appraisal, not a financing commitment, not an official tax calculation, and not a guarantee of future value.

## Evidence Labels

Every underwriting workspace should distinguish:

- CFS evidence: parcel acreage, planning context, comparable context, ACS market-area context, environmental context, and utility proxy context.
- CFS-derived proxy: sewer proximity, utility-readiness proxy, environmental constraint bands, and usable-area screening proxy.
- User-entered assumption: purchase price, asking price, development costs, income, financing terms, exit values, and holding periods.
- Calculated result: sources and uses, break-even values, return context, debt service, and sensitivity output.
- Missing or unverified: utility capacity, confirmed service, final entitlement outcome, leases, occupancy, engineering feasibility, and tax conclusions unless supplied by authoritative user evidence.

User-entered values are never promoted to verified facts.

## Scenario Types

### Development Land

The Development Land model calculates:

- total acquisition cost
- total site and infrastructure cost
- total vertical cost
- total soft cost
- total financing cost
- total project cost
- cost per unit
- cost per square foot
- estimated scenario revenue
- estimated scenario margin
- break-even sale price
- break-even rent
- unlevered return context
- levered return context where debt assumptions are present
- equity multiple
- scenario IRR

CFS does not derive a confirmed unit count, building area, or feasible density from parcel evidence. The user must enter those assumptions.

### Long-Term Land Banking

The Long-Term Land Banking model calculates:

- total holding cost
- total basis at exit
- break-even exit price
- break-even exit price per acre
- scenario gain or loss
- scenario equity multiple
- scenario IRR

Exit pricing is a user-entered scenario, not a CFS forecast.

### Entitlement / Repositioning

The Entitlement / Repositioning model calculates:

- total pre-entitlement basis
- total entitlement cost
- total basis after entitlement
- break-even post-entitlement value
- scenario gain or loss
- scenario return
- major entitlement sensitivities

CFS does not assign a precise entitlement probability. Users should treat entitlement outcome cases as scenarios.

### Existing-Use Acquisition

The Existing-Use Acquisition model calculates:

- net operating income
- going-in cap rate
- debt service
- debt service coverage ratio
- cash flow before tax
- cash-on-cash return
- break-even occupancy
- exit value scenario
- equity multiple
- levered IRR
- unlevered IRR

The model only calculates these values when the required income, expense, debt, and exit assumptions are present. CFS does not fabricate lease, income, expense, or occupancy data.

## Formula Notes

- Percent inputs may be entered as whole percentages or decimal rates.
- Debt service uses a standard amortizing loan formula unless an interest-only period is entered.
- Cap rate output is NOI divided by purchase price.
- Exit value for existing-use scenarios is exit-year NOI divided by exit cap rate.
- Break-even occupancy is operating expenses plus debt service divided by gross potential income.
- IRR is calculated deterministically from modeled cash flows. If cash flows do not include both an outflow and inflow, IRR is unavailable.
- Sensitivity analysis uses a compact 3-by-3 matrix around two key assumptions per scenario type.
- Missing inputs are surfaced explicitly rather than silently converted to zero when doing so would change interpretation.

## Timing Conventions

- Holding periods are annual.
- Development entitlement, construction, and absorption timing are entered in months and converted to years for scenario IRR context.
- Land-banking annual costs may use a user-entered annual cost-growth rate.
- Existing-use exit NOI applies annual income-growth assumptions over the entered holding period.

## CFS Evidence Beside the Model

Underwriting Lab may display nearby CFS evidence:

- planning and zoning context
- development-readiness signal
- historical sale and comparable context
- ACS market-area context
- FEMA, NWI, terrain, NRCS, and EPA environmental context
- WSACC sewer-proximity and basin proxy context
- missing evidence and verification requirements

Financial results do not override physical, planning, environmental, utility, title, legal, or market due diligence.

## Scenario Interpretation

Use underwriting output as a modeled scenario based on the assumptions entered. The output can help identify break-even conditions, sensitive inputs, and missing evidence. It should not be used as a purchase recommendation, appraised value, expected return, or guarantee of future value.

Recommended verification includes financial, legal, planning, utility, engineering, environmental, survey, title, insurance, and tax review.
