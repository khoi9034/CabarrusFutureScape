param(
  [switch]$FrontendOnly,
  [switch]$BackendOnly,
  [switch]$CheckOnly,
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ($FrontendOnly -and $BackendOnly) {
  throw "Choose FrontendOnly or BackendOnly, not both."
}

function Write-Cfs {
  param([string]$Message)
  if (!$Quiet) {
    Write-Host "[cfs-stop] $Message"
  }
}

function Get-ProcessInfo {
  param([int]$ProcessId)
  Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
}

function Get-AncestorProcesses {
  param([int]$ProcessId)

  $ancestors = @()
  $current = Get-ProcessInfo -ProcessId $ProcessId
  while ($current -and $current.ParentProcessId -gt 0 -and $ancestors.Count -lt 8) {
    $current = Get-ProcessInfo -ProcessId ([int]$current.ParentProcessId)
    if ($current) {
      $ancestors += $current
    }
  }
  return $ancestors
}

function Test-CfsOwnedListener {
  param(
    [int]$Port,
    [int]$ProcessId
  )

  $owner = Get-ProcessInfo -ProcessId $ProcessId
  if (!$owner -or !$owner.CommandLine) {
    return $false
  }

  $rootText = $Root.ToLowerInvariant()
  $ownerCommand = $owner.CommandLine.ToLowerInvariant()
  $ancestors = @(Get-AncestorProcesses -ProcessId $ProcessId)

  if ($Port -eq 8000) {
    $uvicorn = $ownerCommand -match "uvicorn\s+app\.main:app" -and
      $ownerCommand -match "--port\s+8000"
    $rootedLauncher = $ancestors | Where-Object {
      $_.CommandLine -and
      $_.CommandLine.ToLowerInvariant().Contains($rootText) -and
      $_.CommandLine -match "uvicorn\s+app\.main:app"
    }
    return $uvicorn -and ($ownerCommand.Contains($rootText) -or $rootedLauncher)
  }

  if ($Port -eq 3000) {
    $rootedNext = $ownerCommand.Contains($rootText) -and
      $ownerCommand -match "next"
    $rootedLauncher = $ancestors | Where-Object {
      $_.CommandLine -and
      $_.CommandLine.ToLowerInvariant().Contains($rootText) -and
      $_.CommandLine -match "(next|npm(\.cmd)?\s+run\s+(dev|start))"
    }
    return [bool]($rootedNext -or $rootedLauncher)
  }

  return $false
}

function Invoke-PortAction {
  param([int]$Port)

  $listeners = @(
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  )
  if ($listeners.Count -eq 0) {
    Write-Cfs "Port $Port is already free."
    return
  }

  foreach ($listener in $listeners) {
    $ownerPid = [int]$listener.OwningProcess
    $owner = Get-ProcessInfo -ProcessId $ownerPid
    $name = if ($owner) { $owner.Name } else { "unknown" }
    if (!(Test-CfsOwnedListener -Port $Port -ProcessId $ownerPid)) {
      throw "Refusing to stop PID $ownerPid ($name) on port $Port because it is not a confirmed CFS process."
    }

    if ($CheckOnly) {
      Write-Cfs "Port $Port is owned by confirmed CFS PID $ownerPid ($name)."
      continue
    }

    Write-Cfs "Stopping confirmed CFS PID $ownerPid ($name) on port $Port."
    Stop-Process -Id $ownerPid -Force
  }

  if (!$CheckOnly) {
    $deadline = (Get-Date).AddSeconds(15)
    do {
      Start-Sleep -Milliseconds 250
      $remaining = @(
        Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
      )
    } while ($remaining.Count -gt 0 -and (Get-Date) -lt $deadline)

    if ($remaining.Count -gt 0) {
      throw "CFS process stopped but port $Port did not release within 15 seconds."
    }
    Write-Cfs "Port $Port released."
  }
}

$ports = if ($FrontendOnly) {
  @(3000)
} elseif ($BackendOnly) {
  @(8000)
} else {
  @(3000, 8000)
}

foreach ($port in $ports) {
  Invoke-PortAction -Port $port
}

if (!$CheckOnly) {
  Write-Cfs "Requested CFS services stopped. PostgreSQL was not touched."
}
