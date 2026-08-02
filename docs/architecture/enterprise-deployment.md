# Enterprise Deployment Architecture

## What this branch provides

- A multi-stage standalone Next.js image running as uid 10001.
- A slim FastAPI image running as uid 10001.
- Process health checks and explicit loopback-bound host ports.
- `docker-compose.enterprise-local.yml` with environment injection and no
  packaged database or raw data.
- A sanitized GitHub validation workflow with read-only repository permission.

No registry, managed database, identity tenant, object store, worker, monitoring
service, or production environment is provisioned.

## Enterprise-local reference

The Compose file exercises the deployable shape with safe local adapters:

```text
CFS_RUNTIME_MODE=local
CFS_DATA_PROVIDER=local_api
CFS_AUTH_MODE=local_dev
CFS_ARTIFACT_PROVIDER=local_file
CFS_JOB_PROVIDER=inline
```

It connects to a separately approved PostgreSQL/PostGIS target through
`CFS_ENTERPRISE_DATABASE_URL`. It does not start or package raw `cfs_dev`.

PowerShell example using an isolated, operator-selected database:

```powershell
$env:CFS_ENTERPRISE_DATABASE_URL = "postgresql+psycopg://<user>:<password>@host.docker.internal:5432/<approved-db>"
$env:CFS_PUBLIC_API_BASE_URL = "http://localhost:8000"
docker compose -f docker-compose.enterprise-local.yml config
docker compose -f docker-compose.enterprise-local.yml build
docker compose -f docker-compose.enterprise-local.yml run --rm api python migrations/manage.py upgrade
docker compose -f docker-compose.enterprise-local.yml up
```

Do not place the real URL in the Compose file, Git, image layers, or frontend
variables. The API readiness check remains unhealthy until the explicit
migration succeeds; startup never runs migrations automatically.

## Hosted promotion

A hosted enterprise environment changes the provider set together:

```text
CFS_RUNTIME_MODE=enterprise
CFS_DATA_PROVIDER=enterprise_api
CFS_AUTH_MODE=oidc
CFS_ARTIFACT_PROVIDER=object_storage
CFS_JOB_PROVIDER=external_worker
CFS_ENTRA_TENANT_ID=<tenant-id>
CFS_ENTRA_API_AUDIENCE=api://<api-client-id>
CFS_ORGANIZATION_ID=<provisioned-organization-id>
```

Hosted startup rejects incomplete or unsafe combinations. OIDC identifiers
that are safe for a browser may be build configuration; tokens, client secrets,
database URLs, object credentials, and AI keys are server/runtime secrets only.
`NEXT_PUBLIC_*` values are frozen into the frontend image during build.

## Health and readiness

Container health verifies the process `/health` endpoint. Traffic readiness
also requires database/migration/provider checks and should use `/health/ready`
at the platform boundary. Health output must not reveal connection details.

## CI boundary

Product V1 CI uses sanitized fixtures and a disposable PostGIS service. It has
no OpenAI key and performs no cloud login, image push, deployment, or production
canary mutation. The existing production deployment workflow is outside this
branch's validation workflow and is not invoked by it.

## Deferred platform work

See [deployment checklist](../operations/deployment-checklist.md). Hosting,
networking, TLS, managed identity, backup policy, monitoring, scaling, and
production acceptance require explicit approval.
