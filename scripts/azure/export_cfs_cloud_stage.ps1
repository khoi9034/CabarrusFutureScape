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
$Psql = Join-Path $PgBin "psql.exe"
$PgDumpVersion = & $PgDump --version
if ($LASTEXITCODE -ne 0 -or $PgDumpVersion -notmatch "PostgreSQL\) 18\.") {
  throw "pg_dump from PostgreSQL 18 is required."
}

if (Test-Path $DumpRoot) {
  throw "Dump directory already exists: $DumpRoot"
}

$HadPgPassword = [bool]$env:PGPASSWORD
if (-not $HadPgPassword) {
  $env:PGPASSWORD = Read-Host "Enter local PostgreSQL password if required, then press Enter" -AsSecureString |
    ForEach-Object { [System.Net.NetworkCredential]::new("", $_).Password }
}

try {
  $StartTime = (Get-Date).ToUniversalTime()
  $CountsJson = & $Psql `
    --host localhost `
    --port 5433 `
    --username postgres `
    --dbname cfs_cloud_stage `
    -X `
    -qAt `
    -v ON_ERROR_STOP=1 `
    -c "SELECT jsonb_build_object('table_count', (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'), 'view_count', (SELECT COUNT(*) FROM information_schema.views WHERE table_schema='public'))::text"
  if ($LASTEXITCODE -ne 0) { throw "Pre-export object count failed." }

  $StdoutPath = Join-Path $OutputRoot "export_cfs_cloud_stage.stdout.log"
  $StderrPath = Join-Path $OutputRoot "export_cfs_cloud_stage.stderr.log"
  $DumpArgs = @(
    "--host", "localhost",
    "--port", "5433",
    "--username", "postgres",
    "--dbname", "cfs_cloud_stage",
    "--format", "directory",
    "--jobs", "$Jobs",
    "--file", $DumpRoot,
    "--no-owner",
    "--no-acl",
    "--verbose"
  )
  $DumpProcess = Start-Process -FilePath $PgDump -ArgumentList $DumpArgs -Wait -PassThru -WindowStyle Hidden -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
  Get-Content $StdoutPath, $StderrPath -ErrorAction SilentlyContinue | Set-Content -Path $LogPath -Encoding utf8
  Remove-Item $StdoutPath, $StderrPath -Force -ErrorAction SilentlyContinue
  if ($DumpProcess.ExitCode -ne 0) { throw "pg_dump failed. See $LogPath" }
  $EndTime = (Get-Date).ToUniversalTime()
  $DumpBytes = (Get-ChildItem -Recurse -File $DumpRoot | Measure-Object -Property Length -Sum).Sum
  Get-ChildItem -Recurse $DumpRoot | Get-FileHash -Algorithm SHA256 |
    Select-Object Path, Hash |
    ConvertTo-Json -Depth 3 |
    Set-Content -Path (Join-Path $OutputRoot "cfs_cloud_stage_dump_sha256.json") -Encoding utf8
  [ordered]@{
    generated_at = (Get-Date).ToUniversalTime().ToString("o")
    database = "cfs_cloud_stage"
    started_at = $StartTime.ToString("o")
    completed_at = $EndTime.ToString("o")
    duration_seconds = [math]::Round(($EndTime - $StartTime).TotalSeconds, 1)
    pg_dump_version = $PgDumpVersion
    format = "directory"
    jobs = $Jobs
    no_owner = $true
    no_acl = $true
    dump_bytes = $DumpBytes
    table_count = ($CountsJson | ConvertFrom-Json).table_count
    view_count = ($CountsJson | ConvertFrom-Json).view_count
    dump_path = $DumpRoot
    checksum_path = (Join-Path $OutputRoot "cfs_cloud_stage_dump_sha256.json")
  } | ConvertTo-Json -Depth 3 | Set-Content -Path (Join-Path $OutputRoot "cfs_cloud_stage_export_manifest.json") -Encoding utf8
} finally {
  if (-not $HadPgPassword) {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  }
}
