param(
  [Parameter(Mandatory = $true)][string]$DumpRoot,
  [Parameter(Mandatory = $true)][string]$TocList,
  [Parameter(Mandatory = $true)][string]$OutputRoot,
  [int]$Jobs = 1,
  [string]$ResourceGroup = "CFS",
  [string]$ServerName = "cfs",
  [string]$HostName = "cfs.postgres.database.azure.com",
  [string]$Database = "cfs_cloud"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$Server = az postgres flexible-server show --resource-group $ResourceGroup --name $ServerName -o json | ConvertFrom-Json
$Admins = az postgres flexible-server microsoft-entra-admin list --resource-group $ResourceGroup --server-name $ServerName -o json | ConvertFrom-Json
if (-not $Admins) {
  throw "No Microsoft Entra administrator is configured."
}

$env:PGHOST = $HostName
$env:PGPORT = "5432"
$env:PGDATABASE = $Database
$env:PGUSER = @($Admins)[0].principalName
$env:PGSSLMODE = "require"
$env:PGPASSWORD = az account get-access-token --resource https://ossrdbms-aad.database.windows.net --query accessToken -o tsv
if (-not $env:PGPASSWORD) {
  throw "Failed to get Entra token."
}

$WrapperOut = Join-Path $OutputRoot "restore_wrapper.stdout.log"
$WrapperErr = Join-Path $OutputRoot "restore_wrapper.stderr.log"
$MetricsLog = Join-Path $OutputRoot "azure_restore_metrics.jsonl"
$Args = @(
  "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts\azure\restore_cfs_cloud_to_azure.ps1",
  "-DumpRoot", $DumpRoot,
  "-TocList", $TocList,
  "-OutputRoot", $OutputRoot,
  "-Jobs", "$Jobs"
)

try {
  $Process = Start-Process -FilePath "powershell.exe" -ArgumentList $Args -PassThru -WindowStyle Hidden -RedirectStandardOutput $WrapperOut -RedirectStandardError $WrapperErr
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

  $MetricNames = "cpu_percent,cpu_credits_remaining,memory_percent,storage_percent,iops,active_connections,connections_failed"
  while (-not $Process.HasExited) {
    $SampledAt = (Get-Date).ToUniversalTime().ToString("o")
    $MetricJson = az monitor metrics list --resource $Server.id --metric $MetricNames --interval PT1M --aggregation Average -o json
    [ordered]@{ sampled_at = $SampledAt; metrics = ($MetricJson | ConvertFrom-Json).value } |
      ConvertTo-Json -Depth 8 -Compress |
      Add-Content -Path $MetricsLog -Encoding utf8
    Write-Output "restore_running sampled_at=$SampledAt"
    Start-Sleep -Seconds 60
    $Process.Refresh()
  }

  $Process.WaitForExit()
  $Process.Refresh()
  $ExitCode = $Process.ExitCode
  $WrapperText = ""
  if (Test-Path $WrapperOut) {
    $WrapperText = Get-Content $WrapperOut -Raw
  }
  if ($null -eq $ExitCode -or "$ExitCode" -eq "") {
    $ManifestPath = ($WrapperText -split "\r?\n" | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Last 1)
    if ($ManifestPath) {
      $ExitCode = [int]((Get-Content $ManifestPath -Raw | ConvertFrom-Json).exit_code)
    }
  }
  Write-Output "restore_exit_code=$ExitCode"
  if ($WrapperText) {
    Write-Output $WrapperText
  }
  if ($ExitCode -ne 0) {
    throw "Restore wrapper failed with exit code $ExitCode."
  }
} finally {
  foreach ($Name in "PGPASSWORD", "PGUSER", "PGHOST", "PGPORT", "PGDATABASE", "PGSSLMODE") {
    Remove-Item "Env:\$Name" -ErrorAction SilentlyContinue
  }
}
