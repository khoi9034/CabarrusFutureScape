# Artifact Storage

## Contract

`ArtifactStore` owns storage and retrieval by a validated provider key. Domain
services record artifact metadata and never accept arbitrary filesystem paths.

Required operations are intentionally small:

- store approved bytes/stream and metadata;
- inspect metadata;
- open/download after policy authorization; and
- mark archival state without silently deleting audit history.

## Providers

| Provider | Use | Status |
| --- | --- | --- |
| `PublicStaticArtifactStore` | Existing sanitized public/CASE assets | Implemented foundation |
| `LocalFileArtifactStore` | Approved local generated Product V1 artifacts | Product V1 implementation |
| `FutureObjectStorageArtifactStore` | Hosted object storage adapter | Contract-ready; no service provisioned |

## Metadata

Each record includes artifact ID; object, project, and report references;
filename; content type; byte size; checksum; provider and opaque key;
sensitivity; creator/time; and download policy. Provider keys are not local
paths exposed to clients.

## Security rules

- Normalize and validate filenames used in response headers.
- Resolve local keys beneath one configured storage root and reject traversal.
- Authorize each download against role, organization/project, and policy.
- Record download audit without embedding file contents or credentials.
- Permit only allowlisted content types for generated reports.
- Keep ordinary uploads on the `authorized` policy; public/approved policy
  requires Administrator approval.
- Never expose object-store credentials or server filesystem paths.

## Existing CASE artifacts

CASE files remain in their established locations and byte-identical. Product V1
may register metadata that points to approved files; it does not copy, rewrite,
or use them as disposable test artifacts.

## Status

Public static allowlisting is implemented. Local provider and metadata are
Product V1 scope. Object storage, signed URLs, malware scanning, retention tiers,
and cloud lifecycle configuration are deferred.
