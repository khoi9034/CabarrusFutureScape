# Enterprise Deployment Checklist

This checklist is a future approval gate. Completing repository work does not
authorize a cloud or production deployment.

## Ownership and policy

- [ ] Executive/product owner approves the environment and release scope.
- [ ] Data owner approves sources, licensing, sensitivity, and limitations.
- [ ] Security owner approves identity, roles, CORS/origins, network, secrets,
      logging, retention, incident response, and vulnerability process.
- [ ] Operations owner accepts support, maintenance, backup, and recovery duties.
- [ ] Organization onboarding and user lifecycle are documented.

## Infrastructure

- [ ] Managed PostgreSQL/PostGIS target is private, encrypted, and least-privilege.
- [ ] Migration and runtime identities are separate.
- [ ] Hosted FastAPI and Next.js configuration passes the canonical mode matrix.
- [ ] OIDC issuer/audience/scopes/roles and browser redirect origins are approved.
- [ ] Object storage and external-worker providers are implemented and tested, or
      the environment explicitly remains on supported local providers.
- [ ] TLS, DNS, egress, firewall, request limits, and rate-limit boundary are set.
- [ ] Monitoring/alert routing exists without sensitive payload logging.

## Data and recovery

- [ ] Source registry has accountable owners and current status.
- [ ] Ingestion apply is permissioned, staged, validated, and audited.
- [ ] Database backup/PITR retention is approved.
- [ ] Artifact backup and retention are approved.
- [ ] Restore into an isolated target has been performed, timed, and reconciled.
- [ ] Rollback and forward-fix decisions have named owners.

## Build and security

- [ ] Images build from the reviewed commit and run as non-root.
- [ ] Image/dependency/container vulnerability findings are reviewed.
- [ ] No credentials, raw data, local database, logs, or browser profiles are in
      source, build context, layers, artifacts, or frontend variables.
- [ ] Health and readiness probes are distinct and bounded.
- [ ] Artifact/report/download/path-traversal/prompt-injection tests pass.
- [ ] Authorization allow/deny matrix and audit redaction pass.

## Product acceptance

- [ ] Full Product V1 and legacy regression commands pass on the release commit.
- [ ] Planning, Economics, Master Data, Ask CFS, Power BI, maps, reports, exports,
      and administration are accepted by responsible reviewers.
- [ ] A full 45-minute soak passes with canonical hashes unchanged.
- [ ] Migration upgrade/rollback/re-upgrade passes in an isolated environment.
- [ ] Hosted staging smoke uses sanitized/disposable records and cleans up.
- [ ] Known limitations and operator runbook match the deployed configuration.

## Release controls

- [ ] Human approves merge and deploy separately.
- [ ] Image digest and database revision are recorded.
- [ ] Production tag/history are not rewritten.
- [ ] Rollback target and traffic procedure are verified before cutover.
- [ ] Post-deploy acceptance and monitoring window have named owners.

## Current status

Deferred. The Product V1 branch supplies contract-ready containers, CI, security,
and runbook material but does not provision or deploy an enterprise environment.
