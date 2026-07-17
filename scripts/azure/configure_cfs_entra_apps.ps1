param(
  [string]$ApiAppName = "cfs-api-staging",
  [string]$WebAppName = "cfs-web-staging",
  [string[]]$RedirectUris = @("http://localhost:3000"),
  [string]$OutputRoot = "C:\CFS_Azure_Migration\az3_entra",
  [switch]$SkipSignedInUserRoleAssignment
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
if ($OutputRoot.StartsWith($RepoRoot.Path)) { throw "Refusing to write Entra output inside the repository." }
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
$RedirectUris = @(
  $RedirectUris |
    ForEach-Object { $_ -split "," } |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ }
)

function Invoke-Az {
  param([Parameter(ValueFromRemainingArguments = $true)][object[]]$Args)
  if ($Args.Count -eq 1 -and $Args[0] -is [System.Array]) { $Args = @($Args[0]) }
  & az @Args --only-show-errors
  if ($LASTEXITCODE -ne 0) { throw "az $($Args -join ' ') failed." }
}

function Get-AppByName([string]$DisplayName) {
  $Apps = az ad app list --display-name $DisplayName -o json | ConvertFrom-Json
  @($Apps)[0]
}

function Ensure-App([string]$DisplayName) {
  $App = Get-AppByName $DisplayName
  if ($App) { return $App }
  az ad app create --display-name $DisplayName -o json | ConvertFrom-Json
}

function Ensure-ServicePrincipal([string]$AppId) {
  $Existing = az ad sp show --id $AppId --only-show-errors -o json 2>$null
  if ($LASTEXITCODE -eq 0 -and $Existing) { return $Existing | ConvertFrom-Json }
  az ad sp create --id $AppId --only-show-errors -o json | ConvertFrom-Json
}

$TenantId = az account show --query tenantId -o tsv
$SignedInObjectId = az ad signed-in-user show --query id -o tsv
$ApiApp = Ensure-App $ApiAppName
$ExistingScope = @($ApiApp.api.oauth2PermissionScopes) | Where-Object { $_.value -eq "CFS.Access" } | Select-Object -First 1
$ExistingWriteRole = @($ApiApp.appRoles) | Where-Object { $_.value -eq "CFS.Write" } | Select-Object -First 1
$ExistingAdminRole = @($ApiApp.appRoles) | Where-Object { $_.value -eq "CFS.Admin" } | Select-Object -First 1
$ApiScopeId = if ($ExistingScope) { $ExistingScope.id } else { [guid]::NewGuid().Guid }
$WriteRoleId = if ($ExistingWriteRole) { $ExistingWriteRole.id } else { [guid]::NewGuid().Guid }
$AdminRoleId = if ($ExistingAdminRole) { $ExistingAdminRole.id } else { [guid]::NewGuid().Guid }
$IdentifierUri = "api://$($ApiApp.appId)"

$ApiPatch = @{
  identifierUris = @($IdentifierUri)
  api = @{
    oauth2PermissionScopes = @(
      @{
        adminConsentDescription = "Access Cabarrus FutureScape staging API"
        adminConsentDisplayName = "Access CFS staging API"
        id = $ApiScopeId
        isEnabled = $true
        type = "User"
        userConsentDescription = "Access Cabarrus FutureScape staging API"
        userConsentDisplayName = "Access CFS staging API"
        value = "CFS.Access"
      }
    )
  }
  appRoles = @(
    @{
      allowedMemberTypes = @("User")
      description = "Write approved CFS staging workflow records"
      displayName = "CFS Write"
      id = $WriteRoleId
      isEnabled = $true
      value = "CFS.Write"
    },
    @{
      allowedMemberTypes = @("User")
      description = "Run CFS staging administrative diagnostics"
      displayName = "CFS Admin"
      id = $AdminRoleId
      isEnabled = $true
      value = "CFS.Admin"
    }
  )
} | ConvertTo-Json -Depth 8
$ApiPatchPath = Join-Path $OutputRoot "api-app-patch.json"
$ApiPatch | Set-Content -Path $ApiPatchPath -Encoding utf8
Invoke-Az @("rest", "--method", "PATCH", "--uri", "https://graph.microsoft.com/v1.0/applications/$($ApiApp.id)", "--body", "@$ApiPatchPath", "-o", "none")

$WebApp = Ensure-App $WebAppName
$RequiredAccess = @{
  requiredResourceAccess = @(
    @{
      resourceAppId = $ApiApp.appId
      resourceAccess = @(
        @{ id = $ApiScopeId; type = "Scope" }
      )
    }
  )
  spa = @{
    redirectUris = @($RedirectUris | Where-Object { $_ })
  }
} | ConvertTo-Json -Depth 8
$WebPatchPath = Join-Path $OutputRoot "web-app-patch.json"
$RequiredAccess | Set-Content -Path $WebPatchPath -Encoding utf8
Invoke-Az @("rest", "--method", "PATCH", "--uri", "https://graph.microsoft.com/v1.0/applications/$($WebApp.id)", "--body", "@$WebPatchPath", "-o", "none")
$ApiSp = Ensure-ServicePrincipal $ApiApp.appId
Ensure-ServicePrincipal $WebApp.appId | Out-Null
az ad app permission admin-consent --id $WebApp.appId --only-show-errors -o none 2>$null
if (-not $SkipSignedInUserRoleAssignment -and $SignedInObjectId) {
  $ExistingAssignments = az rest --method GET --uri "https://graph.microsoft.com/v1.0/users/$SignedInObjectId/appRoleAssignments" -o json | ConvertFrom-Json
  foreach ($RoleValue in @("CFS.Write", "CFS.Admin")) {
    $Role = @($ApiSp.appRoles) | Where-Object { $_.value -eq $RoleValue } | Select-Object -First 1
    $AlreadyAssigned = @($ExistingAssignments.value) | Where-Object { $_.resourceId -eq $ApiSp.id -and $_.appRoleId -eq $Role.id } | Select-Object -First 1
    if ($Role -and -not $AlreadyAssigned) {
      $Body = @{
        principalId = $SignedInObjectId
        resourceId = $ApiSp.id
        appRoleId = $Role.id
      } | ConvertTo-Json
      $RoleBodyPath = Join-Path $OutputRoot "assign-$RoleValue.json"
      $Body | Set-Content -Path $RoleBodyPath -Encoding utf8
      Invoke-Az @("rest", "--method", "POST", "--uri", "https://graph.microsoft.com/v1.0/users/$SignedInObjectId/appRoleAssignments", "--headers", "Content-Type=application/json", "--body", "@$RoleBodyPath", "-o", "none")
    }
  }
}

$Manifest = [ordered]@{
  tenant_id = $TenantId
  api_app_name = $ApiAppName
  api_client_id = $ApiApp.appId
  api_audience = $IdentifierUri
  api_scope = "$IdentifierUri/CFS.Access"
  web_app_name = $WebAppName
  web_client_id = $WebApp.appId
  allowed_object_id_for_initial_staging = $SignedInObjectId
  signed_in_user_roles_assigned = -not $SkipSignedInUserRoleAssignment
  write_role = "CFS.Write"
  admin_role = "CFS.Admin"
  redirect_uris = $RedirectUris
}
$ManifestPath = Join-Path $OutputRoot "cfs-entra-apps.json"
$Manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $ManifestPath -Encoding utf8
[pscustomobject]@{
  api_app_name = $Manifest.api_app_name
  api_client_id = $Manifest.api_client_id
  api_audience = $Manifest.api_audience
  api_scope = $Manifest.api_scope
  web_app_name = $Manifest.web_app_name
  web_client_id = $Manifest.web_client_id
  write_role = $Manifest.write_role
  admin_role = $Manifest.admin_role
  redirect_uris = $Manifest.redirect_uris
} | ConvertTo-Json -Depth 4
