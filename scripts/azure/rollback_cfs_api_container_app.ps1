param(
  [string]$ResourceGroup = "CFS",
  [string]$ContainerAppName = "cfs-api-staging",
  [string]$AcrName = "cfsacr792a9f873a",
  [string]$Repository = "cfs-api",
  [string]$RevisionName = "",
  [string]$ImageTag = "",
  [switch]$List
)

$ErrorActionPreference = "Stop"

function Invoke-Az {
  param([Parameter(ValueFromRemainingArguments = $true)][object[]]$Args)
  & az @Args --only-show-errors
  if ($LASTEXITCODE -ne 0) { throw "az $($Args -join ' ') failed." }
}

if ($List -or -not $RevisionName) {
  az containerapp revision list -g $ResourceGroup -n $ContainerAppName --query "[].{name:name,active:properties.active,traffic:properties.trafficWeight,created:properties.createdTime,image:properties.template.containers[0].image}" -o table
  if (-not $RevisionName -and -not $ImageTag) { exit 0 }
}

if ($ImageTag) {
  $LoginServer = az acr show -g $ResourceGroup -n $AcrName --query loginServer -o tsv
  Invoke-Az @("containerapp", "update", "-g", $ResourceGroup, "-n", $ContainerAppName, "--image", "$LoginServer/$Repository`:$ImageTag", "-o", "none")
} else {
  Invoke-Az @("containerapp", "revision", "activate", "-g", $ResourceGroup, "-n", $ContainerAppName, "--revision", $RevisionName, "-o", "none")
  Invoke-Az @("containerapp", "ingress", "traffic", "set", "-g", $ResourceGroup, "-n", $ContainerAppName, "--revision-weight", "$RevisionName=100", "-o", "none")
}
$Fqdn = az containerapp show -g $ResourceGroup -n $ContainerAppName --query properties.configuration.ingress.fqdn -o tsv
Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 -Uri "https://$Fqdn/health" | Out-Null
$Target = if ($ImageTag) { $ImageTag } else { $RevisionName }
Write-Output "rollback_target=$Target"
