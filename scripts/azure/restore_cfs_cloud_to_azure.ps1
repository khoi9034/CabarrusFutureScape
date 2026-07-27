param(
  [Parameter(Mandatory = $true)][string]$DumpRoot,
  [Parameter(Mandatory = $true)][string]$TocList,
  [string]$OutputRoot = "",
  [int]$Jobs = 1
)

$ErrorActionPreference = "Stop"
$PgBin = "C:\Program Files\PostgreSQL\18\bin"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$AllowedRoot = Join-Path $RepoRoot.Path "local-data\azure-migration"
if (-not $OutputRoot) { $OutputRoot = $AllowedRoot }
New-Item -ItemType Directory -Force -Path $AllowedRoot | Out-Null
$AllowedRoot = (Resolve-Path $AllowedRoot).Path
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)

if (-not ($OutputRoot.Equals($AllowedRoot, [System.StringComparison]::OrdinalIgnoreCase) -or $OutputRoot.StartsWith($AllowedRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase))) {
  throw "Refusing to write restore artifacts outside local-data\azure-migration."
}
if ($Jobs -lt 1 -or $Jobs -gt 2) {
  throw "Azure restore parallelism is capped at 2 jobs. Use 1 for B1ms."
}
if ($env:PGSSLMODE -ne "require") {
  throw "PGSSLMODE=require is required for Azure restore."
}
foreach ($name in @("PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD")) {
  if (-not (Get-Item "Env:\$name" -ErrorAction SilentlyContinue)) {
    throw "$name must be set in the current process."
  }
}

$PgRestore = Join-Path $PgBin "pg_restore.exe"
$PgRestoreVersion = & $PgRestore --version
if ($LASTEXITCODE -ne 0 -or $PgRestoreVersion -notmatch "PostgreSQL\) 18\.") {
  throw "pg_restore from PostgreSQL 18 is required."
}

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
$StartedAt = (Get-Date).ToUniversalTime()
$Stamp = $StartedAt.ToString("yyyyMMdd_HHmmss")
$StdoutPath = Join-Path $OutputRoot "restore_cfs_cloud_$Stamp.stdout.log"
$StderrPath = Join-Path $OutputRoot "restore_cfs_cloud_$Stamp.stderr.log"
$LogPath = Join-Path $OutputRoot "restore_cfs_cloud_$Stamp.log"
$ManifestPath = Join-Path $OutputRoot "restore_cfs_cloud_$Stamp.manifest.json"

$Args = @(
  "--dbname", $env:PGDATABASE,
  "--jobs", "$Jobs",
  "--no-owner",
  "--no-acl",
  "--exit-on-error",
  "--use-list", $TocList,
  "--verbose",
  $DumpRoot
)

$Process = Start-Process -FilePath $PgRestore -ArgumentList $Args -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
$CompletedAt = (Get-Date).ToUniversalTime()
Get-Content $StdoutPath, $StderrPath -ErrorAction SilentlyContinue | Set-Content -Path $LogPath -Encoding utf8

[ordered]@{
  started_at = $StartedAt.ToString("o")
  completed_at = $CompletedAt.ToString("o")
  duration_seconds = [math]::Round(($CompletedAt - $StartedAt).TotalSeconds, 1)
  pg_restore_version = $PgRestoreVersion
  database = $env:PGDATABASE
  host = $env:PGHOST
  sslmode = $env:PGSSLMODE
  jobs = $Jobs
  no_owner = $true
  no_acl = $true
  exit_on_error = $true
  exit_code = $Process.ExitCode
  dump_path = $DumpRoot
  toc_list = $TocList
  log_path = $LogPath
} | ConvertTo-Json -Depth 3 | Set-Content -Path $ManifestPath -Encoding utf8

Remove-Item $StdoutPath, $StderrPath -Force -ErrorAction SilentlyContinue
if ($Process.ExitCode -ne 0) {
  throw "pg_restore failed with exit code $($Process.ExitCode). See $LogPath"
}

Write-Output $ManifestPath
