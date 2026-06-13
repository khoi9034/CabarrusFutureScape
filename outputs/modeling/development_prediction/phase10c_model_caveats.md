# Phase 10C Model Caveats

- Target: `new_construction_next_3yr`
- Feature set: `strict_time_safe_baseline`
- Excluded snapshot years due to incomplete future windows: `[2023, 2024, 2025, 2026]`
- This experiment is internal and not production ready.
- No frontend prediction probabilities are exposed.
- Strict baseline features are time-windowed to snapshot year-end.
- Current-context exploratory features, if used, are not historically perfect.
- School capacity scoring remains disabled until official enrollment/capacity
  data is ingested and vetted.
