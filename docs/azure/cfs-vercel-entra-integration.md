# CFS Vercel Preview And Entra Integration

Last updated: 2026-07-17

## Architecture

AZ-3 connects the Vercel Preview frontend to the Azure Container Apps API without exposing the temporary staging token to browser JavaScript.

Flow:

1. Browser loads a Vercel Preview deployment.
2. MSAL signs the analyst into Microsoft Entra.
3. The frontend requests the delegated `CFS.Access` scope.
4. Browser requests to the Azure API include `Authorization: Bearer <token>`.
5. FastAPI validates issuer, audience, signature, expiration, scope, and allowed object ID.
6. Existing `X-CFS-Staging-Token` protection remains available during rollout.

## Resources

| Purpose | Name |
| --- | --- |
| API app registration | `cfs-api-staging` |
| Frontend SPA app registration | `cfs-web-staging` |
| API scope | `CFS.Access` |
| Write app role | `CFS.Write` |
| Admin app role | `CFS.Admin` |
| Azure API | `https://cfs-api-staging.whiterock-f4f36359.canadacentral.azurecontainerapps.io` |
| Vercel Preview tested | Private Vercel Preview deployment; exact Shareable Link omitted |

Client IDs, tenant IDs, and app ID URIs are identifiers, not secrets. Keep them in deployment configuration, not hard-coded broadly.

## Backend Auth

Cloud settings:

```text
CFS_API_AUTH_MODE=entra
CFS_ENTRA_TENANT_ID=<tenant-id>
CFS_ENTRA_API_AUDIENCE=api://<api-client-id>
CFS_ENTRA_REQUIRED_SCOPE=CFS.Access
CFS_ENTRA_ALLOWED_OBJECT_IDS=<private-allowlist>
CFS_ENTRA_WRITE_ROLE=CFS.Write
CFS_ENTRA_ADMIN_ROLE=CFS.Admin
```

FastAPI rejects missing, expired, wrong-audience, wrong-tenant, invalid-signature, missing-scope, and unauthorized-user tokens. It does not log bearer tokens.

## Route Matrix

| Class | Routes |
| --- | --- |
| Public minimal health | `/health`, `/health/ready`, `/health/database` |
| Authenticated read | parcels, planning, economics, Model Lab, Power BI export, Ask CFS, indicators, WSACC, investment reads |
| Authenticated write | candidate intake, saved items, recent work, saved searches, engagements, underwriting, reports |
| Admin | `/economics/export-diagnostics`, future `/ops/*` routes |

The staging token is still accepted first. This is temporary and should be removed after Entra preview QA passes end to end.

## Frontend Auth

The Vercel frontend uses `@azure/msal-browser` in [EntraAuthGate.tsx](/C:/CabarrusFutureScape/src/components/auth/EntraAuthGate.tsx).

Preview env vars:

```text
NEXT_PUBLIC_CFS_API_BASE_URL=https://cfs-api-staging.whiterock-f4f36359.canadacentral.azurecontainerapps.io
NEXT_PUBLIC_USE_BACKEND_API=true
NEXT_PUBLIC_CFS_DEPLOYMENT_MODE=live
NEXT_PUBLIC_CFS_AUTH_MODE=entra
NEXT_PUBLIC_CFS_ENTRA_TENANT_ID=<tenant-id>
NEXT_PUBLIC_CFS_ENTRA_CLIENT_ID=<spa-client-id>
NEXT_PUBLIC_CFS_ENTRA_API_SCOPE=api://<api-client-id>/CFS.Access
```

No staging token, API key, database credential, or client secret belongs in a `NEXT_PUBLIC_` variable.

## Model Lab Fix

Root cause: `GET /development/prediction/features/summary` scanned several static model-feature tables on every request:

| Query group | Azure timing |
| --- | ---: |
| Main 1.43M-row feature count/distinct/min/max | 18.8s |
| Missingness scan over 1.43M rows | 13.3s |
| Label-rate scan over 1.43M rows | 12.6s |
| Score metadata over 440k rows | 5.6s |
| Enhanced feature counts over three 1.43M-row tables | 60.4s |

Fix: the API now caches the safe aggregate response in process for `CFS_MODEL_LAB_SUMMARY_CACHE_TTL_SECONDS` seconds. `scripts/azure/prewarm_cfs_api.ps1` warms Model Lab, economics, Power BI, and Indicator Center before demos.

Before: 115.3s smoke timing, 109.9s container process time.

After prewarm/cache: 1.09s smoke timing, 5.1ms container process time on the direct cache-hit check.

No raw model scores, exact probabilities, owner fields, or mailing fields are cached.

## CORS

Allowed origins are explicit:

- current production Vercel origin where needed
- localhost development origins
- exact Vercel Preview URL under test

Wildcard origins are not used. Credentials remain disabled. Preflight from the tested preview returned `200` and allowed `Authorization`.

## Vercel Preview

The preview build succeeded with the Azure/Entra public env vars. The exact Vercel Shareable Link is private and is not committed.

Vercel Deployment Protection remained enabled. Codex could not inject the Vercel Protection automation bypass secret into its tool process, so Codex browser automation without that header correctly reached Vercel Login before the CFS Entra gate. Final interactive browser authentication QA was completed manually by the user in a normal browser. Do not claim that Codex automated the Microsoft Entra interactive sign-in.

Manual Preview QA verified:

- the private Vercel Shareable Link reached the Preview deployment
- the CFS Microsoft Entra login appeared
- authorized account sign-in succeeded
- signed-out access was rejected
- Planning, Economics, Investment, Ask CFS, Model Lab, Power BI & Tools, reports, and saved-work flows loaded
- a temporary writable saved-work action succeeded and the temporary QA record was removed
- sign-out succeeded and protected CFS content required authentication afterward

Production Vercel environment variables were not changed.

## Monitoring

Application Insights should track:

- request p50/p95/p99
- 401 and 403 counts
- 5xx rate
- PostgreSQL dependency duration
- Model Lab duration
- economics duration
- Ask CFS provider duration
- cold starts and restarts

Do not send bearer tokens, prompts containing private context, database URLs, owner/mailing values, or raw WSACC data.

## Alerts

Staging alert candidates:

- repeated `/health/ready` failures
- repeated container restarts
- sustained 5xx rate
- Model Lab over 10s after prewarm
- PostgreSQL CPU or memory sustained high
- CPU credits approaching exhaustion
- authentication failure spike

Avoid alerts on a single failed request.

## Rollback

Backend rollback:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\azure\rollback_cfs_api_container_app.ps1 -ImageTag <known-good-tag>
```

Frontend rollback:

1. Stop using the preview deployment.
2. Keep production Vercel API settings unchanged.
3. Restore the previous preview env values or redeploy the prior preview.

## Production Cutover Checklist

- Azure health passes
- database health passes
- Entra login passes
- unauthorized access fails
- Planning passes
- Economics passes
- Investment passes
- Ask CFS passes
- Model Lab warm latency is acceptable
- reports and writable records pass
- CORS passes from the production origin
- no secrets are exposed
- monitoring and rollback are verified
- previous production API configuration is recorded

Do not perform production cutover in AZ-3.

## Known Limits

- Codex browser automation of the protected Vercel Preview remains blocked unless the Vercel Protection automation bypass secret is injected into the Codex tool process. Manual browser QA passed in the user's normal browser.
- The staging-token fallback remains enabled during rollout.
- PostgreSQL is still B1ms and not suitable for heavy concurrent demos or model rebuilds.
- Private networking is still a future hardening item.
