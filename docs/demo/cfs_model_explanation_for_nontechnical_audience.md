# CFS Model Explanation for a Nontechnical Audience

## The Basic Idea

CFS studies past new construction permits and asks:

"Which parcel conditions tended to appear before future new construction?"

The historical outcome is a new construction permit. The inputs are parcel
conditions and context available before the outcome window, such as zoning,
permit history, transportation context, flood constraints, and tax/value
information.

## What The Model Learns From

The model does not know whether a parcel "will" develop. It looks for patterns
in past records. For example, parcels with certain zoning, development history,
transportation access, or value characteristics may have been more likely to
receive future new construction permits in the historical data.

The current best internal research variant is:

- Zoning + Transportation + Tax/Value

That means the strongest internal research result so far came from combining
zoning context, transportation context, and tax/value enrichment with the
existing parcel development features.

## Why Exact Probabilities Are Not Shown

The model is better treated as a ranking research tool than as a precise
probability tool right now. Calibration is still weak, which means an exact
number could look more certain than it really is.

For that reason, CFS does not show:

- exact parcel-level prediction probabilities;
- parcel-level ranking classes;
- public parcel prediction endpoints;
- production-ready model claims.

## What The Model Can Support Today

Today the model work can support internal research questions, such as:

- Which data groups appear useful?
- Which feature groups hurt ranking quality?
- Which missing data would most improve the next version?
- Where do we need better governance before any public display?

It should not be used as a public decision engine.

## Simple Example

If many parcels that later received new construction permits had similar
zoning, nearby road access, recent permit activity, and tax/value context, the
model may learn that those conditions are associated with future construction.

That does not mean every parcel with those conditions will develop. It only
means the pattern is worth studying and validating.

## What Must Happen Before Public Use

Before any public-facing development signal is considered, CFS needs:

- better probability calibration;
- official rezoning case dates;
- future land use data;
- utility and transportation project details;
- official school capacity and enrollment data;
- governance review and staff validation;
- clear policy on how any model output may be used.

Until then, the model remains internal research only.
