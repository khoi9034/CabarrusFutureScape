param(
  [string]$OutputRoot = "C:\CFS_Azure_Migration",
  [int]$Jobs = 4
)

$ErrorActionPreference = "Stop"
$PgBin = "C:\Program Files\PostgreSQL\18\bin"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$AllowedRoot = "C:\CFS_Azure_Migration"
New-Item -ItemType Directory -Force -Path $AllowedRoot | Out-Null
$AllowedRoot = (Resolve-Path $AllowedRoot).Path
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$DumpRoot = Join-Path $OutputRoot "cfs_cloud_stage_dump"
$LogPath = Join-Path $OutputRoot "export_cfs_cloud_stage.log"

if ($OutputRoot.StartsWith($RepoRoot.Path)) {
  throw "Refusing to write migration artifacts inside the repository."
}

if (-not ($OutputRoot.Equals($AllowedRoot, [System.StringComparison]::OrdinalIgnoreCase) -or $OutputRoot.StartsWith($AllowedRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase))) {
  throw "Refusing to write migration artifacts outside C:\CFS_Azure_Migration."
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
$OutputRoot = (Resolve-Path $OutputRoot).Path
$DumpRoot = Join-Path $OutputRoot "cfs_cloud_stage_dump"
$LogPath = Join-Path $OutputRoot "export_cfs_cloud_stage.log"

if (!(Test-Path $PgBin)) {
  throw "PostgreSQL 18 client tools were not found at $PgBin"
}

$PgDump = Join-Path $PgBin "pg_dump.exe"
$PgDumpVersion = & $PgDump --version
if ($LASTEXITCODE -ne 0 -or $PgDumpVersion -notmatch "PostgreSQL\) 18\.") {
  throw "pg_dump from PostgreSQL 18 is required."
}

if (Test-Path $DumpRoot) {
  throw "Dump directory already exists: $DumpRoot"
}

$env:PGPASSWORD = Read-Host "Enter local PostgreSQL password if required, then press Enter" -AsSecureString |
  ForEach-Object { [System.Net.NetworkCredential]::new("", $_).Password }

try {
  & $PgDump `
    --host localhost `
    --port 5433 `
    --username postgres `
    --dbname cfs_cloud_stage `
    --format directory `
    --jobs $Jobs `
    --file $DumpRoot `
    --no-owner `
    --no-acl `
    --verbose *> $LogPath
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed. See $LogPath" }
  Get-ChildItem -Recurse $DumpRoot | Get-FileHash -Algorithm SHA256 |
    Select-Object Path, Hash |
    ConvertTo-Json -Depth 3 |
    Set-Content -Path (Join-Path $OutputRoot "cfs_cloud_stage_dump_sha256.json") -Encoding utf8
  [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    database = "cfs_cloud_stage"
    pg_dump_version = $PgDumpVersion
    format = "directory"
    jobs = $Jobs
    no_owner = $true
    no_acl = $true
    dump_path = $DumpRoot
    checksum_path = (Join-Path $OutputRoot "cfs_cloud_stage_dump_sha256.json")
  } | ConvertTo-Json -Depth 3 | Set-Content -Path (Join-Path $OutputRoot "cfs_cloud_stage_export_manifest.json") -Encoding utf8
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
