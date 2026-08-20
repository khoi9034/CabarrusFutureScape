# CFS Azure Container Apps Deployment

Last updated: 2026-07-16

## Architecture

The CFS FastAPI backend runs as `cfs-api-staging` on Azure Container Apps and connects to the restored cloud-safe `cfs_cloud` Azure Database for PostgreSQL Flexible Server using Microsoft Entra authentication and the `cfs_app` database role.

The staging API is externally reachable for QA, but private application routes require the server-side staging access token stored in Key Vault. Health endpoints remain anonymous and return only minimal status.

Vercel is not connected in AZ-2.

## Resource Inventory

| Resource | Name | Notes |
| --- | --- | --- |
| Resource group | `CFS` | Existing group; deployment resources are in Canada Central. |
| PostgreSQL Flexible Server | `cfs.postgres.database.azure.com` | PostgreSQL 18.4, PostGIS 3.6.1, database `cfs_cloud`. |
| User-assigned identity | `cfs-api-mi` | Client ID `badf9f30-037d-4421-be6a-f2b48480bf46`; principal ID `fd37b58f-5f2f-422a-883f-c1952e6e273e`. |
| Azure Container Registry | `cfsacr792a9f873a` | Basic tier, admin disabled, anonymous pull disabled. |
| Image repository | `cfs-api` | Images are tagged with commit SHA or temporary validation tags. |
| Key Vault | `cfs-kv-792a9f87` | Stores staging access token, Application Insights connection string, and OpenAI key when available. |
| Log Analytics | `cfs-api-law` | Container Apps logs. |
| Application Insights | `cfs-api-ai` | Azure Monitor OpenTelemetry target. |
| Container Apps environment | `cfs-api-env` | Single app environment for staging API. |
| Container App | `cfs-api-staging` | FQDN: `cfs-api-staging.whiterock-f4f36359.canadacentral.azurecontainerapps.io`. |

## Docker Image

The production image is built from [backend/Dockerfile](/C:/CabarrusFutureScape/backend/Dockerfile).

Images are tagged with commit SHA. The deployment manifest under ignored `local-data\azure-migration\az2_container_apps` records the currently deployed tag and digest after each run.

| Field | Value |
| --- | --- |
| Registry | `cfsacr792a9f873a.azurecr.io` |
| Repository | `cfs-api` |
| Linux image digest | `sha256:42fe8993467423c0d32d819f58f7a775d57aef21f02ce030a5b17a1bc81a3d00` |
| Local image size | 117,838,514 bytes |

The image runs as non-root user `cfsapi`, listens on port 8000, and starts Uvicorn without reload.

## Database Authentication

Container runtime configuration:

| Setting | Value |
| --- | --- |
| `CFS_DATABASE_AUTH_MODE` | `managed_identity` |
| `CFS_AZURE_POSTGRES_HOST` | `cfs.postgres.database.azure.com` |
| `CFS_AZURE_POSTGRES_DATABASE` | `cfs_cloud` |
| `CFS_AZURE_POSTGRES_USER` | `cfs-api-mi` |
| `AZURE_CLIENT_ID` | User-assigned identity client ID |
| `sslmode` | `require` |

The app uses `ManagedIdentityCredential` and requests tokens for `https://ossrdbms-aad.database.windows.net/.default` per new physical SQLAlchemy connection. Tokens are not stored in `DATABASE_URL` and are not logged.

The managed identity PostgreSQL principal is a login role, inherits `cfs_app`, and has no superuser, createdb, or createrole permissions. `cfs_app` can read approved analytical data and write only approved workflow/cache tables.

Runtime schema creation is intentionally blocked. The backend skips lazy `CREATE TABLE IF NOT EXISTS` calls in managed-identity mode when the required tables already exist.

## PostgreSQL Network Access

Container Apps did not egress from the managed environment static IP during validation. The working AZ-2 network rule is:

| Rule | Range | Purpose |
| --- | --- | --- |
| `AllowAzureServicesForCfsApi` | `0.0.0.0` to `0.0.0.0` | Allows Azure services to reach PostgreSQL; Entra auth and database role grants remain required. |

This is acceptable for private staging, but production should prefer VNet integration plus a private endpoint or a dedicated egress NAT path.

## Key Vault

Configured secret references:

| Container App secret | Source |
| --- | --- |
| `staging-token` | `cfs-staging-access-token` |
| `appinsights` | `applicationinsights-connection-string` |
| `openai-key` | `openai-api-key` |

No PostgreSQL password is stored because database access uses managed identity. A Census key was not present in the local environment during AZ-2 and was not configured.

## Health Probes

| Probe | Path | Meaning |
| --- | --- | --- |
| Startup | `/health` | FastAPI process can serve HTTP. |
| Liveness | `/health` | Process remains responsive; does not depend on PostgreSQL. |
| Readiness | `/health/ready` | Process can connect to PostgreSQL with a bounded check. |

Health endpoints are anonymous. Application routes require staging protection.

## Staging Protection

Cloud staging sets:

| Setting | Value |
| --- | --- |
| `CFS_STAGING_PROTECT_API` | `true` |
| `CFS_STAGING_ACCESS_TOKEN` | Key Vault secret reference |
| `CFS_ENABLE_DOCS` | `false` |

Protected routes accept `X-CFS-Staging-Token` or `Authorization: Bearer`. Do not put the staging token in public frontend JavaScript.

## CORS

Allowed origins:

- `https://cabarrus-future-scape.vercel.app`
- `http://localhost:3000`
- `http://127.0.0.1:3000`

Credentials are disabled and wildcard origins are not allowed in production mode.

## Pooling

Current conservative settings for one replica:

| Setting | Value |
| --- | --- |
| `CFS_DATABASE_POOL_SIZE` | `2` |
| `CFS_DATABASE_MAX_OVERFLOW` | `1` |
| `CFS_DATABASE_POOL_TIMEOUT_SECONDS` | `10` |
| `CFS_DATABASE_POOL_RECYCLE_SECONDS` | `2700` |

Max replicas remain `1` because the B1ms PostgreSQL tier is the bottleneck.

## Telemetry

Telemetry is opt-in through:

- `CFS_TELEMETRY_ENABLED=true`
- `APPLICATIONINSIGHTS_CONNECTION_STRING=secretref:appinsights`

The app initializes Azure Monitor OpenTelemetry early. Logs and telemetry must not include API keys, database URLs, Entra tokens, owner/mailing data, raw WSACC data, or full AI prompts.

## Manual Deployment

Use [scripts/azure/register_cfs_api_mi_postgres.ps1](/C:/CabarrusFutureScape/scripts/azure/register_cfs_api_mi_postgres.ps1) once per managed identity registration:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\azure\register_cfs_api_mi_postgres.ps1
```

Deploy or converge the Container App with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\azure\deploy_cfs_api_container_app.ps1
```

For config-only convergence:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\azure\deploy_cfs_api_container_app.ps1 -ImageTag <tag> -SkipImageBuild
```

Deployment outputs and manifests are written only under ignored `local-data\azure-migration\az2_container_apps`.

## CI/CD

[.github/workflows/deploy-cfs-api.yml](/C:/CabarrusFutureScape/.github/workflows/deploy-cfs-api.yml) builds and deploys only the backend API.

Required repository variables:

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZURE_RESOURCE_GROUP`
- `AZURE_ACR_NAME`
- `AZURE_CONTAINER_APP_NAME`

The Azure app registration or managed identity used by GitHub must have a federated credential for this repository and only the permissions needed to push to ACR and update the Container App.

## Validation

Manual AZ-2 cloud smoke:

```powershell
$env:CFS_STAGING_ACCESS_TOKEN = '<process-only token from Key Vault>'
python scripts\azure\smoke_cfs_api.py `
  --base-url https://cfs-api-staging.whiterock-f4f36359.canadacentral.azurecontainerapps.io `
  --samples 1 `
  --timeout-seconds 240 `
  --output local-data\azure-migration\az2_container_apps\cloud-containerapp-smoke.json
Remove-Item Env:\CFS_STAGING_ACCESS_TOKEN
```

Result: 41/41 checks passed. Temporary QA rows were deleted and verified at zero.

## Performance

Warm smoke timings, one sample per route:

| Operation | Time |
| --- | ---: |
| Health | 1,869 ms |
| Readiness | 1,639 ms |
| Database health | 1,652 ms |
| Parcel search | 5,470 ms |
| Parcel detail | 1,483 ms |
| Development hotspots | 2,395 ms |
| Permit trends | 3,249 ms |
| Model Lab summary | 119,020 ms |
| Indicator Center | 11,104 ms |
| Economics intelligence | 1,556 ms |
| Power BI export | 1,402 ms |
| Ask CFS Planning | 1,157 ms |
| Ask CFS Economics | 1,227 ms |

Scale-to-zero test:

| Cold operation | Time |
| --- | ---: |
| First health after observed drain | 269 ms |
| First database check | 72 ms |
| First research context | 4,973 ms |

The short cold test likely benefited from recently warm platform state; treat it as a lower-bound observation, not a guarantee.

Azure resource observations during smoke:

| Metric | Peak |
| --- | ---: |
| PostgreSQL CPU | 40.46% |
| PostgreSQL memory | 67.85% |
| PostgreSQL active connections | 11 |
| CPU credits remaining | 49 |
| Container App replicas | 1 |
| Container App CPU | 2% |
| Container App memory | 13% |
| Container App response time | 126,499 ms |

B1ms remains fine for private staging and demonstrations. It is not suitable for heavy ETL, model rebuilding, high-throughput usage, or multiple simultaneous users.

## Presentation And Cost Modes

Presentation mode:

```powershell
az containerapp update -g CFS -n cfs-api-staging --min-replicas 1 --max-replicas 1
```

Cost-saving staging mode:

```powershell
az containerapp update -g CFS -n cfs-api-staging --min-replicas 0 --max-replicas 1
```

Restore presentation mode before demos.

## Rollback

List revisions:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\azure\rollback_cfs_api_container_app.ps1 -List
```

Shift traffic to a known healthy revision:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\azure\rollback_cfs_api_container_app.ps1 -RevisionName <revision>
```

The script activates the revision, sets 100% traffic to it, and checks `/health`.

For single-revision mode, redeploy a known good ACR tag:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\azure\rollback_cfs_api_container_app.ps1 -ImageTag <image-tag>
```

This updates the Container App image and checks `/health`.

## Cost Controls

- ACR Basic tier is used.
- Container App max replicas is `1`.
- Presentation mode keeps min replicas at `1`; cost-saving mode can set min replicas to `0`.
- PostgreSQL compute tier was not changed in AZ-2.
- Application Insights and Log Analytics are used for staging telemetry; tune retention and sampling before heavier usage.
- No high availability or duplicate always-on app instances were added.

## Known Limitations

- Staging API protection is a temporary server-side token, not production authentication.
- The API is externally reachable; private/writable routes are protected, but full Microsoft Entra user authentication is still future work.
- PostgreSQL network access uses the Azure-services firewall rule rather than private networking.
- Model Lab summary is slow on B1ms.
- Census API key was not configured in AZ-2.
- Vercel is not connected and no frontend deployment occurred.

## Next Phase

AZ-3 should connect Vercel through a real authenticated request flow, not a public client-side token. Before production, replace the temporary staging gate with Microsoft Entra or equivalent server-side/user authentication and consider private database networking.
