$ErrorActionPreference = "Stop"
$PgBin = "C:\Program Files\PostgreSQL\18\bin"
if (!(Test-Path $PgBin)) {
  throw "PostgreSQL 18 client tools were not found at $PgBin"
}
$PgDumpVersion = & (Join-Path $PgBin "pg_dump.exe") --version
if ($LASTEXITCODE -ne 0 -or $PgDumpVersion -notmatch "PostgreSQL\) 18\.") {
  throw "PostgreSQL 18 client tools are required."
}

$env:DATABASE_URL = ""
$env:POSTGRES_HOST = "localhost"
$env:POSTGRES_PORT = "5433"
$env:POSTGRES_DB = "cfs_cloud_stage"

Push-Location (Join-Path $PSScriptRoot "..\..")
try {
  npm run typecheck
  npm run lint
  npm run build -- --webpack
  python -m compileall backend
  python -m pytest backend -q
  npm run check:presentation
} finally {
  Pop-Location
}
