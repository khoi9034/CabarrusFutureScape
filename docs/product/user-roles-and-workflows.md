# User Roles and Workflows

## Principal model

Every API request resolves to a principal with a stable user identifier, roles,
optional organization, and request identity context. Demo mode has no write
principal. Local mode uses an explicit development principal. Enterprise mode
requires a validated OIDC principal and must not permit anonymous writes.

## Fixed Product V1 roles

| Role | Allowed workflow | Important denials |
| --- | --- | --- |
| Viewer | Read Approved product records and bucket items attached to Approved reports; use own Ask CFS conversations | No persistent writes, Draft/review-state reads, or administration |
| Planner | Create/update/version Planning Snapshots, notes, and planning reports | No ingestion apply or user administration |
| Analyst | Manage Economics scenarios, saved searches, opportunities, and analytical reports | No source approval or role changes |
| Report Author | Generate/manage reports and governed artifacts | Cannot change analytical source records |
| Data Steward | Manage source registry, readiness, dry runs, validation, and approved ingestion apply | No user/role administration by default |
| Administrator | Controlled user roles, read-only runtime configuration, audit access, and project access within the same organization | No cross-organization access or bypass of audit and validation |

Roles are additive. Administrator bypasses project-membership checks only for
records in the administrator's organization. It does not imply cross-organization
access, permission to edit append-only audit events, or an ingestion-validation
bypass. On generic Product resource routes, a principal whose only role is Viewer
is limited to records with an Approved status; a Report Bucket item is readable
only when its parent report is Approved.

## Route checks

Each protected route declares a named permission. Authentication resolves first;
authorization occurs before domain mutation. Denials use a safe error envelope
and create a redacted audit event where possible.

## Object checks

For project-owned records, authorization also verifies:

- organization equality when organization ownership is present, including for
  administrators;
- active project membership for non-administrators, with a same-organization
  Administrator exception;
- the permission required by the operation;
- that referenced child objects belong to the same project.

Possessing a route permission alone is insufficient for a non-administrator to
mutate another project's snapshot, scenario, shortlist, report, artifact, or
conversation. Administrator access remains constrained to the same organization.

## Core workflows

### Planning

Planner creates a project snapshot, saves notes/sections/map state, creates an
immutable version, reopens it after refresh, and archives it with audit history.
The interface loads the current principal and disables mutation controls for a
Viewer. Loading, Saving, Saved, conflict, permission, and unavailable states are
reported inline; a rejected write never changes the record's saved status.

### Economics

Analyst saves assumptions and outputs, creates scenario versions, compares a
bounded set, and asks a Report Author to generate governed output.
Economics and Investments share the same Report Bucket repository. A Report
Author can manage bucket items; a Viewer may read an item only when its parent
report is Approved and cannot create, update print selection, or archive items.

### Investments

Analyst creates a disposable project, saved search, opportunity, shortlist,
property review, underwriting draft, and report bucket. Cleanup archives product
records and leaves audit history; CASE records are never used as disposable data.

### Ask CFS

Viewer may use grounded search. Persisted conversations retain safe question and
answer summaries, entity/product context, prompt version, and provider mode—not
hidden prompts, credentials, or unrestricted private text.

Demo Ask CFS conversations stay in the browser session. Local and Enterprise
restore safe messages from `/api/v1`, while answers continue through the
existing Ask CFS search route. Reset deletes the conversation's retained message
rows, records `reset_at`, and appends an audit event. `retention_until` is metadata
only in Product V1; automatic expiry or pruning is not implemented.

### Data stewardship

Data Steward registers and updates a source, stages an approved input, runs
validation and a dry run, and reviews immutable results. The explicit apply
boundary is implemented, but it fails closed until a canonical apply adapter is
approved and configured.

## Frontend permission behavior

`GET /api/v1/me` is the compact source for displayed identity, roles, and
permissions in Local and Enterprise modes. It improves the interface but does
not replace server authorization. Approved read access remains available to a
Viewer when a write control is disabled. A `403`, `409`, or unavailable backend
is rendered as an inline permission, conflict, or unsaved state with a request
ID when available;
the client never retries a non-idempotent mutation automatically.

The browser role matrix uses simulated principal responses and explicit `403`
responses to verify control gating and truthful denial UX. Backend authorization
tests prove server enforcement. Hosted Entra/OIDC interactive acceptance is not
claimed until tenant registration and policy are provisioned.

## Status

The role contract and governed Administrator role changes are Product V1 scope
and checked by `check:authorization`. Runtime configuration mutation, OIDC
tenant/group provisioning, and custom roles are deferred.
