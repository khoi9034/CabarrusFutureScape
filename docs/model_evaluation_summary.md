# CFS Model Evaluation Summary

## Current Best Internal Variant

CFS Model Lab remains internal model research. The current-best tested variant is
`transportation_plus_tax_value_only` because it had the strongest PR-AUC and
top-5% lift among the evaluated variants.

| Variant | PR-AUC | Lift @ Top 5% | Interpretation |
| --- | ---: | ---: | --- |
| Transportation baseline | 0.082744 | 3.889837 | baseline screen |
| Tax/value only | 0.137928 | 4.051123 | current-best internal variant |
| Utility proxy only | 0.089515 | 3.590984 | mixed; retained for due diligence |
| Full enhanced bundle | 0.071244 | 0.711556 | not selected |

## WSACC Interpretation

WSACC sewer-proximity proxy fields are useful for development-readiness review,
but they are not selected in the current-best predictive model. They should be
used as a due-diligence layer alongside growth pressure, land opportunity,
constraints, school/service context, and CFS Economics.

WSACC can support:

- sewer infrastructure proximity proxy;
- manhole proximity context;
- sewer basin context;
- utility-readiness proxy for manual review.

WSACC does not provide:

- confirmed sewer capacity;
- confirmed water service;
- planned extension timing;
- project approval;
- appraisal, tax, or buy/sell guidance.

## Safe Status

- model status: internal research only;
- production ready: false;
- public parcel-level probabilities: not exposed;
- raw model scores: not exposed;
- WSACC role: due diligence and screening context, not a proven accuracy
  improvement.
