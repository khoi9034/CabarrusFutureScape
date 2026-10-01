param(
  [string]$FrontendUrl = "http://127.0.0.1:3000",
  [string]$ApiBaseUrl = "http://127.0.0.1:8000",
  [string]$BackupDirectory = $env:CFS_BACKUP_DIRECTORY
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Python = Join-Path $Root ".venv\Scripts\python.exe"
$failures = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()

function Check-Step {
  param([string]$Name, [scriptblock]$Action)
  try {
    & $Action
    Write-Host "[cfs-ready] PASS $Name"
  } catch {
    $failures.Add("$Name`: $($_.Exception.Message)")
    Write-Host "[cfs-ready] FAIL $Name"
  }
}

function Get-Json {
  param([string]$Url)
  Invoke-RestMethod -Uri $Url -TimeoutSec 20
}

if (!(Test-Path -LiteralPath $Python)) { $Python = "python" }

Check-Step "PostgreSQL/PostGIS, core tables, and source freshness" {
  & $Python (Join-Path $Root "scripts\check_cfs_local_data.py")
  if ($LASTEXITCODE -ne 0) { throw "local data readiness failed" }
  $report = Get-Content (Join-Path $Root "logs\local-data-readiness.json") -Raw | ConvertFrom-Json
  if (@($report.demo_datasets).Count -lt 10) { throw "freshness inventory is incomplete" }
}

Check-Step "FastAPI liveness" {
  if ((Get-Json "$ApiBaseUrl/health").status -ne "ok") { throw "health is not ok" }
}
Check-Step "FastAPI readiness" {
  if ((Get-Json "$ApiBaseUrl/health/ready").status -ne "ready") { throw "readiness is not ready" }
}
Check-Step "Database endpoint" {
  if ((Get-Json "$ApiBaseUrl/health/database").database -ne "connected") { throw "database is not connected" }
}
Check-Step "Ask Insights configuration" {
  $ai = Get-Json "$ApiBaseUrl/ai/status"
  if ($ai.ai_enabled -and (!$ai.api_key_configured -or !$ai.model_configured)) {
    throw "AI is enabled but its backend-only provider configuration is incomplete"
  }
}
Check-Step "Frontend" {
  $response = Invoke-WebRequest -UseBasicParsing -Uri $FrontendUrl -TimeoutSec 20
  if ($response.StatusCode -ne 200) { throw "frontend returned HTTP $($response.StatusCode)" }
}

if ([string]::IsNullOrWhiteSpace($BackupDirectory)) {
  $warnings.Add("CFS_BACKUP_DIRECTORY is not configured; backups are not operationally scheduled.")
} else {
  Check-Step "Backup destination" {
    $target = [IO.Path]::GetFullPath($BackupDirectory)
    if (!(Test-Path -LiteralPath $target -PathType Container)) { throw "directory does not exist" }
    $probe = Join-Path $target (".cfs-write-test-" + [guid]::NewGuid().ToString("N"))
    try { [IO.File]::WriteAllText($probe, "ready") } finally { if (Test-Path -LiteralPath $probe) { Remove-Item -LiteralPath $probe -Force } }
    $drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($target).TrimEnd('\').TrimEnd(':')) -ErrorAction SilentlyContinue
    if ($drive -and $drive.Free -lt 20GB) { $warnings.Add("Backup volume has less than 20 GB free.") }
  }
}

foreach ($warning in $warnings) { Write-Host "[cfs-ready] WARN $warning" }
if ($failures.Count) {
  foreach ($failure in $failures) { Write-Host "[cfs-ready] $failure" }
  Write-Host "[cfs-ready] FAIL - $($failures.Count) required check(s) failed; $($warnings.Count) warning(s)."
  exit 1
}
Write-Host "[cfs-ready] PASS - required services and governed local data are ready; $($warnings.Count) warning(s)."
