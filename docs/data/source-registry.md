# Data Source Registry

## Purpose

The source registry is the persistent inventory behind Data & Methods,
administration, Ask CFS evidence, reports, and exports. A registry record describes
a source; it does not copy the source dataset into a product-work table.

## Required fields

- stable source ID and domain;
- source name and provider/system;
- authority level and accountable owner role;
- source, ingestion, and validation dates;
- expected refresh interval;
- schema version;
- sensitivity and licensing;
- status and limitations; and
- ingestion method.

## Status values

- Available
- Available with limitations
- Missing
- Stale
- Validation failed
- Disabled
- Not required

Status is factual. Missing or failed sources never receive fabricated replacement
values. A limitation remains visible in downstream evidence and reports.

## Relationships

Ingestion runs reference one registered source and its schema version. Data-quality
results reference the source/run/rule. Ask CFS evidence and governed exports may
reference source IDs and dates but do not expose restricted source payloads.
Artifacts may record the sources used to generate them.

## Authorization

Approved registry fields are readable through Data & Methods. Data Steward may
create records and update governed status/limitations. Administrator may inspect
runtime configuration and manage user roles but cannot rewrite immutable
ingestion or audit history. Sensitive operational fields are excluded from
public/demo responses.

## Freshness

The registry stores the expected refresh cadence and a factual status. Data
Administration shows that cadence and status beside the latest organization-scoped
ingestion row count and validation result. Product V1 does not automatically
change registry status from dates: a Data Steward records `Stale` or `Available
with limitations` after review. Optional ingestion freshness checks remain
visible without erasing the last valid data.

## Status

The registry model/API, bounded export, downstream Product context, and live
Data & Methods view are Product V1 scope. Direct provenance adapters for every
legacy domain export, ownership approval, authoritative source SLAs, license
decisions, and automated harvesting are deferred.
