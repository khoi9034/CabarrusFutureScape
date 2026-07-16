param(
  [string]$ResourceGroup = "CFS",
  [string]$Location = "canadacentral",
  [string]$IdentityName = "cfs-api-mi",
  [string]$ContainerAppName = "cfs-api-staging",
  [string]$ContainerEnvironmentName = "cfs-api-env",
  [string]$Repository = "cfs-api",
  [string]$ImageTag = "",
  [string]$OutputRoot = "C:\CFS_Azure_Migration\az2_container_apps",
  [string]$PostgresServer = "cfs.postgres.database.azure.com",
  [string]$PostgresDatabase = "cfs_cloud",
  [string]$PostgresResourceGroup = "CFS",
  [string]$PostgresServerName = "cfs",
  [string]$AllowedOrigins = "https://cabarrus-future-scape.vercel.app,http://localhost:3000,http://127.0.0.1:3000",
  [switch]$SkipImageBuild
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$AllowedRoot = (Resolve-Path "C:\CFS_Azure_Migration").Path
if ($OutputRoot.StartsWith($RepoRoot.Path)) { throw "Refusing to write deployment artifacts inside the repository." }
if (-not ($OutputRoot.Equals($AllowedRoot, [System.StringComparison]::OrdinalIgnoreCase) -or $OutputRoot.StartsWith($AllowedRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase))) {
  throw "Refusing to write deployment artifacts outside C:\CFS_Azure_Migration."
}
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

function Invoke-Az {
  param([Parameter(ValueFromRemainingArguments = $true)][object[]]$Args)
  if ($Args.Count -eq 1 -and $Args[0] -is [System.Array]) { $Args = @($Args[0]) }
  & az @Args --only-show-errors
  if ($LASTEXITCODE -ne 0) { throw "az $($Args -join ' ') failed." }
}

function Get-AzJsonOrNull {
  param([Parameter(ValueFromRemainingArguments = $true)][object[]]$Args)
  if ($Args.Count -eq 1 -and $Args[0] -is [System.Array]) { $Args = @($Args[0]) }
  $PreviousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $Json = & az @Args --only-show-errors 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $Json) { return $null }
    return $Json | ConvertFrom-Json
  } finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
}

function Get-AzTsvOrNull {
  param([Parameter(ValueFromRemainingArguments = $true)][object[]]$Args)
  if ($Args.Count -eq 1 -and $Args[0] -is [System.Array]) { $Args = @($Args[0]) }
  $PreviousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $Value = & az @Args --only-show-errors 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return $Value
  } finally {
    $ErrorActionPreference = $PreviousErrorActionPreference
  }
}

function Get-Suffix {
  $subscription = az account show --query id -o tsv
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($subscription + $ResourceGroup))
    -join ($bytes[0..4] | ForEach-Object { $_.ToString("x2") })
  } finally {
    $sha.Dispose()
  }
}

function Set-KeyVaultSecretValue {
  param([string]$Name, [string]$Value)
  for ($attempt = 1; $attempt -le 12; $attempt++) {
    az keyvault secret set --vault-name $KeyVaultName --name $Name --value $Value -o none 2>$null
    if ($LASTEXITCODE -eq 0) { return }
    Start-Sleep -Seconds 10
  }
  throw "Failed to set Key Vault secret $Name."
}

if (-not $ImageTag) {
  $ImageTag = (git -C $RepoRoot rev-parse --short=12 HEAD).Trim()
}
$Suffix = Get-Suffix
$AcrName = "cfsacr$Suffix"
$KeyVaultName = "cfs-kv-$($Suffix.Substring(0, 8))"
$WorkspaceName = "cfs-api-law"
$AppInsightsName = "cfs-api-ai"

$ExistingGroup = Get-AzJsonOrNull @("group", "show", "-n", $ResourceGroup, "-o", "json")
if (-not $ExistingGroup) {
  Invoke-Az @("group", "create", "-n", $ResourceGroup, "-l", $Location, "-o", "none")
}

$Identity = Get-AzJsonOrNull @("identity", "show", "-g", $ResourceGroup, "-n", $IdentityName, "-o", "json")
if (-not $Identity) {
  $Identity = az identity create -g $ResourceGroup -n $IdentityName -l $Location -o json | ConvertFrom-Json
}
$IdentityId = $Identity.id
$ClientId = $Identity.clientId
$PrincipalId = $Identity.principalId

$Acr = Get-AzJsonOrNull @("acr", "show", "-g", $ResourceGroup, "-n", $AcrName, "-o", "json")
if (-not $Acr) {
  $Acr = az acr create -g $ResourceGroup -n $AcrName -l $Location --sku Basic --admin-enabled false --public-network-enabled true -o json | ConvertFrom-Json
}
Invoke-Az @("acr", "update", "-n", $AcrName, "--anonymous-pull-enabled", "false", "-o", "none")
$AcrId = $Acr.id
$LoginServer = $Acr.loginServer
az role assignment create --assignee-object-id $PrincipalId --assignee-principal-type ServicePrincipal --role AcrPull --scope $AcrId -o none 2>$null

$Vault = Get-AzJsonOrNull @("keyvault", "show", "-g", $ResourceGroup, "-n", $KeyVaultName, "-o", "json")
if (-not $Vault) {
  $Vault = az keyvault create -g $ResourceGroup -n $KeyVaultName -l $Location --enable-rbac-authorization true -o json | ConvertFrom-Json
}
$VaultUri = $Vault.properties.vaultUri
az role assignment create --assignee-object-id $PrincipalId --assignee-principal-type ServicePrincipal --role "Key Vault Secrets User" --scope $Vault.id -o none 2>$null
$SignedInObjectId = Get-AzTsvOrNull @("ad", "signed-in-user", "show", "--query", "id", "-o", "tsv")
if ($SignedInObjectId) {
  az role assignment create --assignee-object-id $SignedInObjectId --assignee-principal-type User --role "Key Vault Secrets Officer" --scope $Vault.id -o none 2>$null
}

$ExistingStagingSecret = Get-AzTsvOrNull @("keyvault", "secret", "show", "--vault-name", $KeyVaultName, "--name", "cfs-staging-access-token", "--query", "id", "-o", "tsv")
if (-not $ExistingStagingSecret) {
  $SecretBytes = [byte[]]::new(32)
  $Rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $Rng.GetBytes($SecretBytes)
  } finally {
    $Rng.Dispose()
  }
  $StagingToken = [Convert]::ToBase64String($SecretBytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
  Set-KeyVaultSecretValue -Name cfs-staging-access-token -Value $StagingToken
  Remove-Variable StagingToken -ErrorAction SilentlyContinue
}
if ($env:OPENAI_API_KEY) {
  Set-KeyVaultSecretValue -Name openai-api-key -Value $env:OPENAI_API_KEY
}
if ($env:CENSUS_API_KEY) {
  Set-KeyVaultSecretValue -Name census-api-key -Value $env:CENSUS_API_KEY
}

$Workspace = Get-AzJsonOrNull @("monitor", "log-analytics", "workspace", "show", "-g", $ResourceGroup, "-n", $WorkspaceName, "-o", "json")
if (-not $Workspace) {
  $Workspace = az monitor log-analytics workspace create -g $ResourceGroup -n $WorkspaceName -l $Location -o json | ConvertFrom-Json
}
$WorkspaceId = az monitor log-analytics workspace show -g $ResourceGroup -n $WorkspaceName --query customerId -o tsv
$WorkspaceKey = az monitor log-analytics workspace get-shared-keys -g $ResourceGroup -n $WorkspaceName --query primarySharedKey -o tsv

$AppInsightsExtension = Get-AzJsonOrNull @("extension", "show", "--name", "application-insights", "-o", "json")
if (-not $AppInsightsExtension) {
  Invoke-Az @("extension", "add", "--name", "application-insights", "--allow-preview", "true", "--yes", "--upgrade", "-o", "none")
}
$AppInsights = Get-AzJsonOrNull @("monitor", "app-insights", "component", "show", "-g", $ResourceGroup, "-a", $AppInsightsName, "-o", "json")
if (-not $AppInsights) {
  $AppInsights = az monitor app-insights component create -g $ResourceGroup -a $AppInsightsName -l $Location --application-type web --workspace $Workspace.id -o json | ConvertFrom-Json
}
$AiConnectionString = az monitor app-insights component show -g $ResourceGroup -a $AppInsightsName --query connectionString -o tsv
if ($AiConnectionString) {
  Set-KeyVaultSecretValue -Name applicationinsights-connection-string -Value $AiConnectionString
}

$Environment = Get-AzJsonOrNull @("containerapp", "env", "show", "-g", $ResourceGroup, "-n", $ContainerEnvironmentName, "-o", "json")
if (-not $Environment) {
  Invoke-Az @("containerapp", "env", "create", "-g", $ResourceGroup, "-n", $ContainerEnvironmentName, "-l", $Location, "--logs-workspace-id", $WorkspaceId, "--logs-workspace-key", $WorkspaceKey, "-o", "none")
}

$AzureServicesFirewallRule = Get-AzJsonOrNull @("postgres", "flexible-server", "firewall-rule", "show", "-g", $PostgresResourceGroup, "-s", $PostgresServerName, "-n", "AllowAzureServicesForCfsApi", "-o", "json")
if (-not $AzureServicesFirewallRule) {
  Invoke-Az @(
    "postgres", "flexible-server", "firewall-rule", "create",
    "-g", $PostgresResourceGroup,
    "-s", $PostgresServerName,
    "-n", "AllowAzureServicesForCfsApi",
    "--start-ip-address", "0.0.0.0",
    "--end-ip-address", "0.0.0.0",
    "-o", "none"
  )
}

$Image = "$LoginServer/$Repository`:$ImageTag"
if (-not $SkipImageBuild) {
  docker build -f (Join-Path $RepoRoot "backend\Dockerfile") -t $Image (Join-Path $RepoRoot "backend")
  if ($LASTEXITCODE -ne 0) { throw "Docker build failed." }
  Invoke-Az @("acr", "login", "-n", $AcrName, "-o", "none")
  docker push $Image
  if ($LASTEXITCODE -ne 0) { throw "Docker push failed." }
}

$App = Get-AzJsonOrNull @("containerapp", "show", "-g", $ResourceGroup, "-n", $ContainerAppName, "-o", "json")
if (-not $App) {
  Invoke-Az @(
    "containerapp", "create",
    "-g", $ResourceGroup,
    "-n", $ContainerAppName,
    "--environment", $ContainerEnvironmentName,
    "--image", $Image,
    "--user-assigned", $IdentityId,
    "--registry-server", $LoginServer,
    "--registry-identity", $IdentityId,
    "--ingress", "external",
    "--target-port", "8000",
    "--transport", "http",
    "--revisions-mode", "single",
    "--min-replicas", "1",
    "--max-replicas", "1",
    "--cpu", "0.5",
    "--memory", "1.0Gi",
    "--revision-suffix", $ImageTag,
    "-o", "none"
  )
} else {
  $CurrentImage = $App.properties.template.containers[0].image
  if ($CurrentImage -ne $Image) {
    Invoke-Az @("containerapp", "update", "-g", $ResourceGroup, "-n", $ContainerAppName, "--image", $Image, "--revision-suffix", $ImageTag, "-o", "none")
  }
}

$SecretArgs = @(
  "staging-token=keyvaultref:$($VaultUri)secrets/cfs-staging-access-token,identityref:$IdentityId",
  "appinsights=keyvaultref:$($VaultUri)secrets/applicationinsights-connection-string,identityref:$IdentityId"
)
$OpenAiSecret = Get-AzTsvOrNull @("keyvault", "secret", "show", "--vault-name", $KeyVaultName, "--name", "openai-api-key", "--query", "id", "-o", "tsv")
if ($OpenAiSecret) { $SecretArgs += "openai-key=keyvaultref:$($VaultUri)secrets/openai-api-key,identityref:$IdentityId" }
$CensusSecret = Get-AzTsvOrNull @("keyvault", "secret", "show", "--vault-name", $KeyVaultName, "--name", "census-api-key", "--query", "id", "-o", "tsv")
if ($CensusSecret) { $SecretArgs += "census-key=keyvaultref:$($VaultUri)secrets/census-api-key,identityref:$IdentityId" }
$SecretSetArgs = @("containerapp", "secret", "set", "-g", $ResourceGroup, "-n", $ContainerAppName, "--secrets") + $SecretArgs + @("-o", "none")
Invoke-Az $SecretSetArgs

$EnvVars = @(
  "APP_ENV=prod",
  "CFS_DATABASE_AUTH_MODE=managed_identity",
  "CFS_AZURE_POSTGRES_HOST=$PostgresServer",
  "CFS_AZURE_POSTGRES_DATABASE=$PostgresDatabase",
  "CFS_AZURE_POSTGRES_USER=$IdentityName",
  "AZURE_CLIENT_ID=$ClientId",
  "CFS_STAGING_PROTECT_API=true",
  "CFS_STAGING_ACCESS_TOKEN=secretref:staging-token",
  "CFS_ENABLE_DOCS=false",
  "CFS_TELEMETRY_ENABLED=true",
  "APPLICATIONINSIGHTS_CONNECTION_STRING=secretref:appinsights",
  "CFS_DATABASE_POOL_SIZE=2",
  "CFS_DATABASE_MAX_OVERFLOW=1",
  "CFS_DATABASE_POOL_TIMEOUT_SECONDS=10",
  "CFS_DATABASE_POOL_RECYCLE_SECONDS=2700",
  "CORS_ALLOWED_ORIGINS=$AllowedOrigins",
  "CFS_AI_ENABLED=true",
  "CFS_AI_PROVIDER=openai",
  "CFS_AI_MODEL=gpt-4o-mini",
  "CFS_AI_PROVIDER_TIMEOUT_SECONDS=6"
)
if ($OpenAiSecret) { $EnvVars += "OPENAI_API_KEY=secretref:openai-key" }
if ($CensusSecret) { $EnvVars += "CENSUS_API_KEY=secretref:census-key" }
$EnvVarArgs = @("containerapp", "update", "-g", $ResourceGroup, "-n", $ContainerAppName, "--set-env-vars") + $EnvVars + @("-o", "none")
Invoke-Az $EnvVarArgs

$Origins = $AllowedOrigins.Split(",") | Where-Object { $_ }
$CorsArgs = @("containerapp", "ingress", "cors", "enable", "-g", $ResourceGroup, "-n", $ContainerAppName, "--allowed-origins") + $Origins + @("--allowed-methods", "GET", "POST", "PATCH", "DELETE", "OPTIONS", "--allowed-headers", "Accept", "Authorization", "Content-Type", "X-CFS-Staging-Token", "-o", "none")
Invoke-Az $CorsArgs

$App = az containerapp show -g $ResourceGroup -n $ContainerAppName -o json | ConvertFrom-Json
$Probes = @(
  @{ type = "Startup"; httpGet = @{ path = "/health"; port = 8000; scheme = "HTTP" }; initialDelaySeconds = 10; periodSeconds = 10; timeoutSeconds = 3; failureThreshold = 12 },
  @{ type = "Liveness"; httpGet = @{ path = "/health"; port = 8000; scheme = "HTTP" }; initialDelaySeconds = 30; periodSeconds = 30; timeoutSeconds = 3; failureThreshold = 3 },
  @{ type = "Readiness"; httpGet = @{ path = "/health/ready"; port = 8000; scheme = "HTTP" }; initialDelaySeconds = 20; periodSeconds = 20; timeoutSeconds = 5; failureThreshold = 3 }
)
$Container = $App.properties.template.containers[0]
if ($Container.PSObject.Properties.Name -contains "probes") {
  $Container.probes = $Probes
} else {
  $Container | Add-Member -NotePropertyName probes -NotePropertyValue $Probes -Force
}
$PatchPath = Join-Path $OutputRoot "containerapp-probes-patch.json"
$ContainerPatch = [ordered]@{
  name = $Container.name
  image = $Container.image
  env = $Container.env
  resources = $Container.resources
  probes = $Probes
}
@{ properties = @{ template = @{ containers = @($ContainerPatch) } } } | ConvertTo-Json -Depth 100 | Set-Content -Path $PatchPath -Encoding utf8
Invoke-Az @("rest", "--method", "PATCH", "--url", "https://management.azure.com$($App.id)?api-version=2024-03-01", "--body", "@$PatchPath", "-o", "none")

$Digest = Get-AzTsvOrNull @("acr", "manifest", "list-metadata", "-r", $AcrName, "-n", $Repository, "--query", "[?tags != null && contains(tags, '$ImageTag')].digest | [0]", "-o", "tsv", "--only-show-errors")
$Fqdn = az containerapp show -g $ResourceGroup -n $ContainerAppName --query properties.configuration.ingress.fqdn -o tsv

[ordered]@{
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  resource_group = $ResourceGroup
  location = $Location
  identity_name = $IdentityName
  identity_client_id = $ClientId
  identity_principal_id = $PrincipalId
  acr_name = $AcrName
  repository = $Repository
  image_tag = $ImageTag
  image = $Image
  image_digest = $Digest
  key_vault_name = $KeyVaultName
  log_analytics_workspace = $WorkspaceName
  application_insights = $AppInsightsName
  container_environment = $ContainerEnvironmentName
  container_app = $ContainerAppName
  fqdn = $Fqdn
  min_replicas = 1
  max_replicas = 1
} | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $OutputRoot "cfs-api-containerapp-manifest.json") -Encoding utf8

Write-Output "container_app_fqdn=$Fqdn"
Write-Output "image_digest=$Digest"
