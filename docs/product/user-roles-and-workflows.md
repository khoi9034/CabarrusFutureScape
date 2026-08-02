# User Roles and Workflows

## Principal model

Every API request resolves to a principal with a stable user identifier, roles,
optional organization, and request identity context. Demo mode has no write
principal. Local mode uses an explicit development principal. Enterprise mode
requires a validated OIDC principal and must not permit anonymous writes.

## Fixed Product V1 roles

| Role | Allowed workflow | Important denials |
| --- | --- | --- |
| Viewer | Read approved data/reports; use Ask CFS | No persistent writes or administration |
| Planner | Create/update/version Planning Snapshots, notes, and planning reports | No ingestion apply or user administration |
| Analyst | Manage Economics scenarios, saved searches, opportunities, and analytical reports | No source approval or role changes |
| Report Author | Generate/manage reports and governed artifacts | Cannot change analytical source records |
| Data Steward | Manage source registry, readiness, dry runs, validation, and approved ingestion apply | No user/role administration by default |
| Administrator | Controlled user roles, read-only runtime configuration, and audit access | No bypass of audit, validation, or object ownership |

Roles are additive. Administrator does not imply permission to edit append-only
audit events or bypass ingestion validation.

## Route checks

Each protected route declares a named permission. Authentication resolves first;
authorization occurs before domain mutation. Denials use a safe error envelope
and create a redacted audit event where possible.

## Object checks

For project-owned records, authorization also verifies:

- organization equality when organization ownership is present;
- active project membership or an explicitly allowed administrative scope;
- the permission required by the operation;
- version/archive conflict state; and
- that referenced child objects belong to the same project.

Possessing a route permission alone is insufficient to mutate another project's
snapshot, scenario, shortlist, report, artifact, or conversation.

## Core workflows

### Planning

Planner creates a project snapshot, saves notes/sections/map state, creates an
immutable version, reopens it after refresh, and archives it with audit history.

### Economics

Analyst saves assumptions and outputs, creates scenario versions, compares a
bounded set, and asks a Report Author to generate governed output.

### Investments

Analyst creates a disposable project, saved search, opportunity, shortlist,
property review, underwriting draft, and report bucket. Cleanup archives product
records and leaves audit history; CASE records are never used as disposable data.

### Ask CFS

Viewer may use grounded search. Persisted conversations retain safe question and
answer summaries, entity/product context, prompt version, and provider mode—not
hidden prompts, credentials, or unrestricted private text.

### Data stewardship

Data Steward registers and updates a source, stages an approved input, runs
validation and a dry run, and reviews immutable results. The explicit apply
boundary is implemented, but it fails closed until a canonical apply adapter is
approved and configured.

## Status

The role contract and governed Administrator role changes are Product V1 scope
and checked by `check:authorization`. Runtime configuration mutation, OIDC
tenant/group provisioning, and custom roles are deferred.
