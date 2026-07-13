# Investment ACS Market Context

CFS Investment Intelligence uses selected U.S. Census American Community Survey
5-year tract estimates as aggregate market-area context for private candidate
review.

This layer is screening-level context only. It is not investment advice, not an
appraisal, not proof of demand, and not a guarantee of future value or
development outcome.

## Dataset

- Source: U.S. Census Bureau ACS API
- Dataset: ACS 5-year
- Default year: 2024, configurable with `CENSUS_ACS_YEAR`
- Geography: Census tract
- Coverage: Cabarrus County, North Carolina (`state:37`, `county:025`)
- Refresh: controlled local refresh, not per-candidate API calls

## Variables

The first connector imports a focused set of aggregate variables:

- Total population
- Total households
- Average household size
- Median household income
- Per-capita income
- Total, occupied, and vacant housing units
- Owner-occupied and renter-occupied units
- Median home value as area context
- Median gross rent as area context
- Households with no vehicle available

## Storage

ACS rows are persisted in `investment_acs_market_context`, keyed by GEOID,
geography type, and ACS year. Census tract polygons are stored in
`investment_acs_tract_geometry`, and parcel-to-tract matches are written to
`investment_parcel_acs_geography` through a batch PostGIS overlay.

The cache stores aggregate geography identifiers only. It does not store owner,
mailing, household-level, or microdata records.

## Benchmark Method

CFS compares a candidate tract with the loaded Cabarrus tract distribution and
returns qualitative bands:

- Elevated Local Context
- Moderate Local Context
- Typical Local Context
- Limited Local Context
- Mixed Context
- Insufficient Information

These bands are descriptive, not investment rankings. Higher population,
household, or income context does not make a parcel a better investment.

## Limitations

- ACS estimates have margins of error. This compact phase records the caveat but
  does not yet surface MOE values in the Investment Panel.
- Multi-year growth comparisons are not enabled because overlapping ACS
  five-year vintages require careful interpretation.
- Parcel-to-tract resolution uses parcel geometry and local Census tract
  geometry. If a parcel lacks a valid geometry match, CFS returns `Market
  geography unavailable`.
- Census context must be reviewed alongside zoning, utilities, constraints,
  access, basis/comparable context, and manual due diligence.

## Safe Use

Use language such as:

- market-area context
- demographic context
- aggregate tract context
- screening-level review
- due diligence required

Do not use ACS context to claim confirmed demand, future appreciation,
investment return, appraisal conclusions, or parcel-level feasibility.
