# Enterprise Security Model

## Scope and trust boundaries

Product V1 is a single-organization application with four boundaries:

1. Browser: untrusted input and public build-time configuration only.
2. Next.js: presentation and approved static artifact delivery.
3. FastAPI: authentication, authorization, validation, audit, and domain APIs.
4. PostgreSQL/PostGIS and storage providers: server-only credentials and least
   privilege.

The public demo is anonymous and static/session-only. Local development uses an
explicit development principal. Hosted enterprise requires OIDC and rejects
anonymous writes.

## Authentication and sessions

- Validate issuer, audience, signature, expiry, scope, and stable subject/object
  identifier for OIDC bearer tokens.
- Keep access tokens out of URLs, logs, audit metadata, artifacts, and database
  connection strings returned to clients.
- Never store client secrets or AI/database/object credentials in
  `NEXT_PUBLIC_*` values.
- Enterprise startup fails if authentication requirements are incomplete.

OIDC registration, conditional access, MFA, group lifecycle, and emergency
accounts belong to the sponsoring organization's identity policy.

## Authorization

Every protected route declares a permission and every project-owned mutation
checks organization/project membership. UI gating is not enforcement. Data
Steward controls ingestion; Administrator controls users/configuration/audit;
neither can update append-only audit history. Artifact downloads run their own
policy check and audit.

## Input, SQL, and API safety

- Pydantic/typed models validate request bodies and query bounds.
- Repository SQL uses bound parameters.
- Sort/filter fields and table/column identifiers are explicit allowlists.
- Pagination and export sizes are bounded.
- Conflict checks prevent stale overwrites.
- Error envelopes omit stack traces, SQL, connection details, and secrets.
- Request IDs correlate safe logs/audit without accepting arbitrary long values.

## CORS, CSRF, and browser policy

Production CORS uses exact approved HTTPS origins; wildcard origins are rejected.
Bearer APIs do not enable credentialed cross-origin cookies. If a future release
uses browser cookies, it must add SameSite/Secure/HttpOnly cookies, CSRF tokens or
same-origin enforcement, origin validation, and dedicated tests before enabling
credentialed CORS.

Security headers and CSP should be reviewed for the final host, including the
minimum ArcGIS worker/style requirements. They must not be guessed in a way that
breaks the verified map.

## Files, artifacts, and reports

- Use allowlisted artifact IDs/provider keys, never client-selected paths.
- Resolve local artifacts below one configured root and reject traversal/symlinks
  escaping it.
- Sanitize filenames and content disposition.
- Validate content type, size, checksum, sensitivity, and download policy.
- Ordinary uploads remain `authorized`; only an Administrator may approve a
  `public` or `approved` policy, and downloads send `nosniff`/no-store headers.
- Report templates receive governed fields only and escape untrusted content.
- Exports exclude credentials, owner/contact fields unless explicitly approved,
  exact internal predictions, hidden prompts, and unrestricted raw tables.

## Ask CFS and prompt injection

- Treat user text and retrieved content as data, never trusted instructions.
- Keep system/developer prompts server-side and do not persist them.
- Ground answers in approved source-registry evidence and visible caveats.
- Restrict tools/data access by principal before model invocation.
- Redact secrets and private fields from prompts, summaries, audit, and errors.
- Persist safe question/answer summaries and provider/prompt version only.
- Deterministic `none` mode remains available; no OpenAI key is needed for CI.

## Ingestion and data quality

Only Data Steward may explicitly apply a passing staged run. Checksums, schema,
SRID/geometry, duplicates, null rates, reconciliation, and freshness are gates.
Tests use temporary output and an isolated database. Failed ingestion preserves
the last valid state and immutable run evidence.

## Audit and redaction

Audit captures actor, action, object reference, request ID, result, timestamp,
and intentionally small metadata. It must redact tokens, passwords, keys,
connection strings, hidden prompts, private payloads, and unrestricted file paths.
Authorization denial is audited without echoing supplied credentials.

Application code does not update/delete audit events. Final retention, legal hold,
external SIEM forwarding, and cryptographic sealing are deferred policy choices.

## Request limits and abuse controls

Product endpoints bound declared fields, pages, registry exports, ingestion rows,
artifact bytes, and requests with a valid Content-Length. The deployment gateway
must also cap streamed/chunked bodies. Provider timeouts and retries are bounded.
A future rate-limit adapter will key by trusted principal and route class at the
API gateway or application boundary; no Redis or external limiter is provisioned
without a hosting decision.

## Secrets and operations

- Environment injection or an approved secret store supplies server secrets.
- Images, Compose, docs, CI, and public frontend assets contain no real secrets.
- Logs use safe summaries and never print environment dumps.
- Database/application roles receive least privilege; migrations use a separate
  operator identity.
- Backup media, restore access, rotation, incident response, vulnerability
  scanning, and patch SLAs require organization approval before production.

## Verification status

Existing foundations include explicit CORS, Entra/OIDC JWT validation, bound SQL,
safe health errors, closed CASE artifact allowlisting, and opt-in telemetry.
Product V1 authorization/audit/artifact/ingestion checks extend those boundaries.
Actual check outcomes are recorded in the implementation report. No external
penetration test or production security approval is claimed.
