param(
  [string]$BaseUrl = "https://cfs-api-staging.whiterock-f4f36359.canadacentral.azurecontainerapps.io",
  [string]$KeyVaultName = "cfs-kv-792a9f87",
  [string]$SecretName = "cfs-staging-access-token",
  [string]$OutputRoot = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
if (-not $OutputRoot) { $OutputRoot = Join-Path $RepoRoot.Path "local-data\azure-migration\az3_performance" }
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
if (-not ($OutputRoot.StartsWith((Join-Path $RepoRoot.Path "local-data") + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase))) { throw "Refusing to write prewarm output outside local-data." }
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$Token = az keyvault secret show --vault-name $KeyVaultName --name $SecretName --query value -o tsv
if (-not $Token) { throw "Staging token secret was unavailable." }

$Paths = @(
  "/health",
  "/health/ready",
  "/development/prediction/features/summary",
  "/economics/intelligence",
  "/economics/powerbi-export",
  "/indicators/intelligence"
)
$Headers = @{ "X-CFS-Staging-Token" = $Token }
$Results = foreach ($Path in $Paths) {
  $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  $Response = Invoke-WebRequest -UseBasicParsing -Uri "$($BaseUrl.TrimEnd('/'))$Path" -Headers $Headers -TimeoutSec 180
  $Stopwatch.Stop()
  [ordered]@{
    path = $Path
    status = [int]$Response.StatusCode
    ms = [math]::Round($Stopwatch.Elapsed.TotalMilliseconds, 1)
    process_ms = $Response.Headers["X-CFS-Process-Time-Ms"]
  }
}
Remove-Variable Token -ErrorAction SilentlyContinue

$Report = [ordered]@{
  base_url = $BaseUrl
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  results = $Results
}
$ReportPath = Join-Path $OutputRoot "cfs-api-prewarm.json"
$Report | ConvertTo-Json -Depth 4 | Set-Content -Path $ReportPath -Encoding utf8
$Results | ConvertTo-Json -Depth 4
