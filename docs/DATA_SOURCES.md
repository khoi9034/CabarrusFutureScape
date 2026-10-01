# Cabarrus Insights data catalog

This catalog records the governed local snapshot verified on 2026-10-01. Dates
are observed source coverage, not promises of real-time currency. Re-run
`npm.cmd run check:local-data` for current counts and dates.

| Dataset | Source / authority status | Governed table or service | Current through | Refresh | Key limitation | Used by |
| --- | --- | --- | --- | --- | --- | --- |
| Parcels | Cabarrus parcel extract; governed local copy | `public.parcels_enriched` | 2026-05-28 | Manual/source-driven; daily or weekly target | Hosted source SLA not approved | Management, Analyst, Master Data, Ask |
| Permits | Cabarrus Real Property Permit CSV; authoritative candidate pending owner approval | `public.real_property_permit_clean`, relationship and development summaries | 2025-12-31 | `python cfs-data-pipelines/refresh_permit_intelligence.py --apply`; daily target | Only production-grade live refresh in Phase 1 | Management, Analyst, Ask |
| Addresses / plan-review context | Cabarrus Accela extract; governed local copy | `public.accela_plan_reviews_clean` | 2026-06-14 | Manual/source-driven | Name reflects the current loaded extract; validate semantics before new reuse | Parcel search and planning context |
| Zoning | County/municipal zoning services; governed overlay | `public.zoning_jurisdictional_clean`, `public.parcel_zoning_overlay` | 2026-05-28 | Manual/source-driven; daily/weekly target | Jurisdiction and source-date caveats remain | Analyst, Management, Ask |
| Flood | FEMA NFHL regulatory source | `public.fema_nfhl_flood_zones_clean`, `public.parcel_flood_constraint_overlay` | 2026-06-05 | Periodic/source-driven | Screening context does not replace official determination | Analyst, Management, Ask |
| Schools | CCS assignment/reference data and presentation utilization seed | `public.school_reference`, `public.school_zones`, `public.school_presentation_utilization_seed` | Zones 2026-06-11; utilization 2024-2025 | Annual/official-release driven | `school_capacity` has no official capacity rows | Management, Analyst, Ask |
| Transportation | Cabarrus/NCDOT centerlines, AADT, STIP context | `public.transportation_*`, `public.parcel_transportation_accessibility_features` | Centerlines 2026-06-13; counts 2022 | Source-driven | AADT coverage is historical and location-specific | Analyst, Development Signals context |
| WSACC | RevalMap sewer lines/manholes/basins; contextual proxy | `public.wsacc_*`, `public.parcel_wsacc_utility_features` | 2026-07-09 | Source-driven | Proximity/inventory only; no capacity or service confirmation | Analyst, Management, Ask |
| Economics / tax | Governed parcel tax/value enrichment | `public.parcel_tax_value_enrichment_features`, `public.parcel_development_screening_output` | 2026-06-14 | Assessment-cycle/source-driven | Screening classes are not investment or regulatory advice | Management, Analyst, Ask |
| Development Signals | Versioned internal research artifacts | `public.development_prediction_ranking_*`, experiment scores | Model evidence through 2022 | Controlled validation/retraining only | Relative screening rank, not probability; not automatically retrained | Management, Analyst, Methodology, Ask |
| Planning Files / Snapshots | User-created governed application records | `public.planning_snapshots`, `public.planning_snapshot_versions` | Latest record observed 2026-09-17 | Transactional application writes | Enterprise object storage is not implemented | Management and Analyst |

## Refresh safety

Management, Analyst, and Ask read PostGIS rather than remote services during a
page request. The permit worker downloads to staging, validates required fields,
coverage, duplicates, and row-count changes, then publishes transactionally.
Failure preserves the last-known-good tables and freshness metadata. Development
Signals are never silently retrained by a data refresh.

Other datasets do not yet have equivalent production workers. Their existing
ingestion scripts and source notes are useful operator inputs, but they must not
be represented as scheduled live synchronization. See
`docs/data/live-management-refresh-phase-1.md` and
`docs/data/source-registry.md`.
