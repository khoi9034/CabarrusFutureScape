# Live Management refresh — Phase 1

Management, Analyst, and Ask Insights read governed PostGIS tables only. They
never call a County source during a page request.

## Permit refresh

`cfs-data-pipelines/refresh_permit_intelligence.py --apply` is the single
approved worker for the Real Property Permit CSV. It downloads the configured
authoritative-candidate source, validates required IDs/dates/PINs, duplicate
PermitIDs, parseable coverage, and an unexpected row-count drop before it
publishes. The worker stages the raw extract, then transactionally publishes
the raw table, clean permit table, permit-to-parcel relationship, and the
development parcel/time/zoning summaries. A validation or publish failure rolls
back and retains the prior governed tables. The refresh-status table preserves
the last successful current-through date even after a later failed attempt.

The internal administrator endpoint may invoke that fixed worker only when
`CFS_LIVE_REFRESH_ENABLED=true`, the runtime is `local` or `enterprise`, and
the frozen presentation cache is disabled. No request can supply a command,
source URL, or target table. A scheduler should call this same protected
internal action; it does not depend on a browser being open.

After a successful publish, the API clears its Management, economics, Ask
Insights, model-summary, and presentation caches. The next read therefore
derives KPIs, coverage, hotspots, and Ask Insights evidence from the new
PostGIS snapshot. Development Signals model artifacts remain versioned and are
not retrained by this worker.

## Dataset cadence and later phases

| Dataset | Current governed target | Refresh cadence |
| --- | --- | --- |
| Permits | `real_property_permit*`, relationship and development summaries | Daily after County source approval |
| Parcels / addresses | `parcels_enriched` | Daily or weekly, source-dependent |
| Zoning | jurisdictional clean and parcel overlay tables | Daily/weekly after source changes |
| Flood | FEMA parcel overlays | Source-driven / periodic |
| Schools | school context and utilization tables | Annual or official-release driven |
| WSACC | utility context tables | Source-driven |
| Economics / tax | parcel economic facts | Assessment-cycle / source-driven |
| Transportation | accessibility tables | Source-driven |
| Development Signals | model artifacts | Scheduled governed retraining only |

`LOCAL_DEMO` remains frozen: it does not enable the worker or make remote calls.
Phase 2 will add equivalent reviewed workers for the remaining source families.
