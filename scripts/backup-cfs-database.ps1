param(
  [string]$BackupDirectory = $env:CFS_BACKUP_DIRECTORY,
  [string]$HostName = $(if ($env:POSTGRES_HOST) { $env:POSTGRES_HOST } else { "localhost" }),
  [int]$Port = $(if ($env:POSTGRES_PORT) { [int]$env:POSTGRES_PORT } else { 5433 }),
  [string]$Database = $(if ($env:POSTGRES_DB) { $env:POSTGRES_DB } else { "cfs_dev" }),
  [string]$User = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { "postgres" }),
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Find-PgTool {
  param([string]$Name)
  $command = Get-Command "$Name.exe" -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  $candidate = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\$Name.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
  if (!$candidate) { throw "$Name was not found. Install the PostgreSQL client tools." }
  return $candidate.FullName
}

if ([string]::IsNullOrWhiteSpace($BackupDirectory)) {
  throw "Set CFS_BACKUP_DIRECTORY to an operator-approved directory outside the repository."
}
$target = [IO.Path]::GetFullPath($BackupDirectory)
$rootPrefix = $Root.TrimEnd('\') + '\'
if ($target.Equals($Root, [StringComparison]::OrdinalIgnoreCase) -or
    $target.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Database backups must be stored outside the repository."
}

$pgDump = Find-PgTool "pg_dump"
$pgRestore = Find-PgTool "pg_restore"
if ($CheckOnly) {
  Write-Host "[cfs-backup] PASS - pg_dump and pg_restore are available; target is outside the repository."
  exit 0
}

New-Item -ItemType Directory -Path $target -Force | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd_HHmmssZ")
$dump = Join-Path $target "$Database`_$stamp.dump"
$checksum = "$dump.sha256"

& $pgDump --host $HostName --port $Port --username $User --dbname $Database `
  --format custom --compress 6 --no-owner --no-acl --file $dump
if ($LASTEXITCODE -ne 0) {
  if (Test-Path -LiteralPath $dump) { Remove-Item -LiteralPath $dump -Force }
  throw "pg_dump failed; no backup was retained."
}
& $pgRestore --list $dump | Out-Null
if ($LASTEXITCODE -ne 0) { throw "pg_restore could not read the completed backup." }
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $dump).Hash.ToLowerInvariant()
"$hash  $([IO.Path]::GetFileName($dump))" | Set-Content -LiteralPath $checksum -Encoding ascii
Write-Host "[cfs-backup] PASS - backup and SHA-256 checksum created in $target."
