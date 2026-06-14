# Phase 10F Metric Discrepancy Review

## Finding

Phase 10C reported baseline lift@top 5% near `2.05`, while Phase 10E reported
a retrained-baseline lift@top 5% near `0.706812`.

The discrepancy is **not** caused by a different lift formula. Both phases used
the intended definition:

`lift@top_k = precision@top_k / overall_positive_rate`

It is also not caused by a different test year or label population. The 2022
test set has `110017` rows in both the base and
zoning-enhanced feature matrices, and mismatched label rows are
`0`.

## Cause

The earlier Phase 10C artifact and the Phase 10E retrained baseline are separate
histogram-gradient-boosting fits. Their ROC-AUC and PR-AUC are close, but the
top-5% rank slice is sensitive to large equal-probability buckets. When a cutoff
falls through a tied score bucket, naive sorting can include different tied rows
based on row order. That makes top-k lift volatile even when broader ranking
metrics remain similar.

## CFS Standard Going Forward

Phase 10F standardizes top-k metrics with tie-aware expected positives at the
cutoff bucket. The trusted QA comparison is:

- Baseline PR-AUC: `0.054665`
- Zoning-enhanced PR-AUC: `0.071174`
- Baseline tie-aware lift@top 5%: `1.265508`
- Zoning-enhanced tie-aware lift@top 5%: `1.774988`

The model remains internal only:

- `model_active=false`
- `prediction_probability_available=false`
- `production_ready=false`
