# CFS Local Folder Consolidation

Audit run: 2026-07-27. Archive target used per request: `C:\CFS_Archive\2026-07-26`.

## Source Of Truth

- Active repository: `C:\CabarrusFutureScape`
- Branch: `main`
- Remote: `https://github.com/khoi9034/CabarrusFutureScape.git`

## Folder Results

| Original folder | Classification | Result |
| --- | --- | --- |
| `C:\CabarrusFutureScape` | Active repository | Kept as source of truth. |
| `C:\CabarrusFutureScape-main-merge` | Clean detached Git worktree; HEAD is an ancestor of `main` | Moved with `git worktree move` to `C:\CFS_Archive\2026-07-26\CabarrusFutureScape-main-merge`. |
| `C:\CFS_Azure_Migration` | Azure migration artifact workspace with unique generated evidence and a database dump | Moved to ignored `C:\CabarrusFutureScape\local-data\azure-migration`. |
| `C:\CFS_Azure_Migration_Test` | Empty Azure test workspace | Moved to `C:\CFS_Archive\2026-07-26\CFS_Azure_Migration_Test`. |
| `C:\CFS_Data` | Raw GIS data folder | Moved to ignored `C:\CabarrusFutureScape\local-data\CFS_Data`. |

## Git Safety

- `local-data/` is ignored by Git and Docker build contexts.
- Raw GeoTIFFs, database dumps, local env files, cache folders, `.next`, `node_modules`, and archived folders are not intended for staging.
- Azure script defaults now write artifacts under ignored `local-data\azure-migration`.
- The old `C:\CFS_Azure_Migration` path remains only as a Docker ignore guard in case that folder is recreated.

## Preserved Local Artifacts

- CASE-1 local source JSON remains under `local-data\azure-migration\case1`.
- AZ-1B/AZ-2 migration manifests, smoke reports, restore logs, and dumps remain under `local-data\azure-migration`.
- Microclimate GeoTIFFs remain under `local-data\CFS_Data\Microclimate`.
