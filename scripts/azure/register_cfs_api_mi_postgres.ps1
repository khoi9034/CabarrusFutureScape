param(
  [string]$ResourceGroup = "CFS",
  [string]$ServerName = "cfs",
  [string]$HostName = "cfs.postgres.database.azure.com",
  [string]$Database = "cfs_cloud",
  [string]$IdentityName = "cfs-api-mi",
  [string]$IdentityResourceGroup = "CFS",
  [string]$OutputRoot = "C:\CFS_Azure_Migration\az2_container_apps"
)

$ErrorActionPreference = "Stop"
$PgBin = "C:\Program Files\PostgreSQL\18\bin"
$Psql = Join-Path $PgBin "psql.exe"
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

$Identity = az identity show -g $IdentityResourceGroup -n $IdentityName -o json | ConvertFrom-Json
$Admins = az postgres flexible-server microsoft-entra-admin list --resource-group $ResourceGroup --server-name $ServerName -o json | ConvertFrom-Json
if (-not $Admins) { throw "No Microsoft Entra administrator is configured." }

$env:PGHOST = $HostName
$env:PGPORT = "5432"
$env:PGDATABASE = "postgres"
$env:PGUSER = @($Admins)[0].principalName
$env:PGSSLMODE = "require"
$env:PGPASSWORD = az account get-access-token --resource https://ossrdbms-aad.database.windows.net --query accessToken -o tsv
try {
  if (-not $env:PGPASSWORD) { throw "Failed to get Entra token." }
  & $Psql -X -v ON_ERROR_STOP=1 -v "principal_name=$IdentityName" -v "object_id=$($Identity.principalId)" -f scripts\azure\register_cfs_api_mi_postgres.sql | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Managed identity PostgreSQL registration failed." }

  $env:PGDATABASE = $Database
  $PrincipalSqlLiteral = $IdentityName.Replace("'", "''")
  $CheckSql = @'
SELECT jsonb_build_object(
  'can_insert_candidate', has_table_privilege('__PRINCIPAL__','public.investment_candidate_intake','INSERT'),
  'can_insert_analytical', has_table_privilege('__PRINCIPAL__','public.development_activity_parcel_summary','INSERT'),
  'can_select_analytical', has_table_privilege('__PRINCIPAL__','public.development_activity_parcel_summary','SELECT'),
  'can_create_public', has_schema_privilege('__PRINCIPAL__','public','CREATE')
)::text;
'@
  $Result = & $Psql -X -qAt -v ON_ERROR_STOP=1 -c $CheckSql.Replace("__PRINCIPAL__", $PrincipalSqlLiteral)
  if ($LASTEXITCODE -ne 0) { throw "Managed identity PostgreSQL validation failed." }
  $Result | Set-Content -Path (Join-Path $OutputRoot "cfs-api-mi-postgres-permissions.json") -Encoding utf8
  Write-Output $Result
} finally {
  foreach ($Name in "PGPASSWORD", "PGUSER", "PGHOST", "PGPORT", "PGDATABASE", "PGSSLMODE") {
    Remove-Item "Env:\$Name" -ErrorAction SilentlyContinue
  }
}
