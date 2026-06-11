param(
  [switch]$NoRestart
)

$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Backend = Join-Path $Root "backend"
$Logs = Join-Path $Root "logs"
$FrontendEnv = Join-Path $Root ".env.local"
$BackendLog = Join-Path $Logs "backend-dev.log"
$FrontendLog = Join-Path $Logs "next-dev.log"

$FrontendUrl = "http://localhost:3000"
$ApiBaseUrl = "http://127.0.0.1:8000"

$ApiChecks = @(
  "/health",
  "/health/database",
  "/parcels/search?q=CFS-PARCEL-0149726579&limit=1",
  "/parcels/CFS-PARCEL-0149726579?include_geometry=true",
  "/development/hotspots?limit=1",
  "/constraints/flood/high-review?limit=1",
  "/constraints/flood/summary",
  "/constraints/flood/zones?limit=1"
)

function Write-Step {
  param([string]$Message)
  Write-Host "[cfs-local] $Message"
}

function Ensure-Directory {
  param([string]$Path)
  if (!(Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Path $Path | Out-Null
  }
}

function Upsert-EnvLine {
  param(
    [string[]]$Lines,
    [string]$Key,
    [string]$Value
  )

  $next = @()
  $found = $false
  foreach ($line in $Lines) {
    if ($line -match "^\s*$([regex]::Escape($Key))=") {
      $next += "$Key=$Value"
      $found = $true
    } else {
      $next += $line
    }
  }

  if (!$found) {
    $next += "$Key=$Value"
  }

  return $next
}

function Ensure-FrontendEnv {
  $lines = @()
  if (Test-Path -LiteralPath $FrontendEnv) {
    $lines = @(Get-Content -LiteralPath $FrontendEnv)
  }

  $lines = Upsert-EnvLine -Lines $lines -Key "NEXT_PUBLIC_USE_BACKEND_API" -Value "true"
  $lines = Upsert-EnvLine -Lines $lines -Key "NEXT_PUBLIC_CFS_API_BASE_URL" -Value $ApiBaseUrl
  Set-Content -LiteralPath $FrontendEnv -Value $lines -Encoding utf8
}

function Get-DescendantProcessIds {
  param([int]$ProcessId)

  $children = @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $ProcessId })
  $ids = @()
  foreach ($child in $children) {
    $ids += Get-DescendantProcessIds -ProcessId $child.ProcessId
    $ids += [int]$child.ProcessId
  }

  return $ids
}

function Stop-ListenersOnPort {
  param([int]$Port)

  $listeners = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
  foreach ($listener in $listeners) {
    $ownerPid = [int]$listener.OwningProcess
    if ($ownerPid -le 0) {
      continue
    }

    $ids = @()
    $ids += Get-DescendantProcessIds -ProcessId $ownerPid
    $ids += $ownerPid
    $ids = $ids | Sort-Object -Unique

    foreach ($id in $ids) {
      $process = Get-Process -Id $id -ErrorAction SilentlyContinue
      if ($process) {
        Write-Step "Stopping process $id on port $Port ($($process.ProcessName))"
        Stop-Process -Id $id -Force -ErrorAction SilentlyContinue
      }
    }
  }
}

function Start-Backend {
  Write-Step "Starting FastAPI on $ApiBaseUrl"
  Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "Set-Location -LiteralPath '$Backend'; python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 *> '$BackendLog'"
    ) `
    -WindowStyle Hidden
}

function Start-Frontend {
  Write-Step "Starting Next.js on $FrontendUrl"
  Start-Process `
    -FilePath "powershell.exe" `
    -ArgumentList @(
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "Set-Location -LiteralPath '$Root'; npm run dev *> '$FrontendLog'"
    ) `
    -WindowStyle Hidden
}

function Wait-Http {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = $null
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 10
      return $response
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Seconds 2
    }
  }

  throw "Timed out waiting for $Url. Last error: $lastError"
}

function Test-ApiEndpoint {
  param([string]$Path)

  $url = "$ApiBaseUrl$Path"
  try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
    [pscustomobject]@{
      Endpoint = $Path
      Status = [int]$response.StatusCode
      Length = [int]$response.Content.Length
      Ok = $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
    }
  } catch {
    [pscustomobject]@{
      Endpoint = $Path
      Status = "ERR"
      Length = 0
      Ok = $false
    }
  }
}

Ensure-Directory -Path $Logs
Ensure-FrontendEnv

if (!$NoRestart) {
  Stop-ListenersOnPort -Port 3000
  Stop-ListenersOnPort -Port 8000
  Start-Sleep -Seconds 2
  Start-Backend
  Start-Frontend
} else {
  Write-Step "NoRestart supplied; checking existing local services."
}

$health = Wait-Http -Url "$ApiBaseUrl/health" -TimeoutSeconds 90
Write-Step "FastAPI health: HTTP $($health.StatusCode)"

$frontend = Wait-Http -Url $FrontendUrl -TimeoutSeconds 120
Write-Step "Frontend health: HTTP $($frontend.StatusCode)"

$apiResults = foreach ($path in $ApiChecks) {
  Test-ApiEndpoint -Path $path
}

$apiResults | Format-Table -AutoSize

$failed = @($apiResults | Where-Object { -not $_.Ok })
if ($failed.Count -gt 0) {
  throw "One or more CFS API checks failed. See $BackendLog and $FrontendLog."
}

Write-Step "Local CFS is ready."
Write-Step "Frontend: $FrontendUrl"
Write-Step "FastAPI:  $ApiBaseUrl"
