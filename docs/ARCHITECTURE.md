# Cabarrus Insights architecture

## System shape

```text
County staff browser
        |
        v
Next.js UI (Management, Analyst, Master Data, Planning Files, Ask Insights)
        |
        v
FastAPI safety boundary
  | authentication / authorization / audit
  | governed query and export services
  | fixed Ask Insights / GIS tools
  | refresh administration
        |
        v
PostgreSQL + PostGIS
  governed source tables → overlays/summaries → application records

Approved sources → fixed ingestion worker → stage/validate/transactional publish
FastAPI → optional OpenAI (approved evidence only; deterministic fallback exists)
Analyst map → same-origin ArcGIS SDK/assets → optional OpenFreeMap/EagleView
```

## Ownership

| Component | Owns | Does not own |
| --- | --- | --- |
| Browser/Next.js | Page state, accessible UI, map rendering, safe public runtime config | Credentials, authorization decisions, unrestricted data access |
| FastAPI | Identity validation, permissions, query bounds, privacy, audit, errors, exports, Ask tools, refresh boundary | Browser presentation or arbitrary operator commands |
| PostgreSQL/PostGIS | Governed records, geometry, relationships, derived summaries, Planning Files | Remote-source polling or model-provider calls |
| Ingestion workers | Approved download, schema/data validation, staging, publish, refresh status | Page requests or automatic model retraining |
| Ask Insights | Contextual explanation and fixed read/analysis tools | Arbitrary SQL/Python/URLs, approvals, source edits, destructive actions |
| Operator/scheduler | Startup, health, backups, approved refresh cadence, recovery | Product logic |

## Runtime profiles

- `demo`: static sanitized data, auth off, AI off, public-static artifacts,
  inline browser behavior; no backend dependency.
- `local`: local API/PostGIS, local-dev or approved OIDC identity, local files,
  inline jobs. `present:cfs` enables the frozen presentation cache and disables
  live refresh.
- `enterprise`: enterprise API, OIDC, object storage, and external worker. The
  backend requires tenant, audience, organization, and exact HTTPS origins and
  fails closed when they are missing.

Frontend variables use `NEXT_PUBLIC_CFS_*`; backend variables use `CFS_*`,
`POSTGRES_*`, or `DATABASE_URL`. Only public identifiers belong in the frontend.

## Principal flows

### Management and Analyst

Management requests period-aware summaries from FastAPI. “Inspect” creates a
bounded handoff containing governed filters/metadata; Analyst queries the same
PostGIS snapshot, highlights the result, and preserves the Management meaning.

### Master Data

The catalog allowlists datasets, fields, filters, joins, sorts, pagination, and
exports. FastAPI authorization is authoritative. Demo adapters reproduce the
contract with sanitized fixtures; they are not a fallback for missing live data.

### Planning Files

Snapshots and versions persist in PostGIS under the Product V1 permission and
audit model. Local files use the allowlisted artifact root. Enterprise object
storage is a required but currently unimplemented deployment adapter.

### Ask Insights

The browser sends the user question plus bounded page/map context. FastAPI adds
approved evidence, applies privacy/permissions, selects only registered tools,
and returns a concise answer plus opaque result handle. OpenAI can synthesize an
answer when configured; provider failure falls back to grounded deterministic
behavior. Raw provider errors are not user-visible.

### Refresh

Management never calls County sources during a page request. The permit worker
downloads an approved source, validates keys/dates/duplicates/row-count change,
stages the extract, and transactionally publishes the raw/clean/relationship/
summary tables. A failure preserves last-known-good tables and freshness. Cache
invalidation makes Management, Analyst, and Ask Insights read the same snapshot.
Development Signals remain versioned and are not retrained by refresh.

## Deployment boundary

This repository supplies application contracts, local presentation operations,
container/cloud reference material, and validation. County infrastructure owns
TLS/DNS, network controls, secret storage, identity policy, managed database,
object storage, job scheduling, backups, monitoring, and incident response.
